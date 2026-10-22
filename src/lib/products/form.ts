import { z } from "zod";
import { isValidSlug, slugify } from "@/lib/catalog/slug";
import { LOCKABLE_FIELD_KEYS, type LockableField } from "@/lib/feeds/constants";
import { GST_RATES, MAX_IMAGES, MAX_STOCK, parseAmount, PRODUCT_CONDITIONS, type ProductCondition } from "@/lib/feeds/mapping";

export interface ProductInput {
  title: string;
  sku: string;
  slug: string;
  description: string | null;
  category_id: number | null;
  brand_id: number | null;
  condition: ProductCondition;
  mrp: number | null;
  price: number;
  gst_rate: number;
  hsn_code: string | null;
  stock: number;
  is_active: boolean;
  images: string[];
  locked_fields: LockableField[];
}

export type ProductFormResult = { ok: true; data: ProductInput } | { ok: false; errors: Record<string, string> };

const optionalId = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,12}$/.test(v), "Choose from the list")
  .transform((v) => (v === "" ? null : Number(v)));

const amount = (label: string) =>
  z
    .string()
    .refine((v) => v.trim() === "" || (parseAmount(v) ?? 0) > 0, `${label} must be a positive amount up to ₹1 crore`)
    .transform((v) => (v.trim() === "" ? null : parseAmount(v)));

const schema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(200, "Use 200 characters or fewer"),
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{2,64}$/, "Use 2 to 64 letters, digits, dots, dashes or underscores"),
    slug: z.string().trim().toLowerCase(),
    description: z.string().trim().max(5000, "Use 5000 characters or fewer"),
    categoryId: optionalId,
    brandId: optionalId,
    condition: z.enum(PRODUCT_CONDITIONS, { error: "Choose a condition" }),
    mrp: amount("MRP"),
    price: amount("Price").refine((v) => v !== null, "Enter the selling price"),
    gstRate: z.coerce.number().refine((v) => (GST_RATES as readonly number[]).includes(v), "Choose a GST rate"),
    hsnCode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4,8}$/.test(v), "HSN code must be 4 to 8 digits"),
    stock: z
      .string()
      .trim()
      .regex(/^\d{1,6}$/, "Stock must be a whole number")
      .transform(Number)
      .refine((v) => v <= MAX_STOCK, `Stock can be at most ${MAX_STOCK}`),
  });

function slugFor(slug: string, title: string): string {
  return slug === "" ? slugify(title).slice(0, 120).replace(/-+$/, "") : slug;
}

/** Checks that span fields. Run on the raw text so they report alongside field errors. */
function crossFieldErrors(text: (key: string) => string): Record<string, string> {
  const errors: Record<string, string> = {};
  const price = parseAmount(text("price"));
  const mrp = text("mrp").trim() === "" ? null : parseAmount(text("mrp"));
  if (price !== null && mrp !== null && price > mrp) errors.price = "Price can't be above MRP";
  const slug = slugFor(text("slug").trim().toLowerCase(), text("title").trim());
  if (!isValidSlug(slug)) errors.slug = "Use lowercase letters, digits and dashes";
  return errors;
}

const STORAGE_PATH = /^(manual|feeds)\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*(\.[a-z]{3,4})?$/;

/** Keeps only images already stored in our bucket, in the order staff arranged them. */
function storedImages(values: readonly FormDataEntryValue[], prefix: string): string[] {
  const urls = values.filter(
    (v): v is string => typeof v === "string" && v.startsWith(prefix) && STORAGE_PATH.test(v.slice(prefix.length)),
  );
  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

export function parseProductForm(form: FormData, imagePrefix: string): ProductFormResult {
  const text = (key: string): string => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = schema.safeParse({
    title: text("title"),
    sku: text("sku"),
    slug: text("slug"),
    description: text("description"),
    categoryId: text("categoryId"),
    brandId: text("brandId"),
    condition: text("condition"),
    mrp: text("mrp"),
    price: text("price"),
    gstRate: text("gstRate"),
    hsnCode: text("hsnCode"),
    stock: text("stock"),
  });
  const cross = crossFieldErrors(text);
  if (!parsed.success || Object.keys(cross).length > 0) {
    const entries = (parsed.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message] as const);
    // First message per field wins; field errors beat cross-field ones
    return { ok: false, errors: { ...cross, ...Object.fromEntries([...entries].reverse()) } };
  }
  const d = parsed.data;
  const requested = new Set(form.getAll("lock"));
  return {
    ok: true,
    data: {
      title: d.title,
      sku: d.sku,
      slug: slugFor(d.slug, d.title),
      description: d.description === "" ? null : d.description,
      category_id: d.categoryId,
      brand_id: d.brandId,
      condition: d.condition,
      mrp: d.mrp,
      price: d.price as number,
      gst_rate: d.gstRate,
      hsn_code: d.hsnCode === "" ? null : d.hsnCode,
      stock: d.stock,
      is_active: form.get("isActive") === "on",
      images: storedImages(form.getAll("image"), imagePrefix),
      locked_fields: LOCKABLE_FIELD_KEYS.filter((key) => requested.has(key)),
    },
  };
}

type Snapshot = Partial<Record<LockableField, unknown>>;

/** Compare the way the form stores values: trimmed text, blank text as null. */
function normalise(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return normalise(a) === normalise(b);
}

/**
 * Feed products: any field staff edit by hand is locked so the next import
 * doesn't undo it. Staff can still unlock fields they did not change.
 */
export function lockedFieldsAfterEdit(input: {
  source: "manual" | "feed";
  before: Snapshot;
  after: Snapshot;
  requested: readonly LockableField[];
}): LockableField[] {
  if (input.source !== "feed") return [...input.requested];
  const changed = LOCKABLE_FIELD_KEYS.filter((key) => key in input.after && !same(input.before[key], input.after[key]));
  return [...new Set([...input.requested, ...changed])];
}
