import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { DeviceGrid } from "@/components/catalog/DeviceGrid";
import { getBrand, getCategory, listDevices } from "@/lib/catalog/queries";

interface BrandContentProps {
  categorySlug: string;
  brandSlug: string;
}

async function BrandContent({ categorySlug, brandSlug }: BrandContentProps) {
  const [category, brand] = await Promise.all([getCategory(categorySlug), getBrand(brandSlug)]);
  if (!category || !brand || !category.canSell || category.comingSoon) notFound();

  const devices = await listDevices(category.id, brand.id);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sell", href: "/sell" },
          { label: category.name, href: `/sell/${category.slug}` },
          { label: brand.name },
        ]}
      />
      <h1 className="text-3xl font-bold">
        Sell your {brand.name} {category.name.toLowerCase()}
      </h1>
      <p className="mt-2 mb-8 text-muted">Select your model to continue.</p>
      <DeviceGrid devices={devices} emptyMessage={`We're not buying any ${brand.name} models here yet.`} />
    </>
  );
}

export default function SellBrandPage({ params }: PageProps<"/sell/[category]/[brand]">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ category, brand }) => (
          <BrandContent categorySlug={category} brandSlug={brand} />
        ))}
      </Suspense>
    </section>
  );
}
