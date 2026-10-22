import Link from "next/link";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/store/CheckoutForm";
import { OrderSummary } from "@/components/store/OrderSummary";
import { requireUser } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { readCart } from "@/lib/store/cart-cookie";
import { priceCart, SHIPPING_FEE_PAISE } from "@/lib/store/checkout";
import { toRupees } from "@/lib/store/gst";
import { razorpayConfig } from "@/lib/store/payments";
import { getPricedProducts } from "@/lib/store/queries";

export const metadata = { title: "Checkout", robots: { index: false } };

async function CheckoutContent() {
  const user = await requireUser("/checkout");
  const cart = await readCart();
  const priced = priceCart(cart, await getPricedProducts(cart.map((l) => l.productId)));

  if (!priced.canCheckout) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6">
        {cart.length === 0 ? "Your cart is empty." : "Some items in your cart need attention."}{" "}
        <Link href={cart.length === 0 ? "/shop" : "/cart"} className="text-brand underline">
          {cart.length === 0 ? "Browse the shop" : "Review your cart"}
        </Link>
      </p>
    );
  }

  const totalPaise = priced.totals.total + SHIPPING_FEE_PAISE;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        {razorpayConfig() ? (
          <CheckoutForm
            expectedTotalPaise={totalPaise}
            totalLabel={formatInr(toRupees(totalPaise))}
            defaultName={user.fullName ?? ""}
            defaultPhone={user.phone?.replace(/^\+91/, "") ?? ""}
          />
        ) : (
          <p className="rounded-xl border border-border bg-surface p-6">
            Online payment is being set up. Your cart is saved, so please check back soon.
          </p>
        )}
      </div>
      <OrderSummary totals={priced.totals}>
        <ul className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted">
          {priced.lines.map((l) => (
            <li key={l.productId}>
              {l.qty} × {l.product?.title}
            </li>
          ))}
        </ul>
      </OrderSummary>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Checkout</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        <CheckoutContent />
      </Suspense>
    </section>
  );
}
