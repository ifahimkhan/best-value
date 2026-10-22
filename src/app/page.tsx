import Link from "next/link";
import { Suspense } from "react";
import { listCategories } from "@/lib/catalog/categories";

const SELL_STEPS = [
  { title: "Get your price", body: "Pick your device and answer a few quick questions about its condition." },
  { title: "Book a free pickup", body: "Choose a date and time slot. We come to your home or office." },
  { title: "Get paid on the spot", body: "Once our agent checks the device, you're paid by UPI, bank transfer or cash." },
] as const;

const REASONS = [
  { title: "Fair, upfront quotes", body: "Your price is worked out from clear rules, so you know why you got it." },
  { title: "Paid at pickup", body: "No waiting for days. Money arrives before our agent leaves." },
  { title: "GST invoices", body: "Every purchase and every buyback comes with proper paperwork." },
  { title: "Checked devices", body: "Store devices are tested and graded before they're listed." },
] as const;

async function CategoryGrid() {
  const categories = await listCategories();
  if (categories.length === 0) {
    return <p className="text-muted">Categories will appear here once the catalog is loaded.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {categories.map((cat) => (
        <li key={cat.id}>
          {cat.comingSoon ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-4 opacity-70">
              <p className="font-semibold">{cat.name}</p>
              <p className="text-xs text-muted">Coming soon</p>
            </div>
          ) : (
            <Link
              href={`/sell/${cat.slug}`}
              className="block rounded-xl border border-border bg-surface p-4 transition hover:border-brand hover:shadow-sm"
            >
              <p className="font-semibold">{cat.name}</p>
              <p className="text-xs text-muted">Sell or buy</p>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="bg-brand-soft">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              Your old phone is worth more than you think.
            </h1>
            <p className="mt-4 text-lg text-muted">
              Get an instant quote, free doorstep pickup and same-day payment. Or pick up a checked,
              graded device for less than new.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sell" className="rounded-lg bg-brand px-6 py-3 font-semibold text-brand-contrast hover:bg-brand-strong">
                Sell a device
              </Link>
              <Link href="/shop" className="rounded-lg border border-brand px-6 py-3 font-semibold text-brand hover:bg-surface">
                Shop devices
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">What would you like to sell or buy?</h2>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
          <CategoryGrid />
        </Suspense>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">Selling takes three steps</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {SELL_STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-bold text-brand">Step {i + 1}</span>
              <p className="mt-1 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">Why people choose Best Value</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-xl bg-surface p-5">
              <p className="font-semibold">{r.title}</p>
              <p className="mt-1 text-sm text-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
