import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { BRAND } from "@/lib/brand";
import { listCategories } from "@/lib/catalog/categories";

export const metadata: Metadata = {
  title: `Sell your old device for cash | ${BRAND.name}`,
  description: "Pick your device, get an instant price and book a free doorstep pickup anywhere we serve.",
};

async function SellCategories() {
  const categories = (await listCategories()).filter((c) => c.canSell);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {categories.map((cat) =>
        cat.comingSoon ? (
          <li key={cat.id} className="rounded-xl border border-dashed border-border bg-surface p-5 opacity-70">
            <p className="font-semibold">{cat.name}</p>
            <p className="text-xs text-muted">Coming soon</p>
          </li>
        ) : (
          <li key={cat.id}>
            <Link
              href={`/sell/${cat.slug}`}
              className="block rounded-xl border border-border bg-surface p-5 transition hover:border-brand"
            >
              <p className="font-semibold">Sell {cat.name.toLowerCase()}</p>
              <p className="text-xs text-muted">Instant quote</p>
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

export default function SellPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs items={[{ label: "Sell" }]} />
      <h1 className="text-3xl font-bold">What are you selling?</h1>
      <p className="mt-2 mb-8 text-muted">Choose a category to see the brands and models we buy.</p>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
        <SellCategories />
      </Suspense>
    </section>
  );
}
