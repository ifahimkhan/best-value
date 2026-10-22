import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventTimeline } from "@/components/admin/orders/EventTimeline";
import { SellOrderActions } from "@/components/admin/orders/SellOrderActions";
import { listStaff } from "@/lib/admin/events";
import { getSellOrder, type AdminSellOrder } from "@/lib/admin/sell-orders";
import { requireStaff } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { SELL_STATUS_LABELS } from "@/lib/sell/status";

export const metadata = { title: "Sell order", robots: { index: false } };

function Payout({ order }: { order: AdminSellOrder }) {
  const p = order.payout;
  if (!p) return <>Not given</>;
  if (p.method === "cash") return <>Cash at pickup</>;
  if (p.method === "upi") return <>UPI: {p.upiId}</>;
  return (
    <>
      Bank: {p.accountName}, account {order.bankAccountNumber ?? `ending ${p.accountLast4}`}, IFSC {p.ifsc}
    </>
  );
}

function Details({ order }: { order: AdminSellOrder }) {
  const a = order.address;
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">Device</dt>
      <dd>
        {order.deviceName}
        {order.variantLabel && ` · ${order.variantLabel}`}
      </dd>
      <dt className="text-muted">Price</dt>
      <dd>
        Quoted {formatInr(order.quotedPrice)}
        {order.finalPrice !== null && <> · final {formatInr(order.finalPrice)}</>}
      </dd>
      <dt className="text-muted">Pickup</dt>
      <dd>
        {order.pickupDate}, {order.pickupSlot}
        <br />
        {a.fullName}, <a href={`tel:${a.phone}`} className="text-brand underline">{a.phone}</a>
        <br />
        {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
      </dd>
      <dt className="text-muted">Payout</dt>
      <dd>
        <Payout order={order} />
        {order.payoutRef && <> · ref {order.payoutRef}</>}
      </dd>
      {order.cancelReason && (
        <>
          <dt className="text-muted">Cancelled because</dt>
          <dd>{order.cancelReason}</dd>
        </>
      )}
    </dl>
  );
}

async function SellOrderContent({ orderNo }: { orderNo: string }) {
  await requireStaff();
  const [order, staff] = await Promise.all([getSellOrder(orderNo), listStaff()]);
  if (!order) notFound();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div>
          <Link href="/admin/sell-orders" className="text-sm text-brand underline">
            All sell orders
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{order.orderNo}</h1>
          <p className="text-muted">{SELL_STATUS_LABELS[order.status]}</p>
        </div>
        <Details order={order} />
        <section>
          <h2 className="mb-2 font-semibold">Customer&apos;s answers</h2>
          {order.answers.length === 0 ? (
            <p className="text-sm text-muted">No answers recorded.</p>
          ) : (
            <dl className="grid gap-2 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[1fr_1fr]">
              {order.answers.map((a) => (
                <div key={a.question} className="contents">
                  <dt className="text-muted">{a.question}</dt>
                  <dd>{a.options.join(", ")}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section>
          <h2 className="mb-2 font-semibold">History</h2>
          <EventTimeline events={order.events} labels={SELL_STATUS_LABELS} />
        </section>
      </div>
      <aside>
        <h2 className="mb-3 font-semibold">Next steps</h2>
        {/* Remount after each change so the forms show the stored values */}
        <SellOrderActions
          key={`${order.status}-${order.finalPrice}-${order.staffNotes}-${order.assignedTo}`}
          orderNo={order.orderNo}
          status={order.status}
          quotedPrice={order.quotedPrice}
          finalPrice={order.finalPrice}
          staff={staff}
          assignedTo={order.assignedTo}
          staffNotes={order.staffNotes}
        />
      </aside>
    </div>
  );
}

export default function AdminSellOrderPage({ params }: PageProps<"/admin/sell-orders/[orderNo]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
      {params.then(({ orderNo }) => (
        <SellOrderContent orderNo={orderNo} />
      ))}
    </Suspense>
  );
}
