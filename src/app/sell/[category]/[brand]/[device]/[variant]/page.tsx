import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { DeviceImage } from "@/components/catalog/DeviceImage";
import { formatInr } from "@/lib/brand";
import { resolveDevice } from "@/lib/catalog/resolve";
import { isValidSlug } from "@/lib/catalog/slug";

// Entry point of the price calculator. Phase 3 replaces the placeholder
// below with the condition questions and live quote.

interface VariantContentProps {
  categorySlug: string;
  brandSlug: string;
  deviceSlug: string;
  variantSlug: string;
}

async function VariantContent({ categorySlug, brandSlug, deviceSlug, variantSlug }: VariantContentProps) {
  if (!isValidSlug(variantSlug)) notFound();
  const resolved = await resolveDevice(categorySlug, brandSlug, deviceSlug);
  const variant = resolved?.device.variants.find((v) => v.slug === variantSlug);
  if (!resolved || !variant) notFound();

  const { category, brand, device } = resolved;
  const title = `${brand.name} ${device.name}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sell", href: "/sell" },
          { label: category.name, href: `/sell/${category.slug}` },
          { label: brand.name, href: `/sell/${category.slug}/${brand.slug}` },
          { label: device.name, href: device.href },
          { label: variant.label },
        ]}
      />
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center">
        <div className="w-32 shrink-0">
          <DeviceImage src={device.imageUrl} alt={title} sizes="8rem" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted">{variant.label}</p>
          <p className="mt-2">
            Get up to <span className="text-xl font-bold text-brand">{formatInr(variant.price)}</span>
          </p>
        </div>
      </div>
      <p className="mt-8 text-muted">
        The condition questions for your exact price are coming next.{" "}
        <Link href={device.href} className="text-brand underline">
          Change variant
        </Link>
      </p>
    </>
  );
}

export default function SellVariantPage({ params }: PageProps<"/sell/[category]/[brand]/[device]/[variant]">) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ category, brand, device, variant }) => (
          <VariantContent categorySlug={category} brandSlug={brand} deviceSlug={device} variantSlug={variant} />
        ))}
      </Suspense>
    </section>
  );
}
