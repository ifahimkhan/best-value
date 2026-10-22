import Image from "next/image";
import Link from "next/link";
import type { Brand } from "@/lib/catalog/schemas";

interface BrandGridProps {
  brands: readonly Brand[];
  categorySlug: string;
}

export function BrandGrid({ brands, categorySlug }: BrandGridProps) {
  if (brands.length === 0) {
    return <p className="text-muted">No brands listed here yet. Please check back soon.</p>;
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {brands.map((brand) => (
        <li key={brand.id}>
          <Link
            href={`/sell/${categorySlug}/${brand.slug}`}
            className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm font-medium transition hover:border-brand"
          >
            {brand.logoUrl ? (
              <Image src={brand.logoUrl} alt="" width={64} height={32} className="h-8 w-auto object-contain" />
            ) : null}
            {brand.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
