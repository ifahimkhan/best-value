-- Phase 7 review fixes.
-- * Payout and refund references are frozen once the order is paid / refunded.
-- * cancel_reason may only be written when the order is being (or is) cancelled.
-- * Shipped parcels that come back (returned to origin) can be cancelled.
-- * Restock locks product rows in a fixed order to avoid deadlocks.
-- * A late payment webhook never revives an order that staff already refunded.

create or replace function private.guard_sell_order_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_allowed text[];
begin
  if v_actor is null then
    return new; -- service role / server code
  end if;

  if new.final_price is distinct from old.final_price
     and not (old.status in ('picked_up', 'inspected') and new.status in ('picked_up', 'inspected')) then
    raise exception 'final_price_locked' using errcode = 'P0001';
  end if;
  if new.payout_ref is distinct from old.payout_ref then
    if old.status = 'paid' then
      raise exception 'payout_ref_locked' using errcode = 'P0001';
    end if;
    if new.status <> 'paid' then
      raise exception 'payout_ref_only_when_paid' using errcode = 'P0001';
    end if;
  end if;
  if new.cancel_reason is distinct from old.cancel_reason
     and (new.status <> 'cancelled' or old.status = 'cancelled') then
    raise exception 'cancel_reason_only_when_cancelling' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'quoted' then array['pickup_assigned', 'cancelled']
      when 'pickup_assigned' then array['quoted', 'picked_up', 'cancelled']
      when 'picked_up' then array['inspected', 'cancelled']
      when 'inspected' then array['paid', 'cancelled']
      else array[]::text[]
    end;
    if not (new.status::text = any (v_allowed)) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if new.status in ('inspected', 'paid') and new.final_price is null then
      raise exception 'final_price_required' using errcode = 'P0001';
    end if;
    if new.status = 'paid' then
      if new.payout_ref is null then
        raise exception 'payout_ref_required' using errcode = 'P0001';
      end if;
      new.paid_at := now();
    end if;
    if new.status = 'cancelled' and new.cancel_reason is null then
      raise exception 'cancel_reason_required' using errcode = 'P0001';
    end if;
    insert into public.order_events (sell_order_id, actor_id, from_status, to_status, note)
    values (new.id, v_actor, old.status::text, new.status::text, new.cancel_reason);
  end if;
  return new;
end;
$$;
revoke all on function private.guard_sell_order_update() from public, anon, authenticated;

create or replace function private.guard_store_order_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_allowed text[];
  v_item record;
begin
  if v_actor is null then
    return new; -- checkout functions, webhooks, cron
  end if;

  if (new.tracking_carrier is distinct from old.tracking_carrier or new.tracking_number is distinct from old.tracking_number)
     and new.status not in ('packed', 'shipped') then
    raise exception 'tracking_locked' using errcode = 'P0001';
  end if;
  if new.refund_ref is distinct from old.refund_ref then
    if old.status = 'refunded' then
      raise exception 'refund_ref_locked' using errcode = 'P0001';
    end if;
    if new.status <> 'refunded' then
      raise exception 'refund_ref_only_when_refunded' using errcode = 'P0001';
    end if;
  end if;

  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'pending_payment' then array['cancelled']
      when 'paid' then array['packed', 'cancelled']
      when 'packed' then array['shipped', 'cancelled']
      when 'shipped' then array['delivered', 'cancelled']
      when 'delivered' then array['refunded']
      when 'cancelled' then array['refunded']
      else array[]::text[]
    end;
    if not (new.status::text = any (v_allowed)) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if new.status = 'shipped' then
      if new.tracking_number is null then
        raise exception 'tracking_required' using errcode = 'P0001';
      end if;
      new.shipped_at := now();
    end if;
    if new.status = 'delivered' then
      new.delivered_at := now();
    end if;
    if new.status = 'refunded' then
      if old.payment_status <> 'captured' then
        raise exception 'nothing_to_refund' using errcode = 'P0001';
      end if;
      if new.refund_ref is null then
        raise exception 'refund_ref_required' using errcode = 'P0001';
      end if;
      new.payment_status := 'refunded';
      new.refunded_at := now();
    end if;
    if new.status = 'cancelled' then
      -- Put reserved, sold or returned units back on sale; fixed lock order
      for v_item in
        select product_id, sum(qty)::int as qty
          from public.order_items
         where order_id = new.id and product_id is not null
         group by product_id
         order by product_id
      loop
        update public.products set stock = stock + v_item.qty where id = v_item.product_id;
      end loop;
      if old.status = 'pending_payment' then
        new.expires_at := null;
      end if;
    end if;
    insert into public.order_events (order_id, actor_id, from_status, to_status, note)
    values (new.id, v_actor, old.status::text, new.status::text, coalesce(new.refund_ref, new.tracking_number));
  end if;
  return new;
end;
$$;
revoke all on function private.guard_store_order_update() from public, anon, authenticated;

create or replace function public.mark_store_order_paid(p_gateway_order_id text, p_payment_id text, p_amount_paise bigint)
returns text language plpgsql set search_path = '' as $$
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
  -- Money already went back to the buyer; never reopen the order
  if v_order.payment_status = 'refunded' or v_order.status = 'refunded' then
    return 'already_refunded';
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
  -- staff cancelled must be refunded, not shipped.
  if v_order.status <> 'cancelled' or v_order.expires_at is null or v_order.expires_at > now() then
    update public.orders set payment_status = 'captured', payment_ref = p_payment_id where id = v_order.id;
    return 'needs_refund';
  end if;

  begin
    for v_item in
      select product_id, sum(qty)::int as qty
        from public.order_items
       where order_id = v_order.id
       group by product_id
       order by product_id
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
