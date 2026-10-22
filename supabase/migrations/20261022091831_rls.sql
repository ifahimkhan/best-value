-- Best Value: Data API grants + row level security
--
-- Supabase no longer exposes new public tables to the Data API automatically,
-- so every table gets explicit GRANTs below. GRANT decides whether a role can
-- reach a table at all; RLS then decides which rows it sees.
--
-- Rules:
--   * Public can read active catalog + content.
--   * Customers read their own profile, addresses and orders.
--   * Orders are INSERTED only by the server (service role) so prices
--     are always computed server side and never trusted from the browser.
--   * Staff/admin manage everything through private.is_staff().
--   * auth.uid() / is_staff() are wrapped in (select ...) so Postgres
--     evaluates them once per query instead of once per row.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.addresses              enable row level security;
alter table public.categories             enable row level security;
alter table public.brands                 enable row level security;
alter table public.devices                enable row level security;
alter table public.device_variants        enable row level security;
alter table public.evaluation_questions   enable row level security;
alter table public.evaluation_options     enable row level security;
alter table public.sell_orders            enable row level security;
alter table public.sell_order_internal    enable row level security;
alter table public.suppliers              enable row level security;
alter table public.products               enable row level security;
alter table public.import_runs            enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.faqs                   enable row level security;

-- ---------------------------------------------------------------------------
-- Grants (start from nothing, then add exactly what each role needs)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- Public catalog + content: everyone reads, staff (authenticated) write
grant select on public.categories, public.brands, public.devices, public.device_variants,
  public.evaluation_questions, public.evaluation_options, public.products, public.faqs
  to anon, authenticated;
grant insert, update, delete on public.categories, public.brands, public.devices, public.device_variants,
  public.evaluation_questions, public.evaluation_options, public.products, public.faqs
  to authenticated;

-- Customer-owned data
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select, update on public.sell_orders, public.orders to authenticated;
grant select on public.order_items to authenticated;

-- Staff-only tables (RLS limits these to staff)
grant select, insert, update, delete on public.sell_order_internal, public.suppliers, public.import_runs
  to authenticated;

-- Newsletter: anyone can subscribe; only staff read the list
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select on public.newsletter_subscribers to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: users may only edit their own name. Email/phone are synced from
-- verified auth.users values by trigger; role is changed only by the server.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------
create policy addresses_select on public.addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy addresses_update on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_delete on public.addresses for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public catalog: read active rows; staff read all and write.
-- One read policy + separate write policies per table avoids overlapping
-- permissive policies on SELECT.
-- ---------------------------------------------------------------------------
create policy categories_read on public.categories for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy categories_insert on public.categories for insert to authenticated with check ((select private.is_staff()));
create policy categories_update on public.categories for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy categories_delete on public.categories for delete to authenticated using ((select private.is_staff()));

create policy brands_read on public.brands for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy brands_insert on public.brands for insert to authenticated with check ((select private.is_staff()));
create policy brands_update on public.brands for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy brands_delete on public.brands for delete to authenticated using ((select private.is_staff()));

create policy devices_read on public.devices for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy devices_insert on public.devices for insert to authenticated with check ((select private.is_staff()));
create policy devices_update on public.devices for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy devices_delete on public.devices for delete to authenticated using ((select private.is_staff()));

create policy variants_read on public.device_variants for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy variants_insert on public.device_variants for insert to authenticated with check ((select private.is_staff()));
create policy variants_update on public.device_variants for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy variants_delete on public.device_variants for delete to authenticated using ((select private.is_staff()));

create policy eval_q_read on public.evaluation_questions for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy eval_q_insert on public.evaluation_questions for insert to authenticated with check ((select private.is_staff()));
create policy eval_q_update on public.evaluation_questions for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy eval_q_delete on public.evaluation_questions for delete to authenticated using ((select private.is_staff()));

-- Options are visible only when their question is active
create policy eval_o_read on public.evaluation_options for select to anon, authenticated
  using (
    exists (select 1 from public.evaluation_questions q where q.id = question_id and q.is_active)
    or (select private.is_staff())
  );
create policy eval_o_insert on public.evaluation_options for insert to authenticated with check ((select private.is_staff()));
create policy eval_o_update on public.evaluation_options for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy eval_o_delete on public.evaluation_options for delete to authenticated using ((select private.is_staff()));

create policy products_read on public.products for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy products_insert on public.products for insert to authenticated with check ((select private.is_staff()));
create policy products_update on public.products for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy products_delete on public.products for delete to authenticated using ((select private.is_staff()));

create policy faqs_read on public.faqs for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy faqs_insert on public.faqs for insert to authenticated with check ((select private.is_staff()));
create policy faqs_update on public.faqs for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy faqs_delete on public.faqs for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Staff-only tables
-- ---------------------------------------------------------------------------
create policy suppliers_staff on public.suppliers for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy import_runs_staff on public.import_runs for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy sell_order_internal_staff on public.sell_order_internal for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Orders: owner reads; staff read + update. No INSERT policy on purpose:
-- orders are created by the server with the service role.
-- ---------------------------------------------------------------------------
create policy sell_orders_read on public.sell_orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy sell_orders_staff_update on public.sell_orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy orders_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy orders_staff_update on public.orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy order_items_read on public.order_items for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select private.is_staff())
  );

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
create policy newsletter_insert on public.newsletter_subscribers for insert to anon, authenticated
  with check (true);
create policy newsletter_staff_read on public.newsletter_subscribers for select to authenticated
  using ((select private.is_staff()));
