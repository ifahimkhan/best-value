import { createHash } from "node:crypto";
import { slugify } from "@/lib/catalog/slug";
import type { FeedItem, FieldKey, ProductCondition } from "./mapping";

export interface ExistingProduct {
  id: string;
  supplierSku: string;
  title: string;
  price: number;
  mrp: number | null;
  stock: number;
  description: string | null;
  condition: ProductCondition;
  brandId: number | null;
  categoryId: number | null;
  gstRate: number;
  hsnCode: string | null;
  images: string[];
  isActive: boolean;
  /** Column names staff have pinned; the feed never overwrites these. */
  lockedFields: string[];
}

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface ProductValues {
  title: string;
  description: string | null;
  condition: ProductCondition;
  brand_id: number | null;
  category_id: number | null;
  mrp: number | null;
  price: number;
  gst_rate: number;
  hsn_code: string | null;
  stock: number;
  images: string[];
  is_active: boolean;
}

export interface ProductInsert extends ProductValues {
  supplier_id: number;
  supplier_sku: string;
  sku: string;
  slug: string;
  source: "feed";
}

export interface ProductUpdate {
  id: string;
  changes: Partial<ProductValues>;
}

export interface PlanError {
  row: number;
  sku: string;
  message: string;
}

export interface ImportPlan {
  inserts: ProductInsert[];
  updates: ProductUpdate[];
  /** Stock set to 0 because the product is no longer in the feed (kept apart from row counts). */
  zeroed: ProductUpdate[];
  unchanged: number;
  errors: PlanError[];
}

export interface PlanInput {
  supplierId: number;
  items: readonly { row: number; item: FeedItem }[];
  existing: readonly ExistingProduct[];
  brands: readonly NamedRef[];
  categories: readonly NamedRef[];
  missingPolicy: "keep" | "zero_stock";
  /** Fields the supplier mapping fills; unmapped ones never overwrite existing products. Defaults to all. */
  mappedFields?: ReadonlySet<FieldKey>;
  /** SKUs present in the feed whose rows failed validation; never treated as missing. */
  failedSkus?: ReadonlySet<string>;
}

const COLUMN_FIELD: Record<keyof ProductValues, FieldKey> = {
  title: "title",
  description: "description",
  condition: "condition",
  brand_id: "brand",
  category_id: "category",
  mrp: "mrp",
  price: "price",
  gst_rate: "gstRate",
  hsn_code: "hsnCode",
  stock: "stock",
  images: "images",
  is_active: "active",
};

const shortHash = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 6);

function storeSku(supplierId: number, supplierSku: string): string {
  const safe = supplierSku.replace(/[^A-Za-z0-9._-]/g, "-");
  // Sanitising can make two supplier SKUs collide, so add a hash whenever it changed anything
  return safe === supplierSku ? `S${supplierId}-${safe}` : `S${supplierId}-${safe}-${shortHash(supplierSku)}`;
}

function productSlug(supplierId: number, item: FeedItem): string {
  const base = slugify(item.title).slice(0, 80).replace(/-+$/, "") || "product";
  return `${base}-s${supplierId}-${shortHash(`${supplierId}:${item.supplierSku}`)}`;
}

function lookup(refs: readonly NamedRef[], name: string | null): number | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const slug = slugify(name);
  return refs.find((ref) => ref.name.toLowerCase() === lower || ref.slug === slug)?.id ?? null;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

export function currentValues(product: ExistingProduct): ProductValues {
  return {
    title: product.title,
    description: product.description,
    condition: product.condition,
    brand_id: product.brandId,
    category_id: product.categoryId,
    mrp: product.mrp,
    price: product.price,
    gst_rate: product.gstRate,
    hsn_code: product.hsnCode,
    stock: product.stock,
    images: product.images,
    is_active: product.isActive,
  };
}

/** Builds the new values for an existing product; returns an error message when it cannot be updated. */
function mergeValues(
  current: ProductValues,
  incoming: ProductValues,
  locked: ReadonlySet<string>,
  mapped: ReadonlySet<FieldKey>,
): ProductValues | string {
  const keep = (column: keyof ProductValues): boolean => {
    if (locked.has(column) || !mapped.has(COLUMN_FIELD[column])) return true;
    // Blank optional values and unknown brands/categories keep what staff entered
    const value = incoming[column];
    return value === null || (Array.isArray(value) && value.length === 0);
  };
  const merged = Object.fromEntries(
    (Object.keys(current) as (keyof ProductValues)[]).map((column) => [column, keep(column) ? current[column] : incoming[column]]),
  ) as unknown as ProductValues;

  const mrpCleared = !locked.has("mrp") && mapped.has("mrp") && incoming.mrp === null;
  const mrp = mrpCleared ? null : merged.mrp;
  if (mrp !== null && merged.price > mrp) {
    if (locked.has("mrp")) return "Price is above the locked MRP";
    return { ...merged, mrp: null };
  }
  return { ...merged, mrp };
}

function diff(current: ProductValues, next: ProductValues): Partial<ProductValues> {
  return Object.fromEntries(
    (Object.keys(next) as (keyof ProductValues)[]).filter((k) => !sameValue(current[k], next[k])).map((k) => [k, next[k]]),
  ) as Partial<ProductValues>;
}

function incomingValues(item: FeedItem, input: PlanInput): ProductValues {
  return {
    title: item.title,
    description: item.description,
    condition: item.condition,
    brand_id: lookup(input.brands, item.brandName),
    category_id: lookup(input.categories, item.categoryName),
    mrp: item.mrp,
    price: item.price,
    gst_rate: item.gstRate,
    hsn_code: item.hsnCode,
    stock: item.stock,
    images: item.images,
    is_active: item.isActive,
  };
}

function newProduct(input: PlanInput, item: FeedItem, values: ProductValues): ProductInsert {
  return {
    ...values,
    supplier_id: input.supplierId,
    supplier_sku: item.supplierSku,
    sku: storeSku(input.supplierId, item.supplierSku),
    slug: productSlug(input.supplierId, item),
    source: "feed",
  };
}

function zeroMissing(input: PlanInput, seen: ReadonlySet<string>): ProductUpdate[] {
  if (input.missingPolicy !== "zero_stock") return [];
  const present = (sku: string): boolean => seen.has(sku) || (input.failedSkus?.has(sku) ?? false);
  return input.existing
    .filter((p) => !present(p.supplierSku) && p.stock !== 0 && !p.lockedFields.includes("stock"))
    .map((p) => ({ id: p.id, changes: { stock: 0 } }));
}

/** Works out which products to create or update for one supplier feed. Pure: no I/O. */
export function planImport(input: PlanInput): ImportPlan {
  const mapped = input.mappedFields ?? new Set(Object.values(COLUMN_FIELD));
  const bySku = new Map(input.existing.map((product) => [product.supplierSku, product]));
  const seen = new Set<string>();
  const inserts: ProductInsert[] = [];
  const updates: ProductUpdate[] = [];
  const errors: PlanError[] = [];
  let unchanged = 0;

  for (const { row, item } of input.items) {
    if (seen.has(item.supplierSku)) {
      errors.push({ row, sku: item.supplierSku, message: "Duplicate SKU in this feed" });
      continue;
    }
    seen.add(item.supplierSku);
    const incoming = incomingValues(item, input);
    const existing = bySku.get(item.supplierSku);
    if (!existing) {
      inserts.push(newProduct(input, item, incoming));
      continue;
    }
    const current = currentValues(existing);
    const merged = mergeValues(current, incoming, new Set(existing.lockedFields), mapped);
    if (typeof merged === "string") {
      errors.push({ row, sku: item.supplierSku, message: merged });
      continue;
    }
    const changes = diff(current, merged);
    if (Object.keys(changes).length === 0) unchanged += 1;
    else updates.push({ id: existing.id, changes });
  }

  return { inserts, updates, zeroed: zeroMissing(input, seen), unchanged, errors };
}
