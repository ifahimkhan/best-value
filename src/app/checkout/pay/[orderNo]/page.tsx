import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RazorpayPayButton } from "@/components/store/RazorpayPayButton";
import { requireUser } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { toPaise } from "@/lib/store/gst";
import { razorpayConfig } from "@/lib/store/payments";
import { getMyPayableOrder } from "@/lib/store/queries";

export const metadata = { title: "Pay for your order", robots: { index: false } };

async function PayContent({ orderNo }: { orderNo: string }) {
  const user = await requireUser(`/checkout/pay/${orderNo}`);
  // RLS: only the customer's own orders are found
  const order = await getMyPayableOrder(orderNo);
  if (!order) notFound();
  if (order.paymentStatus === "captured") redirect(`/account/orders/${order.orderNo}`);

  const config = razorpayConfig();
  if (order.status !== "pending_payment" || !order.gatewayOrderId || !config) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6">
        This payment link has expired.{" "}
        <Link href="/cart" className="text-brand underline">
          Go back to your cart
        </Link>{" "}
        to place the order again.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <p className="text-muted">Order {order.orderNo}</p>
      <p className="mb-6 mt-1 text-2xl font-bold">{formatInr(order.total)}</p>
      <RazorpayPayButton
        keyId={config.keyId}
        orderNo={order.orderNo}
        gatewayOrderId={order.gatewayOrderId}
        amountPaise={toPaise(order.total)}
        amountLabel={formatInr(order.total)}
        prefill={{ name: user.fullName ?? "", email: user.email ?? "", contact: user.phone ?? "" }}
      />
      <p className="mt-4 text-sm text-muted">
        Pay by UPI, card, net banking or wallet. Items are held for 30 minutes while you pay.
      </p>
    </div>
  );
}

export default function PayPage({ params }: PageProps<"/checkout/pay/[orderNo]">) {
  return (
    <section className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Complete your payment</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ orderNo }) => (
          <PayContent orderNo={orderNo} />
        ))}
      </Suspense>
    </section>
  );
}
