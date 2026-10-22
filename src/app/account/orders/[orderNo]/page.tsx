import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClearCartAfterPayment } from "@/components/store/ClearCartAfterPayment";
import { requireUser } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { getMyStoreOrder } from "@/lib/store/queries";
import { ORDER_STATUS_LABELS } from "@/lib/store/status";

export const metadata = { title: "Your order", robots: { index: false } };

async function OrderContent({ orderNo, isNew }: { orderNo: string; isNew: boolean }) {
  await requireUser(`/account/orders/${orderNo}`);
  // RLS returns only the signed-in customer's own orders
  const order = await getMyStoreOrder(orderNo);
  if (!order) notFound();
  const { address } = order;
  const isPaid = order.paymentStatus === "captured";
  const needsRefund = isPaid && order.status === "cancelled";

  return (
    <>
      {isNew && isPaid && !needsRefund && <ClearCartAfterPayment orderNo={order.orderNo} />}
      {isNew && isPaid && !needsRefund && (
        <p role="status" className="mb-6 rounded-xl bg-brand-soft p-4 font-medium">
          Payment received. Thank you! We&apos;ll let you know when your order ships.
        </p>
      )}
      {needsRefund && (
        <p role="status" className="mb-6 rounded-xl border border-danger p-4">
          Your payment arrived after the item sold out. Your money will be refunded in full within 5 to 7 working days.
        </p>
      )}
      <h1 className="text-2xl font-bold">Order {order.orderNo}</h1>
      <p className="text-muted">{ORDER_STATUS_LABELS[order.status]}</p>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {order.items.map((item) => (
          <li key={item.sku} className="flex justify-between gap-4 p-4">
            <span>
              {item.qty} × {item.title}
            </span>
            <span className="font-medium">{formatInr(item.unitPrice * item.qty)}</span>
          </li>
        ))}
        <li className="flex justify-between p-4 font-bold">
          <span>Total (incl. {formatInr(order.gstAmount)} GST)</span>
          <span>{formatInr(order.total)}</span>
        </li>
      </ul>

      <dl className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">Deliver to</dt>
        <dd>
          {address.fullName}, {address.phone}
          <br />
          {[address.line1, address.line2, address.landmark].filter(Boolean).join(", ")}
          <br />
          {address.city}, {address.state} {address.pincode}
        </dd>
        {order.buyerGstin && (
          <>
            <dt className="text-muted">GSTIN</dt>
            <dd>{order.buyerGstin}</dd>
          </>
        )}
      </dl>

      <div className="mt-6 flex flex-wrap gap-4">
        {isPaid && !needsRefund && (
          <Link href={`/account/orders/${order.orderNo}/invoice`} className="rounded-lg border border-brand px-5 py-2.5 font-semibold text-brand hover:bg-brand-soft">
            View GST invoice
          </Link>
        )}
        {order.status === "pending_payment" && (
          <Link href={`/checkout/pay/${order.orderNo}`} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-brand-contrast">
            Complete payment
          </Link>
        )}
        <Link href="/account" className="self-center text-brand underline">
          Back to my account
        </Link>
      </div>
    </>
  );
}

export default function StoreOrderPage({ params, searchParams }: PageProps<"/account/orders/[orderNo]">) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {Promise.all([params, searchParams]).then(([{ orderNo }, query]) => (
          <OrderContent orderNo={orderNo} isNew={query.new === "1"} />
        ))}
      </Suspense>
    </section>
  );
}
