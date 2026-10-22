export const MAX_QUERY_LENGTH = 60;
const MIN_QUERY_LENGTH = 2;

export interface BrandRef {
  slug: string;
  name: string;
}

export interface SplitQuery {
  brandSlug: string | null;
  text: string;
}

/**
 * Cleans a user search query. Keeps letters, digits, spaces and "+-." only, so the
 * value is safe to embed in PostgREST filter strings (no commas or parentheses).
 */
export function normalizeQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  return cleaned.length >= MIN_QUERY_LENGTH ? cleaned : null;
}

/** Escapes LIKE/ILIKE wildcards so user text is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** "apple iphone 15" -> { brandSlug: "apple", text: "iphone 15" }. Whole-word match only. */
export function splitBrandFromQuery(query: string, brands: readonly BrandRef[]): SplitQuery {
  const tokens = query.split(" ").filter(Boolean);
  const byName = new Map(brands.map((b) => [b.name.toLowerCase().replace(/\s+/g, ""), b.slug]));

  const index = tokens.findIndex((t) => byName.has(t.toLowerCase()));
  if (index === -1) return { brandSlug: null, text: query };

  const brandSlug = byName.get(tokens[index].toLowerCase()) ?? null;
  const text = tokens.filter((_, i) => i !== index).join(" ");
  return { brandSlug, text };
}
