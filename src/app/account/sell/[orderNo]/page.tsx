import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClearSavedAnswers } from "@/components/sell/ClearSavedAnswers";
import { requireUser } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { maskPayout } from "@/lib/sell/booking";
import { getMySellOrder } from "@/lib/sell/queries";
import { formatPickupDate } from "@/lib/sell/slots";
import { SELL_STATUS_LABELS } from "@/lib/sell/status";

export const metadata = { robots: { index: false } };

interface OrderContentProps {
  orderNo: string;
  isNew: boolean;
}

async function OrderContent({ orderNo, isNew }: OrderContentProps) {
  await requireUser(`/account/sell/${orderNo}`);
  // RLS returns only the signed-in customer's own orders
  const order = await getMySellOrder(orderNo);
  if (!order) notFound();
  const { address } = order;

  return (
    <>
      {isNew && <ClearSavedAnswers />}
      {isNew && (
        <p role="status" className="mb-6 rounded-xl bg-brand-soft p-4 font-medium">
          Pickup booked. Keep the device and a photo ID ready, and sign out of iCloud or Google before the agent arrives.
        </p>
      )}
      <h1 className="text-2xl font-bold">{order.deviceName}</h1>
      <p className="text-muted">
        {order.orderNo}
        {order.variantLabel && ` · ${order.variantLabel}`}
      </p>
      <dl className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">Status</dt>
        <dd className="font-medium">{SELL_STATUS_LABELS[order.status]}</dd>
        <dt className="text-muted">Quoted price</dt>
        <dd className="font-semibold">{formatInr(order.quotedPrice)}</dd>
        {order.finalPrice !== null && (
          <>
            <dt className="text-muted">Final price</dt>
            <dd className="font-semibold text-brand">{formatInr(order.finalPrice)}</dd>
          </>
        )}
        <dt className="text-muted">Pickup</dt>
        <dd>
          {formatPickupDate(order.pickupDate)}, {order.pickupSlot.replace("-", " to ")}
        </dd>
        <dt className="text-muted">Address</dt>
        <dd>
          {address.fullName}, {address.phone}
          <br />
          {[address.line1, address.line2, address.landmark].filter(Boolean).join(", ")}
          <br />
          {address.city}, {address.state} {address.pincode}
        </dd>
        <dt className="text-muted">Payment</dt>
        <dd>{maskPayout(order.payout)}</dd>
      </dl>
      <p className="mt-4 text-sm text-muted">
        The final price is confirmed when our agent checks the device. Need to change something? Email us and quote your
        order number.
      </p>
      <Link href="/account" className="mt-6 inline-block text-brand underline">
        Back to my account
      </Link>
    </>
  );
}

export default function SellOrderPage({ params, searchParams }: PageProps<"/account/sell/[orderNo]">) {
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
