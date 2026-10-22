-- Best Value: sell (buyback) flow
-- Customer picks a variant, answers evaluation questions, gets a quote,
-- books a pickup, gets paid after inspection.

create type public.eval_section as enum ('question', 'defect', 'functional', 'accessory', 'age');
create type public.eval_input as enum ('yes_no', 'single', 'multi');
create type public.deduction_type as enum ('flat', 'percent');

create table public.evaluation_questions (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references public.categories (id) on delete cascade,
  section      public.eval_section not null,
  input_type   public.eval_input not null,
  title        text not null,
  help_text    text,
  sort_order   int not null default 0,
  is_active    boolean not null default true
);
create index evaluation_questions_category_idx on public.evaluation_questions (category_id, section, sort_order);

create table public.evaluation_options (
  id               bigint generated always as identity primary key,
  question_id      bigint not null references public.evaluation_questions (id) on delete cascade,
  label            text not null,
  image_url        text,
  deduction_type   public.deduction_type not null default 'flat',
  deduction_value  numeric(12, 2) not null default 0 check (deduction_value >= 0),
  sort_order       int not null default 0,
  constraint percent_max check (deduction_type <> 'percent' or deduction_value <= 100)
);
create index evaluation_options_question_idx on public.evaluation_options (question_id);

-- Order numbers like BV-S-000123
create sequence public.sell_order_seq;

create type public.sell_status as enum (
  'quoted',            -- quote shown, pickup booked
  'pickup_assigned',   -- agent assigned
  'picked_up',         -- device collected
  'inspected',         -- final price confirmed
  'paid',
  'cancelled'
);
create type public.payout_method as enum ('upi', 'bank', 'cash');

create table public.sell_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique
                     default 'BV-S-' || lpad(nextval('public.sell_order_seq')::text, 6, '0'),
  user_id          uuid not null references public.profiles (id),
  variant_id       bigint not null references public.device_variants (id),
  answers          jsonb not null,                  -- [{question_id, option_ids[]}]
  quoted_price     numeric(12, 2) not null check (quoted_price >= 0),
  final_price      numeric(12, 2) check (final_price >= 0),
  status           public.sell_status not null default 'quoted',
  pickup_address   jsonb not null,                  -- snapshot of address at booking
  pickup_date      date not null,
  pickup_slot      text not null,                   -- e.g. "10:00-13:00"
  payout_method    public.payout_method not null,
  payout_details   jsonb,                           -- UPI id or bank (masked in UI)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sell_orders_user_idx on public.sell_orders (user_id, created_at desc);
create index sell_orders_status_idx on public.sell_orders (status, pickup_date);
create trigger sell_orders_updated_at before update on public.sell_orders
  for each row execute function public.set_updated_at();

-- Staff-only fields live in their own table: RLS is row-level, so any column
-- on sell_orders would be readable by the customer who owns the row.
create table public.sell_order_internal (
  sell_order_id  uuid primary key references public.sell_orders (id) on delete cascade,
  assigned_to    uuid references public.profiles (id),
  staff_notes    text,
  updated_at     timestamptz not null default now()
);
create index sell_order_internal_assignee_idx on public.sell_order_internal (assigned_to);
create trigger sell_order_internal_updated_at before update on public.sell_order_internal
  for each row execute function public.set_updated_at();
