-- Best Value: row level security
-- Rules:
--   * Public can read active catalog + content.
--   * Customers read their own profile, addresses and orders.
--   * Orders are INSERTED only by the server (service role) so prices
--     are always computed server side and never trusted from the browser.
--   * Staff/admin manage everything through is_staff().

alter table public.profiles              enable row level security;
alter table public.addresses             enable row level security;
alter table public.categories            enable row level security;
alter table public.brands                enable row level security;
alter table public.devices               enable row level security;
alter table public.device_variants       enable row level security;
alter table public.evaluation_questions  enable row level security;
alter table public.evaluation_options    enable row level security;
alter table public.sell_orders           enable row level security;
alter table public.sell_order_internal   enable row level security;
alter table public.suppliers             enable row level security;
alter table public.products              enable row level security;
alter table public.import_runs           enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.faqs                  enable row level security;

-- Profiles: users may only edit their own name. Email/phone are synced from
-- verified auth.users values by trigger; role is changed only by the server.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- Addresses
create policy addresses_owner on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_staff_read on public.addresses for select
  using (public.is_staff());

-- Public catalog: read active rows, staff manage all
create policy categories_read on public.categories for select using (is_active or public.is_staff());
create policy categories_staff on public.categories for all using (public.is_staff()) with check (public.is_staff());

create policy brands_read on public.brands for select using (is_active or public.is_staff());
create policy brands_staff on public.brands for all using (public.is_staff()) with check (public.is_staff());

create policy devices_read on public.devices for select using (is_active or public.is_staff());
create policy devices_staff on public.devices for all using (public.is_staff()) with check (public.is_staff());

create policy variants_read on public.device_variants for select using (is_active or public.is_staff());
create policy variants_staff on public.device_variants for all using (public.is_staff()) with check (public.is_staff());

create policy eval_q_read on public.evaluation_questions for select using (is_active or public.is_staff());
create policy eval_q_staff on public.evaluation_questions for all using (public.is_staff()) with check (public.is_staff());

create policy eval_o_read on public.evaluation_options for select
  using (exists (
    select 1 from public.evaluation_questions q where q.id = question_id and q.is_active
  ) or public.is_staff());
create policy eval_o_staff on public.evaluation_options for all using (public.is_staff()) with check (public.is_staff());

create policy products_read on public.products for select using (is_active or public.is_staff());
create policy products_staff on public.products for all using (public.is_staff()) with check (public.is_staff());

create policy faqs_read on public.faqs for select using (is_active or public.is_staff());
create policy faqs_staff on public.faqs for all using (public.is_staff()) with check (public.is_staff());

-- Supplier feeds: staff only
create policy suppliers_staff on public.suppliers for all using (public.is_staff()) with check (public.is_staff());
create policy import_runs_staff on public.import_runs for all using (public.is_staff()) with check (public.is_staff());

-- Sell orders: owner reads, staff reads/updates; inserts via service role only
create policy sell_orders_owner_read on public.sell_orders for select using (user_id = auth.uid());
create policy sell_orders_staff_read on public.sell_orders for select using (public.is_staff());
create policy sell_orders_staff_update on public.sell_orders for update
  using (public.is_staff()) with check (public.is_staff());

-- Assignment + staff notes: never visible to customers
create policy sell_order_internal_staff on public.sell_order_internal for all
  using (public.is_staff()) with check (public.is_staff());

-- Store orders: same pattern
create policy orders_owner_read on public.orders for select using (user_id = auth.uid());
create policy orders_staff_read on public.orders for select using (public.is_staff());
create policy orders_staff_update on public.orders for update
  using (public.is_staff()) with check (public.is_staff());

create policy order_items_owner_read on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy order_items_staff_read on public.order_items for select using (public.is_staff());

-- Newsletter: anyone may subscribe, only staff may read the list
create policy newsletter_insert on public.newsletter_subscribers for insert with check (true);
create policy newsletter_staff_read on public.newsletter_subscribers for select using (public.is_staff());
