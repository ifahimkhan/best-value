-- Store checkout: stock is reserved when the order is created and released
-- if the order is not paid within its expiry window.
alter table public.orders
  add column gateway_order_id text unique,
  add column expires_at timestamptz;
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending_payment';

-- Cancels unpaid orders past expiry and returns their stock.
create function public.release_expired_store_orders()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_released int;
begin
  with expired as (
    update public.orders
       set status = 'cancelled'
     where status = 'pending_payment' and expires_at < now()
    returning id
  ), restored as (
    update public.products p
       set stock = p.stock + i.qty
      from (select product_id, sum(qty)::int as qty
              from public.order_items
             where order_id in (select id from expired) and product_id is not null
             group by product_id) i
     where p.id = i.product_id
    returning p.id
  )
  select count(*) into v_released from expired;
  return v_released;
end;
$$;

-- Creates an order atomically: per-user lock, pending-order cap, price
-- re-check and stock reservation under row locks, then order + items.
create function public.create_store_order(p_order jsonb, p_items jsonb, p_max_pending int, p_expiry_minutes int)
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
      where user_id = v_user and status = 'pending_payment') >= p_max_pending then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
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

-- Marks an order paid once the gateway confirms it. Idempotent: the
-- browser callback and the webhook may both arrive.
-- Returns: paid | already_paid | needs_refund | amount_mismatch | not_found
create function public.mark_store_order_paid(p_gateway_order_id text, p_payment_id text, p_amount_paise bigint)
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

  -- Paid after expiry: stock was released, so try to reserve it again.
  begin
    for v_item in select product_id, qty from public.order_items where order_id = v_order.id loop
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
    -- Money taken but nothing to ship: staff must refund
    update public.orders set payment_status = 'captured', payment_ref = p_payment_id where id = v_order.id;
    return 'needs_refund';
  end;
end;
$$;

revoke all on function public.release_expired_store_orders() from public, anon, authenticated;
revoke all on function public.create_store_order(jsonb, jsonb, int, int) from public, anon, authenticated;
revoke all on function public.mark_store_order_paid(text, text, bigint) from public, anon, authenticated;
grant execute on function public.release_expired_store_orders() to service_role;
grant execute on function public.create_store_order(jsonb, jsonb, int, int) to service_role;
grant execute on function public.mark_store_order_paid(text, text, bigint) to service_role;
