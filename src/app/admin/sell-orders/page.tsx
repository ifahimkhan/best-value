import Link from "next/link";
import { Suspense } from "react";
import { FilterTabs, pickFilter } from "@/components/admin/orders/FilterTabs";
import { listSellOrders, SELL_FILTERS, type SellFilter } from "@/lib/admin/sell-orders";
import { requireStaff } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { SELL_STATUS_LABELS } from "@/lib/sell/status";

export const metadata = { title: "Sell orders", robots: { index: false } };

const FILTER_LABELS: Record<SellFilter, string> = { open: "Open", ...SELL_STATUS_LABELS, all: "All" };
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

async function SellOrderTable({ filter }: { filter: SellFilter }) {
  await requireStaff();
  const orders = await listSellOrders(filter);
  if (orders.length === 0) return <p className="text-sm text-muted">No orders here.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
      {orders.map((o) => (
        <li key={o.orderNo}>
          <Link href={`/admin/sell-orders/${o.orderNo}`} className="grid gap-1 p-3 hover:bg-brand-soft sm:grid-cols-[9rem_1fr_9rem_7rem] sm:items-center">
            <span className="font-medium">{o.orderNo}</span>
            <span className="min-w-0 truncate">
              {o.deviceName}
              {o.variantLabel && ` · ${o.variantLabel}`}
              {o.city && <span className="text-muted"> · {o.city}</span>}
            </span>
            <span className="text-muted">
              {dateFormat.format(new Date(`${o.pickupDate}T00:00:00+05:30`))} · {o.pickupSlot}
            </span>
            <span className="sm:text-right">
              <span className="block font-semibold">{formatInr(o.finalPrice ?? o.quotedPrice)}</span>
              <span className="text-xs text-muted">{SELL_STATUS_LABELS[o.status]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SellOrdersPage({ searchParams }: PageProps<"/admin/sell-orders">) {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Sell orders</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((query) => {
          const filter = pickFilter(SELL_FILTERS, query.status);
          return (
            <>
              <FilterTabs basePath="/admin/sell-orders" options={SELL_FILTERS} labels={FILTER_LABELS} current={filter} />
              <SellOrderTable filter={filter} />
            </>
          );
        })}
      </Suspense>
    </section>
  );
}
