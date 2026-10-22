-- Public bucket for product images copied from supplier feeds.
-- Only the service role writes; public read comes from the bucket being public.
-- SVG is excluded because it can carry script.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Feeds run at most once a day (Vercel cron), so the schedule is a simple flag.
alter table public.suppliers
  add constraint suppliers_schedule_check check (schedule_cron is null or schedule_cron = 'daily'),
  add constraint suppliers_name_length check (char_length(name) between 1 and 120),
  add constraint suppliers_feed_url_https check (feed_url is null or feed_url like 'https://%');

-- One import at a time per supplier, so two runs cannot race on the same products.
create unique index import_runs_one_running_idx on public.import_runs (supplier_id) where status = 'running';
