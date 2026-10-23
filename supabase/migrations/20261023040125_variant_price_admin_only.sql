-- Buy prices decide what customers are paid, so only admins may set them.
-- The variants RLS policies let staff write any column through the REST API;
-- this trigger closes that path for base_buy_price (new variants included).
-- Writes with no signed-in user (service role, seed scripts) are not affected.

create or replace function private.guard_variant_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (tg_op = 'INSERT' or new.base_buy_price is distinct from old.base_buy_price)
     and not private.is_admin() then
    raise exception 'Only admins can set buy prices' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_variant_price() from public;

create trigger variants_price_admin_only
  before insert or update of base_buy_price on public.device_variants
  for each row execute function private.guard_variant_price();

-- A missing or null price made the range check NULL and let it through
create or replace function public.admin_create_device(p_device jsonb, p_variants jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category bigint;
  v_brand bigint;
  v_device bigint;
begin
  if not private.is_admin() then
    raise exception 'Only admins can add devices' using errcode = '42501';
  end if;
  if jsonb_typeof(p_variants) is distinct from 'array'
     or jsonb_array_length(p_variants) not between 1 and 20 then
    raise exception 'A device needs 1 to 20 variants' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variants) v
    where coalesce((v->>'base_buy_price')::numeric, -1) not between 0 and 1000000
  ) then
    raise exception 'Variant price out of range' using errcode = '22023';
  end if;

  select id into v_category from public.categories where slug = p_device->>'category_slug';
  select id into v_brand from public.brands where slug = p_device->>'brand_slug';
  if v_category is null or v_brand is null then
    raise exception 'Unknown category or brand' using errcode = '22023';
  end if;

  insert into public.devices (category_id, brand_id, name, slug, image_url, release_year, is_top_selling, is_active)
  values (
    v_category,
    v_brand,
    p_device->>'name',
    p_device->>'slug',
    p_device->>'image_url',
    (p_device->>'release_year')::integer,
    coalesce((p_device->>'is_top_selling')::boolean, false),
    coalesce((p_device->>'is_active')::boolean, true)
  )
  returning id into v_device;

  insert into public.device_variants (device_id, label, slug, ram_gb, storage_gb, base_buy_price)
  select v_device, v->>'label', v->>'slug', (v->>'ram_gb')::integer, (v->>'storage_gb')::integer, (v->>'base_buy_price')::numeric
  from jsonb_array_elements(p_variants) v;

  return v_device;
end;
$$;

create or replace function public.admin_set_variant_prices(p_device_id bigint, p_prices jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'Only admins can change prices' using errcode = '42501';
  end if;
  if jsonb_typeof(p_prices) is distinct from 'array' or jsonb_array_length(p_prices) > 50 then
    raise exception 'Invalid price list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_prices) p
    where coalesce((p->>'price')::numeric, -1) not between 0 and 1000000
  ) then
    raise exception 'Variant price out of range' using errcode = '22023';
  end if;

  update public.device_variants v
  set base_buy_price = (p->>'price')::numeric
  from jsonb_array_elements(p_prices) p
  where v.id = (p->>'variant_id')::bigint
    and v.device_id = p_device_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
