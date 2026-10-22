-- Phase 7: staff order management.
-- Staff (signed-in, RLS) may change only a few columns, and only along the
-- allowed status steps. Server-side code using the service role (checkout,
-- webhooks, cron) has no auth.uid() and is not restricted by these triggers.

alter table public.sell_orders
  add column payout_ref    text check (payout_ref is null or char_length(payout_ref) between 1 and 60),
  add column paid_at       timestamptz,
  add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 1 and 300);

alter table public.orders
  add column tracking_carrier text check (tracking_carrier is null or char_length(tracking_carrier) between 1 and 60),
  add column tracking_number  text check (tracking_number is null or tracking_number ~ '^[A-Za-z0-9-]{4,40}$'),
  add column shipped_at       timestamptz,
  add column delivered_at     timestamptz,
  add column refund_ref       text check (refund_ref is null or char_length(refund_ref) between 1 and 60),
  add column refunded_at      timestamptz;

-- Column-level limits: staff can no longer rewrite prices, addresses or owners
revoke update on public.sell_orders, public.orders from authenticated;
grant update (status, final_price, payout_ref, cancel_reason) on public.sell_orders to authenticated;
grant update (status, tracking_carrier, tracking_number, refund_ref) on public.orders to authenticated;

-- Audit trail of every status change, written only by the triggers below
create table public.order_events (
  id             bigint generated always as identity primary key,
  sell_order_id  uuid references public.sell_orders (id) on delete cascade,
  order_id       uuid references public.orders (id) on delete cascade,
  actor_id       uuid references public.profiles (id),
  from_status    text not null,
  to_status      text not null,
  note           text,
  created_at     timestamptz not null default now(),
  constraint order_events_one_target check ((sell_order_id is null) <> (order_id is null))
);
create index order_events_sell_order_idx on public.order_events (sell_order_id, created_at);
create index order_events_order_idx on public.order_events (order_id, created_at);
create index order_events_actor_idx on public.order_events (actor_id);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;
create policy order_events_staff_read on public.order_events for select to authenticated
  using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Sell orders (buyback)
-- quoted -> pickup_assigned -> picked_up -> inspected -> paid, cancel any time before paid
-- ---------------------------------------------------------------------------
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
  if new.payout_ref is distinct from old.payout_ref and new.status <> 'paid' then
    raise exception 'payout_ref_only_when_paid' using errcode = 'P0001';
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
  elsif new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'cancel_reason_only_when_cancelling' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_sell_order_update() from public, anon, authenticated;

create trigger sell_orders_staff_guard before update on public.sell_orders
  for each row execute function private.guard_sell_order_update();

-- ---------------------------------------------------------------------------
-- Store orders
-- pending_payment -> cancelled; paid -> packed -> shipped -> delivered;
-- paid/packed -> cancelled (restocks); cancelled (captured) / delivered -> refunded
-- ---------------------------------------------------------------------------
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
  if new.refund_ref is distinct from old.refund_ref and new.status <> 'refunded' then
    raise exception 'refund_ref_only_when_refunded' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'pending_payment' then array['cancelled']
      when 'paid' then array['packed', 'cancelled']
      when 'packed' then array['shipped', 'cancelled']
      when 'shipped' then array['delivered']
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
      -- Put reserved or sold units back on sale
      for v_item in
        select product_id, qty from public.order_items where order_id = new.id and product_id is not null
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

create trigger orders_staff_guard before update on public.orders
  for each row execute function private.guard_store_order_update();
