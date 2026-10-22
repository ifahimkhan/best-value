-- Cover foreign keys flagged by the performance advisor (joins + cascading deletes)
create index import_runs_started_by_idx on public.import_runs (started_by);
create index order_items_product_idx on public.order_items (product_id);
create index products_device_variant_idx on public.products (device_variant_id);
create index sell_orders_variant_idx on public.sell_orders (variant_id);
