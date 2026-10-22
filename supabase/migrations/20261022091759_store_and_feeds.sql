-- Best Value: store (buy side) + supplier feed imports

create type public.product_condition as enum ('new', 'refurbished_superb', 'refurbished_good', 'refurbished_fair');
create type public.product_source as enum ('manual', 'feed');
create type public.feed_format as enum ('csv', 'xlsx', 'json', 'xml');

create table public.suppliers (
  id             bigint generated always as identity primary key,
  name           text not null,
  feed_url       text,                        -- null = upload-only
  feed_format    public.feed_format not null,
  field_mapping  jsonb not null default '{}', -- supplier column -> product field
  schedule_cron  text,                        -- null = manual runs only
  is_active      boolean not null default true,
  last_run_at    timestamptz,
  created_at     timestamptz not null default now()
);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  sku                text not null unique,
  title              text not null,
  slug               text not null unique,
  description        text,
  category_id        bigint references public.categories (id),
  brand_id           bigint references public.brands (id),
  device_variant_id  bigint references public.device_variants (id),
  condition          public.product_condition not null default 'new',
  mrp                numeric(12, 2) check (mrp >= 0),
  price              numeric(12, 2) not null check (price >= 0),   -- GST-inclusive INR
  gst_rate           numeric(5, 2) not null default 18 check (gst_rate between 0 and 28),
  hsn_code           text,
  stock              int not null default 0 check (stock >= 0),
  images             text[] not null default '{}',
  source             public.product_source not null default 'manual',
  supplier_id        bigint references public.suppliers (id),
  supplier_sku       text,
  locked_fields      text[] not null default '{}', -- fields feed must not overwrite
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint price_not_above_mrp check (mrp is null or price <= mrp),
  unique (supplier_id, supplier_sku)
);
create index products_category_idx on public.products (category_id) where is_active;
create index products_brand_idx on public.products (brand_id) where is_active;
create index products_search_idx on public.products using gin (to_tsvector('simple', title));
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create type public.import_status as enum ('running', 'succeeded', 'partial', 'failed');

create table public.import_runs (
  id            bigint generated always as identity primary key,
  supplier_id   bigint not null references public.suppliers (id) on delete cascade,
  started_by    uuid references public.profiles (id),
  status        public.import_status not null default 'running',
  rows_total    int not null default 0,
  rows_created  int not null default 0,
  rows_updated  int not null default 0,
  rows_failed   int not null default 0,
  errors        jsonb not null default '[]',   -- [{row, field, message}]
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index import_runs_supplier_idx on public.import_runs (supplier_id, started_at desc);

-- Store orders, numbered like BV-O-000123
create sequence public.store_order_seq;
create type public.order_status as enum ('pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'captured', 'failed', 'refunded');

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          text not null unique
                      default 'BV-O-' || lpad(nextval('public.store_order_seq')::text, 6, '0'),
  user_id           uuid not null references public.profiles (id),
  status            public.order_status not null default 'pending_payment',
  subtotal          numeric(12, 2) not null check (subtotal >= 0),   -- taxable value
  gst_amount        numeric(12, 2) not null check (gst_amount >= 0),
  shipping_fee      numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  total             numeric(12, 2) not null check (total >= 0),
  shipping_address  jsonb not null,
  buyer_gstin       text check (buyer_gstin is null or buyer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  payment_status    public.payment_status not null default 'pending',
  payment_ref       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  sku         text not null,      -- snapshot
  title       text not null,      -- snapshot
  hsn_code    text,
  gst_rate    numeric(5, 2) not null,
  unit_price  numeric(12, 2) not null check (unit_price >= 0),  -- GST-inclusive
  qty         int not null check (qty > 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- Site content
create table public.newsletter_subscribers (
  email       text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at  timestamptz not null default now()
);

create table public.faqs (
  id          bigint generated always as identity primary key,
  question    text not null,
  answer      text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
