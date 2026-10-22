-- Hardening after review:
--  * lock product rows in product_id order everywhere (no deadlocks)
--  * hourly order cap per customer
--  * late payment re-reserves stock only for expired (cancelled) orders
--  * cancel_store_order releases a reservation when payment cannot start
--  * pg_cron releases expired reservations every 5 minutes

create or replace function public.release_expired_store_orders()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids  uuid[];
  v_item record;
begin
  select array_agg(id) into v_ids
    from (select id from public.orders
           where status = 'pending_payment' and expires_at < now()
           for update skip locked) o;
  if v_ids is null then
    return 0;
  end if;

  for v_item in
    select product_id, sum(qty)::int as qty
      from public.order_items
     where order_id = any (v_ids) and product_id is not null
     group by product_id
     order by product_id
  loop
    update public.products set stock = stock + v_item.qty where id = v_item.product_id;
  end loop;

  update public.orders set status = 'cancelled' where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

drop function public.create_store_order(jsonb, jsonb, int, int);

create function public.create_store_order(
  p_order jsonb, p_items jsonb, p_max_pending int, p_max_per_hour int, p_expiry_minutes int
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     uuid := (p_order ->> 'user_id')::uuid;
  v_item     jsonb;
  v_order_id uuid;
  v_order_no text;
  v_updated  int;
begin
  perform pg_advisory_xact_lock(hashtext('store_order:' || v_user::text));
  perform public.release_expired_store_orders();

  if (select count(*) from public.orders
      where user_id = v_user and created_at > now() - interval '1 hour') >= p_max_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders
      where user_id = v_user and status = 'pending_payment') >= p_max_pending then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) order by (value ->> 'product_id')::uuid
  loop
    update public.products
       set stock = stock - (v_item ->> 'qty')::int
     where id = (v_item ->> 'product_id')::uuid
       and is_active
       and price = (v_item ->> 'unit_price')::numeric
       and stock >= (v_item ->> 'qty')::int;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'stock_or_price_changed' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.orders (
    user_id, subtotal, gst_amount, shipping_fee, total, shipping_address, buyer_gstin, expires_at
  ) values (
    v_user,
    (p_order ->> 'subtotal')::numeric,
    (p_order ->> 'gst_amount')::numeric,
    (p_order ->> 'shipping_fee')::numeric,
    (p_order ->> 'total')::numeric,
    p_order -> 'shipping_address',
    nullif(p_order ->> 'buyer_gstin', ''),
    now() + make_interval(mins => p_expiry_minutes)
  )
  returning id, order_no into v_order_id, v_order_no;

  insert into public.order_items (order_id, product_id, sku, title, hsn_code, gst_rate, unit_price, qty)
  select v_order_id,
         (i ->> 'product_id')::uuid,
         i ->> 'sku',
         i ->> 'title',
         nullif(i ->> 'hsn_code', ''),
         (i ->> 'gst_rate')::numeric,
         (i ->> 'unit_price')::numeric,
         (i ->> 'qty')::int
    from jsonb_array_elements(p_items) as i;

  return v_order_no;
end;
$$;

create or replace function public.mark_store_order_paid(p_gateway_order_id text, p_payment_id text, p_amount_paise bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order   public.orders%rowtype;
  v_item    record;
  v_updated int;
begin
  select * into v_order from public.orders where gateway_order_id = p_gateway_order_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_order.payment_status = 'captured' then
    return 'already_paid';
  end if;
  if round(v_order.total * 100) <> p_amount_paise then
    return 'amount_mismatch';
  end if;

  if v_order.status = 'pending_payment' then
    update public.orders
       set status = 'paid', payment_status = 'captured', payment_ref = p_payment_id
     where id = v_order.id;
    return 'paid';
  end if;

  -- Only an order that expired (stock released) may be revived; anything
  -- staff cancelled or refunded must be refunded, not shipped.
  if v_order.status <> 'cancelled' or v_order.expires_at is null or v_order.expires_at > now() then
    update public.orders set payment_status = 'captured', payment_ref = p_payment_id where id = v_order.id;
    return 'needs_refund';
  end if;

  begin
    for v_item in
      select product_id, qty from public.order_items where order_id = v_order.id order by product_id
    loop
      update public.products set stock = stock - v_item.qty
       where id = v_item.product_id and stock >= v_item.qty;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'no_stock' using errcode = 'P0001';
      end if;
    end loop;
    update public.orders
       set status = 'paid', payment_status = 'captured', payment_ref = p_payment_id
     where id = v_order.id;
    return 'paid';
  exception when sqlstate 'P0001' then
    update public.orders set payment_status = 'captured', payment_ref = p_payment_id where id = v_order.id;
    return 'needs_refund';
  end;
end;
$$;

-- Releases an unpaid order straight away (used when payment cannot start).
create function public.cancel_store_order(p_order_no text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item     record;
begin
  select id into v_order_id from public.orders
   where order_no = p_order_no and status = 'pending_payment' and payment_status = 'pending'
   for update;
  if not found then
    return false;
  end if;

  for v_item in
    select product_id, sum(qty)::int as qty from public.order_items
     where order_id = v_order_id and product_id is not null
     group by product_id order by product_id
  loop
    update public.products set stock = stock + v_item.qty where id = v_item.product_id;
  end loop;
  update public.orders set status = 'cancelled' where id = v_order_id;
  return true;
end;
$$;

revoke all on function public.create_store_order(jsonb, jsonb, int, int, int) from public, anon, authenticated;
revoke all on function public.cancel_store_order(text) from public, anon, authenticated;
grant execute on function public.create_store_order(jsonb, jsonb, int, int, int) to service_role;
grant execute on function public.cancel_store_order(text) to service_role;

create extension if not exists pg_cron;
select cron.schedule('release-expired-store-orders', '*/5 * * * *', $$select public.release_expired_store_orders()$$);
