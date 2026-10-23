import Link from "next/link";
import { Suspense } from "react";
import { DeviceImageForm } from "@/components/admin/catalog/DeviceImageForm";
import { requireAdmin } from "@/lib/auth/session";
import { DEVICE_PAGE_SIZE, deviceListHref, parseDeviceListParams, type DeviceListParams } from "@/lib/catalog/admin-device-list";
import { listAdminBrands, listAdminCategories, listAdminDevices } from "@/lib/catalog/admin-devices";

export const metadata = { title: "Device catalog", robots: { index: false } };

const FILTER_CLASS = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

async function Filters({ params }: { params: DeviceListParams }) {
  await requireAdmin();
  const [categories, brands] = await Promise.all([listAdminCategories(), listAdminBrands()]);
  return (
    <form action="/admin/catalog" className="flex flex-wrap gap-2">
      <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="Search device name" className={`${FILTER_CLASS} min-w-56 flex-1`} />
      <select name="category" defaultValue={params.category ?? ""} className={FILTER_CLASS} aria-label="Category">
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <select name="brand" defaultValue={params.brand ?? ""} className={FILTER_CLASS} aria-label="Brand">
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
      <select name="image" defaultValue={params.image} className={FILTER_CLASS} aria-label="Photo">
        <option value="placeholder">Placeholder photo</option>
        <option value="custom">Uploaded here</option>
        <option value="all">All devices</option>
      </select>
      <button type="submit" className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand">
        Filter
      </button>
    </form>
  );
}

async function DeviceList({ params }: { params: DeviceListParams }) {
  await requireAdmin();
  const { items, total } = await listAdminDevices(params);
  const pages = Math.max(1, Math.ceil(total / DEVICE_PAGE_SIZE));
  if (items.length === 0) return <p className="text-sm text-muted">No devices match.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{total.toLocaleString("en-IN")} devices</p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((d) => (
          <li key={d.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
            <span className="min-w-0 lg:w-56 lg:shrink-0">
              <span className="block truncate font-medium">{d.name}</span>
              <span className="block text-xs text-muted">
                {d.brandName} · {d.categoryName}
                {d.hasPlaceholder && " · placeholder"}
                {!d.isActive && " · hidden"}
              </span>
            </span>
            <DeviceImageForm deviceId={d.id} deviceName={d.name} imageUrl={d.imageUrl} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {params.page > 1 ? <Link href={deviceListHref(params, { page: params.page - 1 })}>← Previous</Link> : <span />}
          <span className="text-muted">
            Page {params.page} of {pages}
          </span>
          {params.page < pages ? <Link href={deviceListHref(params, { page: params.page + 1 })}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

export default function AdminCatalogPage({ searchParams }: PageProps<"/admin/catalog">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Device catalog</h1>
        <p className="mt-1 text-sm text-muted">
          Replace placeholder photos. Uploads are fitted into a 192 × 192 square and compressed to 20 KB or less. A clear photo on a plain
          background works best.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((raw) => {
          const params = parseDeviceListParams(raw);
          return (
            <>
              <Filters params={params} />
              <DeviceList params={params} />
            </>
          );
        })}
      </Suspense>
    </section>
  );
}
