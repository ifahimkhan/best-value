import Link from "next/link";
import { Suspense } from "react";
import { ListingFilters } from "@/components/store/ListingFilters";
import { ProductGrid } from "@/components/store/ProductGrid";
import { listCategories } from "@/lib/catalog/categories";
import { listAllBrands } from "@/lib/catalog/queries";
import { listingHref, PAGE_SIZE, parseListingParams, type ListingParams } from "@/lib/store/listing";
import { listProducts } from "@/lib/store/queries";

export const metadata = {
  title: "Shop checked phones and devices",
  description: "Tested, graded devices with a GST invoice and free delivery.",
};

async function Listing({ params }: { params: ListingParams }) {
  const [page, categories, brands] = await Promise.all([listProducts(params), listCategories(), listAllBrands()]);
  const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <ListingFilters params={params} categories={categories.filter((c) => c.canBuy)} brands={brands} />
      <div>
        <p className="mb-4 text-sm text-muted">
          {page.total} {page.total === 1 ? "device" : "devices"}
        </p>
        {page.items.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-muted">
            Nothing matches these filters yet.{" "}
            <Link href="/shop" className="text-brand underline">
              Clear filters
            </Link>
          </p>
        ) : (
          <ProductGrid products={page.items} />
        )}
        {totalPages > 1 && (
          <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-4 text-sm">
            {params.page > 1 && (
              <Link href={listingHref(params, { page: params.page - 1 })} className="text-brand underline">
                Previous
              </Link>
            )}
            <span className="text-muted">
              Page {params.page} of {totalPages}
            </span>
            {params.page < totalPages && (
              <Link href={listingHref(params, { page: params.page + 1 })} className="text-brand underline">
                Next
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Shop checked devices</h1>
      <p className="mb-8 mt-2 text-muted">Every device is tested and graded. GST invoice and free delivery included.</p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((raw) => (
          <Listing params={parseListingParams(raw)} />
        ))}
      </Suspense>
    </section>
  );
}
