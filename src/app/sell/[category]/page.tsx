import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandGrid } from "@/components/catalog/BrandGrid";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { DeviceGrid } from "@/components/catalog/DeviceGrid";
import { DeviceSearchBox } from "@/components/catalog/DeviceSearchBox";
import { getCategory, listBrandsForCategory, listTopSelling } from "@/lib/catalog/queries";

async function CategoryContent({ categorySlug }: { categorySlug: string }) {
  const category = await getCategory(categorySlug);
  if (!category || !category.canSell) notFound();

  const crumbs = [{ label: "Sell", href: "/sell" }, { label: category.name }];

  if (category.comingSoon) {
    return (
      <>
        <Breadcrumbs items={crumbs} />
        <h1 className="text-3xl font-bold">Sell {category.name.toLowerCase()}</h1>
        <p className="mt-4 text-muted">We&apos;re not buying {category.name.toLowerCase()} yet. It&apos;s coming soon.</p>
      </>
    );
  }

  const [brands, topSelling] = await Promise.all([
    listBrandsForCategory(category.id),
    listTopSelling(category.id),
  ]);

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <h1 className="text-3xl font-bold">Sell your old {category.name.toLowerCase()}</h1>
      <p className="mt-2 text-muted">Find your model or pick the brand to get an instant price.</p>
      <div className="mt-6 mb-10">
        <DeviceSearchBox placeholder={`Search your ${category.name.toLowerCase()} model`} />
      </div>

      <h2 className="mb-4 text-xl font-bold">Choose your brand</h2>
      <BrandGrid brands={brands} categorySlug={category.slug} />

      {topSelling.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 text-xl font-bold">Popular models</h2>
          <DeviceGrid devices={topSelling} showBrand />
        </>
      )}
    </>
  );
}

export default function SellCategoryPage({ params }: PageProps<"/sell/[category]">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ category }) => (
          <CategoryContent categorySlug={category} />
        ))}
      </Suspense>
    </section>
  );
}
