import Link from "next/link";
import { Suspense } from "react";
import { FilterTabs, pickFilter } from "@/components/admin/orders/FilterTabs";
import { LIST_LIMIT, listStoreOrders, STORE_FILTERS, type StoreFilter } from "@/lib/admin/store-orders";
import { requireStaff } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { ORDER_STATUS_LABELS } from "@/lib/store/status";

export const metadata = { title: "Store orders", robots: { index: false } };

const FILTER_LABELS: Record<StoreFilter, string> = {
  to_ship: "To pack or ship",
  needs_refund: "Needs refund",
  pending_payment: ORDER_STATUS_LABELS.pending_payment,
  shipped: ORDER_STATUS_LABELS.shipped,
  delivered: ORDER_STATUS_LABELS.delivered,
  cancelled: ORDER_STATUS_LABELS.cancelled,
  refunded: ORDER_STATUS_LABELS.refunded,
  all: "All",
};
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function StoreOrderTable({ filter }: { filter: StoreFilter }) {
  await requireStaff();
  const orders = await listStoreOrders(filter);
  if (orders.length === 0) return <p className="text-sm text-muted">No orders here.</p>;
  return (
    <>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
        {orders.map((o) => {
          const needsRefund = o.status === "cancelled" && o.paymentStatus === "captured";
          return (
            <li key={o.orderNo}>
              <Link href={`/admin/orders/${o.orderNo}`} className="grid gap-1 p-3 hover:bg-brand-soft sm:grid-cols-[9rem_1fr_11rem_8rem] sm:items-center">
                <span className="font-medium">{o.orderNo}</span>
                <span className="min-w-0 truncate">
                  {o.items.map((i) => `${i.qty} × ${i.title}`).join(", ")}
                </span>
                <span className="text-muted">{dateFormat.format(new Date(o.createdAt))}</span>
                <span className="sm:text-right">
                  <span className="block font-semibold">{formatInr(o.total)}</span>
                  <span className={`text-xs ${needsRefund ? "text-danger" : "text-muted"}`}>
                    {needsRefund ? "Needs refund" : ORDER_STATUS_LABELS[o.status]}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {orders.length === LIST_LIMIT && (
        <p className="mt-3 text-sm text-muted">Showing the first {LIST_LIMIT} orders. Use the filters to narrow the list.</p>
      )}
    </>
  );
}

export default function StoreOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Store orders</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((query) => {
          const filter = pickFilter(STORE_FILTERS, query.status);
          return (
            <>
              <FilterTabs basePath="/admin/orders" options={STORE_FILTERS} labels={FILTER_LABELS} current={filter} />
              <StoreOrderTable filter={filter} />
            </>
          );
        })}
      </Suspense>
    </section>
  );
}
