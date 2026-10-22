import { isValidSlug } from "@/lib/catalog/slug";

// Store listing filters from the URL. Anything invalid falls back to the
// default so junk URLs never reach the database query.

export const PAGE_SIZE = 24;
const MAX_PAGE = 100;

export const PRODUCT_CONDITIONS = ["new", "refurbished_superb", "refurbished_good", "refurbished_fair"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const CONDITION_LABELS: Readonly<Record<ProductCondition, string>> = {
  new: "New",
  refurbished_superb: "Refurbished · Superb",
  refurbished_good: "Refurbished · Good",
  refurbished_fair: "Refurbished · Fair",
};

export const SORTS = ["featured", "price_asc", "price_desc", "newest"] as const;
export type ListingSort = (typeof SORTS)[number];

export const SORT_LABELS: Readonly<Record<ListingSort, string>> = {
  featured: "Featured",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  newest: "Newest",
};

export interface ListingParams {
  category: string | null;
  brand: string | null;
  condition: ProductCondition | null;
  sort: ListingSort;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function slugOrNull(value: string | undefined): string | null {
  return value && isValidSlug(value) ? value : null;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return allowed.find((a) => a === value) ?? null;
}

export function parseListingParams(raw: RawParams): ListingParams {
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    category: slugOrNull(first(raw.category)),
    brand: slugOrNull(first(raw.brand)),
    condition: oneOf(first(raw.condition), PRODUCT_CONDITIONS),
    sort: oneOf(first(raw.sort), SORTS) ?? "featured",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** URL for the listing with some params changed. Changing a filter resets to page 1. */
export function listingHref(current: ListingParams, changes: Partial<ListingParams> = {}): string {
  const changesFilter = Object.keys(changes).some((k) => k !== "page");
  const next = { ...current, ...(changesFilter ? { page: 1 } : {}), ...changes };
  const query = new URLSearchParams();
  if (next.category) query.set("category", next.category);
  if (next.brand) query.set("brand", next.brand);
  if (next.condition) query.set("condition", next.condition);
  if (next.sort !== "featured") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));
  const qs = query.toString();
  return qs ? `/shop?${qs}` : "/shop";
}
