import type { Metadata } from "next";
import { Suspense } from "react";
import { DeviceGrid } from "@/components/catalog/DeviceGrid";
import { DeviceSearchBox } from "@/components/catalog/DeviceSearchBox";
import { BRAND } from "@/lib/brand";
import { searchDevices } from "@/lib/catalog/queries";
import { normalizeQuery } from "@/lib/catalog/search";

export const metadata: Metadata = {
  title: `Search devices | ${BRAND.name}`,
  robots: { index: false }, // keep endless query pages out of search engines
};

async function SearchResults({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = await searchParams;
  const raw = typeof q === "string" ? q : null;
  const query = normalizeQuery(raw);

  if (!query) {
    return (
      <>
        <DeviceSearchBox defaultValue={raw ?? ""} />
        <p className="mt-6 text-muted">Type at least 2 letters of your device name, like &quot;iphone 15&quot;.</p>
      </>
    );
  }

  const devices = await searchDevices(query);
  return (
    <>
      <DeviceSearchBox defaultValue={query} />
      <p className="mt-6 mb-4 text-sm text-muted">
        {devices.length} {devices.length === 1 ? "result" : "results"} for &quot;{query}&quot;
      </p>
      <DeviceGrid
        devices={devices}
        showBrand
        emptyMessage="No matching devices. Try just the model name, or browse by brand from the Sell page."
      />
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Find your device</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-surface" />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
