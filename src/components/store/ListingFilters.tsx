import Link from "next/link";
import type { Brand } from "@/lib/catalog/schemas";
import type { Category } from "@/lib/catalog/categories";
import { CONDITION_LABELS, listingHref, PRODUCT_CONDITIONS, SORT_LABELS, SORTS, type ListingParams } from "@/lib/store/listing";

interface ListingFiltersProps {
  params: ListingParams;
  categories: readonly Category[];
  brands: readonly Brand[];
}

interface FilterGroupProps {
  title: string;
  options: readonly { label: string; href: string; active: boolean }[];
}

function FilterGroup({ title, options }: FilterGroupProps) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {options.map((o) => (
          <li key={o.label}>
            <Link
              href={o.href}
              aria-current={o.active ? "true" : undefined}
              className={`block rounded-full px-3 py-1 text-sm lg:rounded-md ${
                o.active ? "bg-brand text-brand-contrast" : "bg-surface hover:text-brand"
              }`}
            >
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ListingFilters({ params, categories, brands }: ListingFiltersProps) {
  return (
    <aside className="space-y-6">
      <FilterGroup
        title="Category"
        options={[
          { label: "All", href: listingHref(params, { category: null }), active: !params.category },
          ...categories.map((c) => ({
            label: c.name,
            href: listingHref(params, { category: c.slug }),
            active: params.category === c.slug,
          })),
        ]}
      />
      <FilterGroup
        title="Brand"
        options={[
          { label: "All", href: listingHref(params, { brand: null }), active: !params.brand },
          ...brands.map((b) => ({ label: b.name, href: listingHref(params, { brand: b.slug }), active: params.brand === b.slug })),
        ]}
      />
      <FilterGroup
        title="Condition"
        options={[
          { label: "Any", href: listingHref(params, { condition: null }), active: !params.condition },
          ...PRODUCT_CONDITIONS.map((c) => ({
            label: CONDITION_LABELS[c],
            href: listingHref(params, { condition: c }),
            active: params.condition === c,
          })),
        ]}
      />
      <FilterGroup
        title="Sort by"
        options={SORTS.map((s) => ({ label: SORT_LABELS[s], href: listingHref(params, { sort: s }), active: params.sort === s }))}
      />
    </aside>
  );
}
