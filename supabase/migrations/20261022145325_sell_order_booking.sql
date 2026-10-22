-- Full bank account numbers live in a staff-only table, never on the
-- customer-readable sell_orders row (which keeps only last 4 digits + IFSC).
create table public.sell_order_bank_accounts (
  sell_order_id   uuid primary key references public.sell_orders (id) on delete cascade,
  account_number  text not null check (account_number ~ '^[0-9]{9,18}$'),
  created_at      timestamptz not null default now()
);
alter table public.sell_order_bank_accounts enable row level security;
revoke all on public.sell_order_bank_accounts from anon, authenticated;
grant select on public.sell_order_bank_accounts to authenticated;
create policy sell_order_bank_accounts_staff_read on public.sell_order_bank_accounts
  for select to authenticated using ((select private.is_staff()));

-- Books a pickup atomically: per-user advisory lock, 24h rate limit, order
-- insert and bank details in one transaction. Called only by the server
-- (service role) after it has re-priced the quote.
create function public.create_sell_order(p_order jsonb, p_account_number text, p_max_per_day int)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     uuid := (p_order ->> 'user_id')::uuid;
  v_id       uuid;
  v_order_no text;
begin
  perform pg_advisory_xact_lock(hashtext('sell_order:' || v_user::text));

  if (select count(*) from public.sell_orders
      where user_id = v_user and created_at > now() - interval '24 hours') >= p_max_per_day then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.sell_orders (
    user_id, variant_id, answers, quoted_price, pickup_address,
    pickup_date, pickup_slot, payout_method, payout_details
  ) values (
    v_user,
    (p_order ->> 'variant_id')::bigint,
    p_order -> 'answers',
    (p_order ->> 'quoted_price')::numeric,
    p_order -> 'pickup_address',
    (p_order ->> 'pickup_date')::date,
    p_order ->> 'pickup_slot',
    (p_order ->> 'payout_method')::public.payout_method,
    nullif(p_order -> 'payout_details', 'null'::jsonb)
  )
  returning id, order_no into v_id, v_order_no;

  if p_account_number is not null then
    insert into public.sell_order_bank_accounts (sell_order_id, account_number)
    values (v_id, p_account_number);
  end if;

  return v_order_no;
end;
$$;

revoke all on function public.create_sell_order(jsonb, text, int) from public, anon, authenticated;
grant execute on function public.create_sell_order(jsonb, text, int) to service_role;
