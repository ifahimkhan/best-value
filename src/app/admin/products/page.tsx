import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { ADMIN_PAGE_SIZE, adminListHref, parseAdminListParams, type AdminListParams } from "@/lib/products/admin-list";
import { listAdminProducts } from "@/lib/products/queries";

export const metadata = { title: "Products", robots: { index: false } };

const FILTER_CLASS = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

function Filters({ params }: { params: AdminListParams }) {
  return (
    <form action="/admin/products" className="flex flex-wrap gap-2">
      <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="Search title or SKU" className={`${FILTER_CLASS} min-w-56 flex-1`} />
      <select name="source" defaultValue={params.source} className={FILTER_CLASS} aria-label="Source">
        <option value="all">All sources</option>
        <option value="manual">Added by hand</option>
        <option value="feed">From supplier feeds</option>
      </select>
      <select name="status" defaultValue={params.status} className={FILTER_CLASS} aria-label="Status">
        <option value="all">Any status</option>
        <option value="active">In store</option>
        <option value="inactive">Hidden</option>
        <option value="out_of_stock">Out of stock</option>
      </select>
      <button type="submit" className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand">
        Filter
      </button>
    </form>
  );
}

async function ProductList({ params }: { params: AdminListParams }) {
  await requireStaff();
  const { items, total } = await listAdminProducts(params);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (items.length === 0) return <p className="text-sm text-muted">No products match.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{total.toLocaleString("en-IN")} products</p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/products/${p.id}`} className="flex items-center gap-4 p-3 hover:bg-brand-soft">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                <img src={p.image} alt="" className="size-12 shrink-0 rounded object-contain" />
              ) : (
                <span aria-hidden className="size-12 shrink-0 rounded bg-background" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.title}</span>
                <span className="block text-xs text-muted">
                  {p.sku} · {p.source === "feed" ? `feed${p.supplierName ? `: ${p.supplierName}` : ""}` : "added by hand"}
                  {!p.isActive && " · hidden"}
                </span>
              </span>
              <span className="text-right text-sm">
                <span className="block font-semibold">{formatInr(p.price)}</span>
                <span className={p.stock === 0 ? "text-danger" : "text-muted"}>{p.stock} in stock</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {params.page > 1 ? <Link href={adminListHref(params, { page: params.page - 1 })}>← Previous</Link> : <span />}
          <span className="text-muted">
            Page {params.page} of {pages}
          </span>
          {params.page < pages ? <Link href={adminListHref(params, { page: params.page + 1 })}>Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

export default function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link href="/admin/products/new" className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast">
          Add product
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((raw) => {
          const params = parseAdminListParams(raw);
          return (
            <>
              {raw.deleted === "1" && (
                <p role="status" className="rounded-lg bg-brand-soft p-3 text-sm">
                  Product deleted.
                </p>
              )}
              <Filters params={params} />
              <ProductList params={params} />
            </>
          );
        })}
      </Suspense>
    </section>
  );
}
