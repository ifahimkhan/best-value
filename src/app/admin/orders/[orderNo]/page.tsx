import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventTimeline } from "@/components/admin/orders/EventTimeline";
import { StoreOrderActions } from "@/components/admin/orders/StoreOrderActions";
import { getStoreOrder, type AdminStoreOrder } from "@/lib/admin/store-orders";
import { requireStaff } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { razorpayConfig } from "@/lib/store/payments";
import { ORDER_STATUS_LABELS } from "@/lib/store/status";

export const metadata = { title: "Store order", robots: { index: false } };

const PAYMENT_LABELS = { pending: "Not paid", captured: "Paid", failed: "Failed", refunded: "Refunded" } as const;

function Details({ order }: { order: AdminStoreOrder }) {
  const a = order.address;
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">Ship to</dt>
      <dd>
        {a.fullName}, <a href={`tel:${a.phone}`} className="text-brand underline">{a.phone}</a>
        <br />
        {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
      </dd>
      {order.buyerGstin && (
        <>
          <dt className="text-muted">Buyer GSTIN</dt>
          <dd>{order.buyerGstin}</dd>
        </>
      )}
      <dt className="text-muted">Payment</dt>
      <dd>
        {PAYMENT_LABELS[order.paymentStatus]}
        {order.paymentRef && ` · ${order.paymentRef}`}
        {order.refundRef && ` · refund ${order.refundRef}`}
      </dd>
      {order.trackingNumber && (
        <>
          <dt className="text-muted">Tracking</dt>
          <dd>
            {order.trackingCarrier ? `${order.trackingCarrier} ` : ""}
            {order.trackingNumber}
          </dd>
        </>
      )}
    </dl>
  );
}

async function StoreOrderContent({ orderNo }: { orderNo: string }) {
  const user = await requireStaff();
  const order = await getStoreOrder(orderNo);
  if (!order) notFound();
  const needsRefund = order.status === "cancelled" && order.paymentStatus === "captured";
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div>
          <Link href="/admin/orders" className="text-sm text-brand underline">
            All store orders
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{order.orderNo}</h1>
          <p className={needsRefund ? "font-medium text-danger" : "text-muted"}>
            {ORDER_STATUS_LABELS[order.status]}
            {needsRefund && " · payment received, refund needed"}
          </p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
          {order.items.map((item) => (
            <li key={item.sku} className="flex justify-between gap-4 p-3">
              <span>
                {item.qty} × {item.title} <span className="text-muted">({item.sku})</span>
              </span>
              <span>{formatInr(item.unitPrice * item.qty)}</span>
            </li>
          ))}
          <li className="flex justify-between p-3 font-bold">
            <span>Total (incl. {formatInr(order.gstAmount)} GST)</span>
            <span>{formatInr(order.total)}</span>
          </li>
        </ul>
        <Details order={order} />
        <section>
          <h2 className="mb-2 font-semibold">History</h2>
          <EventTimeline events={order.events} labels={ORDER_STATUS_LABELS} />
        </section>
      </div>
      <aside>
        <h2 className="mb-3 font-semibold">Next steps</h2>
        <StoreOrderActions
          key={order.status}
          orderNo={order.orderNo}
          status={order.status}
          paymentStatus={order.paymentStatus}
          totalLabel={formatInr(order.total)}
          canRefundOnline={user.role === "admin" && Boolean(razorpayConfig()) && Boolean(order.paymentRef)}
        />
      </aside>
    </div>
  );
}

export default function AdminStoreOrderPage({ params }: PageProps<"/admin/orders/[orderNo]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
      {params.then(({ orderNo }) => (
        <StoreOrderContent orderNo={orderNo} />
      ))}
    </Suspense>
  );
}
