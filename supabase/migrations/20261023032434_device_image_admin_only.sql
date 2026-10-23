-- Device photos may only be changed by admins. Staff keep their other catalog
-- rights, but the devices_update RLS policy allows any column, so the rule is
-- enforced here as well as in the app. Writes with no signed-in user (service
-- role, seed scripts, migrations) are not affected.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.guard_device_image()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.image_url is distinct from old.image_url
     and not private.is_admin() then
    raise exception 'Only admins can change device images' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_device_image() from public;

create trigger devices_image_admin_only
  before update of image_url on public.devices
  for each row execute function private.guard_device_image();
