import { z } from "zod";
import type { FeedRow } from "./parse";

export const PRODUCT_CONDITIONS = ["new", "refurbished_superb", "refurbished_good", "refurbished_fair"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const GST_RATES = [0, 3, 5, 12, 18, 28] as const;

const MAX_PRICE = 10_000_000;
export const MAX_STOCK = 100_000;
export const MAX_IMAGES = 8;

export const PRODUCT_FIELDS = {
  sku: { label: "Supplier SKU", required: true, aliases: ["sku", "itemcode", "productcode", "code", "partnumber", "itemid", "productid", "modelnumber"] },
  title: { label: "Title", required: true, aliases: ["title", "name", "productname", "itemname", "producttitle"] },
  price: { label: "Price (incl. GST)", required: true, aliases: ["price", "sellingprice", "saleprice", "dealerprice", "offerprice", "ourprice", "unitprice"] },
  mrp: { label: "MRP", required: false, aliases: ["mrp", "listprice", "maximumretailprice", "retailprice", "originalprice"] },
  stock: { label: "Stock", required: false, aliases: ["stock", "qty", "quantity", "inventory", "available", "availableqty", "stockqty", "onhand"] },
  description: { label: "Description", required: false, aliases: ["description", "details", "longdescription", "productdescription", "body"] },
  condition: { label: "Condition", required: false, aliases: ["condition", "grade", "productcondition", "quality"] },
  brand: { label: "Brand", required: false, aliases: ["brand", "make", "manufacturer", "brandname"] },
  category: { label: "Category", required: false, aliases: ["category", "producttype", "categoryname", "department"] },
  gstRate: { label: "GST rate %", required: false, aliases: ["gst", "gstrate", "tax", "taxrate", "gstpercent", "igst"] },
  hsnCode: { label: "HSN code", required: false, aliases: ["hsn", "hsncode", "hsnsac", "sac"] },
  images: { label: "Image URLs", required: false, aliases: ["images", "image", "imageurl", "imageurls", "imagelink", "photo", "photos", "picture", "mainimage"] },
  active: { label: "Active / status", required: false, aliases: ["active", "status", "isactive", "enabled", "listed"] },
} as const;

export type FieldKey = keyof typeof PRODUCT_FIELDS;
export const FIELD_KEYS = Object.keys(PRODUCT_FIELDS) as FieldKey[];

const columnName = z.string().trim().min(1).max(200).optional().catch(undefined);

const fieldsSchema = z.object(
  Object.fromEntries(FIELD_KEYS.map((key) => [key, columnName])) as Record<FieldKey, typeof columnName>,
);

export const DEFAULT_OPTIONS = {
  missing: "keep",
  defaultCondition: "new",
  defaultGstRate: 18,
  markupPercent: 0,
} as const satisfies FeedOptions;

const optionsSchema = z.object({
  missing: z.enum(["keep", "zero_stock"]).catch(DEFAULT_OPTIONS.missing),
  defaultCondition: z.enum(PRODUCT_CONDITIONS).catch(DEFAULT_OPTIONS.defaultCondition),
  defaultGstRate: z
    .number()
    .refine((rate) => (GST_RATES as readonly number[]).includes(rate))
    .catch(DEFAULT_OPTIONS.defaultGstRate),
  markupPercent: z.number().min(0).max(300).catch(DEFAULT_OPTIONS.markupPercent),
});

export interface FeedOptions {
  missing: "keep" | "zero_stock";
  defaultCondition: ProductCondition;
  defaultGstRate: number;
  markupPercent: number;
}

export interface FeedMapping {
  fields: Partial<Record<FieldKey, string>>;
  options: FeedOptions;
}

/** Reads suppliers.field_mapping; anything malformed falls back to safe defaults. */
export function parseMapping(raw: unknown): FeedMapping {
  const source = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields = fieldsSchema.catch({} as z.infer<typeof fieldsSchema>).parse(source.fields ?? {});
  const options = optionsSchema.parse(source.options ?? {});
  const definedFields = Object.fromEntries(Object.entries(fields).filter(([, column]) => column !== undefined));
  return { fields: definedFields, options };
}

function normaliseHeader(column: string): string {
  return column.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Guesses which column feeds which product field from common header names. */
export function suggestMapping(columns: readonly string[]): Partial<Record<FieldKey, string>> {
  const byName = new Map(columns.map((column) => [normaliseHeader(column), column]));
  const used = new Set<string>();
  const entries = FIELD_KEYS.flatMap((key) => {
    const aliases: readonly string[] = PRODUCT_FIELDS[key].aliases;
    const match = aliases.map((alias) => byName.get(alias)).find((column) => column && !used.has(column));
    if (!match) return [];
    used.add(match);
    return [[key, match] as const];
  });
  return Object.fromEntries(entries);
}

export interface FeedItem {
  supplierSku: string;
  title: string;
  price: number;
  mrp: number | null;
  stock: number;
  description: string | null;
  condition: ProductCondition;
  brandName: string | null;
  categoryName: string | null;
  gstRate: number;
  hsnCode: string | null;
  images: string[];
  isActive: boolean;
}

export interface FieldError {
  field: FieldKey;
  message: string;
}

export type MapResult = { ok: true; item: FeedItem } | { ok: false; errors: FieldError[] };

const roundPaise = (value: number): number => Math.round(value * 100) / 100;

/** "₹1,299.00", "Rs. 1299", "INR 1299" -> 1299 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/₹|rs\.?|inr|,|\s/gi, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= MAX_PRICE ? value : null;
}

function parseCondition(raw: string, fallback: ProductCondition): ProductCondition {
  const text = raw.toLowerCase().replace(/[_-]/g, " ");
  if (text === "") return fallback;
  const exact = PRODUCT_CONDITIONS.find((condition) => condition.replace(/_/g, " ") === text);
  if (exact) return exact;
  if (/like new|superb|excellent|grade a|\ba\+/.test(text)) return "refurbished_superb";
  if (/fair|grade c|average|acceptable/.test(text)) return "refurbished_fair";
  if (/good|grade b|refurb|used|pre owned/.test(text)) return "refurbished_good";
  if (/new|sealed/.test(text)) return "new";
  return fallback;
}

const INACTIVE_WORDS = new Set(["0", "no", "n", "false", "inactive", "disabled", "discontinued", "delisted", "hidden", "off", "archived", "unavailable", "out of stock", "not available"]);

function parseImages(raw: string): string[] {
  const urls = raw
    .split(/[\s,|]+/)
    .filter((part) => {
      if (part.length > 2000) return false;
      try {
        return new URL(part).protocol === "https:";
      } catch {
        return false;
      }
    });
  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

const optionalText = (value: string, max: number): string | null => (value === "" ? null : value.slice(0, max));

type Reader = (key: FieldKey) => string;
type Fail = (field: FieldKey, message: string) => void;

interface NumericFields {
  price: number;
  mrp: number | null;
  stock: number;
  gstRate: number;
  hsnCode: string | null;
}

function readNumbers(read: Reader, options: FeedOptions, fail: Fail): NumericFields {
  const basePrice = parseAmount(read("price"));
  if (basePrice === null || basePrice <= 0) fail("price", "Price is not a valid amount");
  const price = roundPaise((basePrice ?? 0) * (1 + options.markupPercent / 100));

  const mrpText = read("mrp");
  const parsedMrp = mrpText === "" ? null : parseAmount(mrpText);
  if (mrpText !== "" && parsedMrp === null) fail("mrp", "MRP is not a valid amount");
  // A supplier MRP below our selling price would break the price <= mrp rule, so drop it
  const mrp = parsedMrp !== null && parsedMrp >= price ? parsedMrp : null;

  const stockText = read("stock").replace(/,/g, "");
  const stock = stockText === "" ? 0 : /^\d+$/.test(stockText) ? Number(stockText) : -1;
  if (stock < 0 || stock > MAX_STOCK) fail("stock", "Stock must be a whole number from 0");

  const gstText = read("gstRate").replace(/%/g, "").trim();
  const gstRate = gstText === "" ? options.defaultGstRate : Number(gstText);
  if (!(GST_RATES as readonly number[]).includes(gstRate)) fail("gstRate", `GST rate must be one of ${GST_RATES.join(", ")}`);

  const hsnCode = read("hsnCode").replace(/\s/g, "");
  if (hsnCode !== "" && !/^\d{4,8}$/.test(hsnCode)) fail("hsnCode", "HSN code must be 4 to 8 digits");

  return { price, mrp, stock, gstRate, hsnCode: hsnCode === "" ? null : hsnCode };
}

/** Reads the SKU cell of a row as written, for reporting rows that fail validation. */
export function rawSku(row: FeedRow, mapping: FeedMapping): string | null {
  const column = mapping.fields.sku;
  const value = column && Object.hasOwn(row, column) ? (row[column] ?? "").trim() : "";
  return value === "" ? null : value.slice(0, 100);
}

/** Turns one supplier row into a validated product, collecting every problem in the row. */
export function applyMapping(row: FeedRow, mapping: FeedMapping): MapResult {
  const { fields, options } = mapping;
  const read: Reader = (key) => {
    const column = fields[key];
    return column && Object.hasOwn(row, column) ? (row[column] ?? "").trim() : "";
  };
  const errors: FieldError[] = [];
  const fail: Fail = (field, message) => {
    errors.push({ field, message });
  };

  const supplierSku = read("sku");
  if (supplierSku === "") fail("sku", "SKU is missing");
  else if (supplierSku.length > 100) fail("sku", "SKU is longer than 100 characters");
  const title = read("title").slice(0, 200);
  if (title === "") fail("title", "Title is missing");
  const numbers = readNumbers(read, options, fail);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    item: {
      supplierSku,
      title,
      ...numbers,
      description: optionalText(read("description"), 5000),
      condition: parseCondition(read("condition"), options.defaultCondition),
      brandName: optionalText(read("brand"), 100),
      categoryName: optionalText(read("category"), 100),
      images: parseImages(read("images")),
      isActive: !INACTIVE_WORDS.has(read("active").toLowerCase()),
    },
  };
}
