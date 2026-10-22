import Link from "next/link";
import { Suspense } from "react";
import { CartLines } from "@/components/store/CartLines";
import { OrderSummary } from "@/components/store/OrderSummary";
import { readCart } from "@/lib/store/cart-cookie";
import { priceCart } from "@/lib/store/checkout";
import { getPricedProducts } from "@/lib/store/queries";

export const metadata = { title: "Your cart", robots: { index: false } };

async function CartContent() {
  const cart = await readCart();
  if (cart.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6">
        Your cart is empty.{" "}
        <Link href="/shop" className="text-brand underline">
          Browse the shop
        </Link>
      </p>
    );
  }

  const priced = priceCart(cart, await getPricedProducts(cart.map((l) => l.productId)));
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <CartLines lines={priced.lines} />
      <OrderSummary totals={priced.totals}>
        {priced.canCheckout ? (
          <Link
            href="/checkout"
            className="mt-5 block rounded-lg bg-brand px-6 py-3 text-center font-semibold text-brand-contrast hover:bg-brand-strong"
          >
            Checkout
          </Link>
        ) : (
          <p className="mt-5 text-sm text-danger">Fix the items marked above to check out.</p>
        )}
      </OrderSummary>
    </div>
  );
}

export default function CartPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Your cart</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <CartContent />
      </Suspense>
    </section>
  );
}
