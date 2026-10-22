import { z } from "zod";

// Supabase rows are external data: validate shape before the UI trusts them.
// numeric columns may arrive as strings ("42000.00"), so prices are coerced.

const price = z.coerce.number().nonnegative();

const brandRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  logo_url: z.string().nullable(),
});

const deviceRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  image_url: z.string().nullable(),
  brand: z.object({ name: z.string(), slug: z.string() }),
  category: z.object({ slug: z.string() }),
  variants: z.array(z.object({ base_buy_price: price })),
});

const deviceDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  image_url: z.string().nullable(),
  brand: z.object({ name: z.string(), slug: z.string() }),
  category: z.object({ name: z.string(), slug: z.string() }),
  variants: z.array(
    z.object({ id: z.number(), label: z.string(), slug: z.string(), base_buy_price: price }),
  ),
});

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface DeviceSummary {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  brandName: string;
  brandSlug: string;
  categorySlug: string;
  href: string;
  maxPrice: number | null; // best "get up to" price across variants
}

export interface Variant {
  id: number;
  label: string;
  slug: string;
  price: number;
  href: string;
}

export interface DeviceDetail {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
  href: string;
  variants: Variant[];
}

export function deviceHref(categorySlug: string, brandSlug: string, deviceSlug: string): string {
  return `/sell/${categorySlug}/${brandSlug}/${deviceSlug}`;
}

/** Validates each row on its own so one bad row cannot blank a whole page. */
function parseEach<T, R>(rows: unknown, schema: z.ZodType<T>, map: (row: T) => R): R[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [map(parsed.data)] : [];
  });
}

export function parseBrandRows(rows: unknown): Brand[] {
  return parseEach(rows, brandRowSchema, (r) => ({ id: r.id, name: r.name, slug: r.slug, logoUrl: r.logo_url }));
}

export function parseDeviceRows(rows: unknown): DeviceSummary[] {
  return parseEach(rows, deviceRowSchema, (r) => {
    const prices = r.variants.map((v) => v.base_buy_price);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      imageUrl: r.image_url,
      brandName: r.brand.name,
      brandSlug: r.brand.slug,
      categorySlug: r.category.slug,
      href: deviceHref(r.category.slug, r.brand.slug, r.slug),
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    };
  });
}

export function parseDeviceDetail(row: unknown): DeviceDetail | null {
  const parsed = deviceDetailSchema.safeParse(row);
  if (!parsed.success) return null;

  const r = parsed.data;
  const href = deviceHref(r.category.slug, r.brand.slug, r.slug);
  const variants = r.variants
    .map((v) => ({ id: v.id, label: v.label, slug: v.slug, price: v.base_buy_price, href: `${href}/${v.slug}` }))
    .sort((a, b) => a.price - b.price);

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    imageUrl: r.image_url,
    brandName: r.brand.name,
    brandSlug: r.brand.slug,
    categoryName: r.category.name,
    categorySlug: r.category.slug,
    href,
    variants,
  };
}
