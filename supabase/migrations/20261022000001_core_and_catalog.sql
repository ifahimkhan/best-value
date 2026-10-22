-- Best Value: core users + shared device/product catalog
-- Shared by the sell (buyback) side and the buy (store) side.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'staff', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text unique,
  email       text,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  full_name   text not null,
  phone       text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  line1       text not null,
  line2       text,
  landmark    text,
  city        text not null,
  state       text not null,
  pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile for every new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.users.phone is stored without "+"; profiles use E.164 (+91XXXXXXXXXX)
  insert into public.profiles (id, phone, email)
  values (
    new.id,
    case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end,
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email/phone in sync with the verified values in auth.users
create or replace function public.handle_user_contact_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set email = new.email,
      phone = case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_contact_changed after update of email, phone on auth.users
  for each row execute function public.handle_user_contact_change();

-- Role helper used by RLS policies
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Catalog: category -> brand -> device (model) -> variant
-- ---------------------------------------------------------------------------
create table public.categories (
  id           bigint generated always as identity primary key,
  name         text not null,
  slug         text not null unique,
  icon_url     text,
  can_sell     boolean not null default true,   -- customers can sell this to us
  can_buy      boolean not null default true,   -- customers can buy this from store
  coming_soon  boolean not null default false,
  is_active    boolean not null default true,
  sort_order   int not null default 0
);

create table public.brands (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

create table public.devices (
  id              bigint generated always as identity primary key,
  category_id     bigint not null references public.categories (id),
  brand_id        bigint not null references public.brands (id),
  name            text not null,
  slug            text not null,
  image_url       text,
  release_year    int check (release_year between 2000 and 2100),
  is_top_selling  boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (category_id, brand_id, slug)
);
create index devices_brand_idx on public.devices (brand_id);
create index devices_name_search_idx on public.devices using gin (to_tsvector('simple', name));
create trigger devices_updated_at before update on public.devices
  for each row execute function public.set_updated_at();

create table public.device_variants (
  id              bigint generated always as identity primary key,
  device_id       bigint not null references public.devices (id) on delete cascade,
  label           text not null,                 -- e.g. "6 GB / 128 GB"
  slug            text not null,                 -- e.g. "6-gb-128-gb"
  ram_gb          int check (ram_gb > 0),
  storage_gb      int check (storage_gb > 0),
  base_buy_price  numeric(12, 2) not null check (base_buy_price >= 0), -- max we pay, INR
  is_active       boolean not null default true,
  unique (device_id, slug)
);
create index device_variants_device_idx on public.device_variants (device_id);
