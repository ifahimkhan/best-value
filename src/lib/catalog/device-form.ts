import { isValidSlug, slugify } from "./slug";

// Parses the admin "add device" and "edit prices" forms. Labels and slugs are
// built the same way as the imported catalog ("8 GB / 256 GB", "8-gb-256-gb").

export const MAX_BUY_PRICE = 1_000_000;
export const MAX_VARIANTS = 20;
const MAX_PRICE_ROWS = 50;
const PRICE_ERROR = "Enter a price from ₹0 to ₹10,00,000";
// Every phone and tablet in the catalog is sold by RAM and storage size
const MEMORY_CATEGORIES = new Set(["phone", "tablet"]);

export interface NewVariant {
  label: string;
  slug: string;
  ram_gb: number | null;
  storage_gb: number | null;
  base_buy_price: number;
}

export interface NewDeviceInput {
  category_slug: string;
  brand_slug: string;
  name: string;
  slug: string;
  release_year: number | null;
  is_top_selling: boolean;
  is_active: boolean;
  variants: NewVariant[];
}

export type FormErrors = Record<string, string>;

export function formatStorage(gb: number): string {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
}

export function variantLabel(ramGb: number | null, storageGb: number | null): string {
  if (storageGb === null) return "Standard";
  return ramGb === null ? formatStorage(storageGb) : `${ramGb} GB / ${formatStorage(storageGb)}`;
}

/** Rupees with up to 2 decimals, commas and ₹ allowed, from 0 to ₹10 lakh. */
export function parseBuyPrice(raw: string): number | null {
  const cleaned = raw.replace(/₹|,|\s/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= MAX_BUY_PRICE ? value : null;
}

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const texts = (form: FormData, key: string): string[] => form.getAll(key).map((v) => (typeof v === "string" ? v.trim() : ""));

const size = (raw: string): number | null | undefined => {
  if (raw === "") return null;
  return /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : undefined;
};

type VariantRow = { ok: true; variant: NewVariant } | { ok: false; error: string } | null;

function parseVariantRow(ramRaw: string, storageRaw: string, priceRaw: string, needsStorage: boolean): VariantRow {
  if (ramRaw === "" && storageRaw === "" && priceRaw === "") return null;
  const ram = size(ramRaw);
  const storage = size(storageRaw);
  if (ram === undefined || storage === undefined) return { ok: false, error: "RAM and storage must be whole numbers of GB" };
  if (ram !== null && storage === null) return { ok: false, error: "Enter the storage as well as the RAM" };
  if (needsStorage && storage === null) return { ok: false, error: "Phones and tablets need the storage size" };
  const price = parseBuyPrice(priceRaw);
  if (price === null) return { ok: false, error: PRICE_ERROR };
  const label = variantLabel(ram, storage);
  return { ok: true, variant: { label, slug: storage === null ? "default" : slugify(label), ram_gb: ram, storage_gb: storage, base_buy_price: price } };
}

function parseVariants(form: FormData, needsStorage: boolean): { variants: NewVariant[]; errors: FormErrors } {
  const ram = texts(form, "variantRam");
  const storage = texts(form, "variantStorage");
  const price = texts(form, "variantPrice");
  const rows = Math.max(ram.length, storage.length, price.length);
  // Blank rows are allowed, but a huge form is rejected before any parsing
  if (rows > MAX_VARIANTS * 2) return { variants: [], errors: { variants: `Add at most ${MAX_VARIANTS} variants` } };
  const errors: FormErrors = {};
  const variants: NewVariant[] = [];
  for (let i = 0; i < rows; i++) {
    const row = parseVariantRow(ram[i] ?? "", storage[i] ?? "", price[i] ?? "", needsStorage);
    if (row === null) continue;
    if (!row.ok) errors[`variant-${i}`] = row.error;
    else if (variants.some((v) => v.slug === row.variant.slug)) errors[`variant-${i}`] = "This variant is listed twice";
    else variants.push(row.variant);
  }
  if (Object.keys(errors).length === 0 && variants.length === 0) return { variants, errors: { variants: "Add at least one variant with a price" } };
  if (variants.length > MAX_VARIANTS) return { variants, errors: { variants: `Add at most ${MAX_VARIANTS} variants` } };
  return { variants, errors };
}

function nameError(name: string, slug: string): string | null {
  if (name === "") return "Enter the device name";
  if (name.length > 120) return "Use 120 characters or fewer";
  return isValidSlug(slug) ? null : "Use some letters or digits in the name";
}

export function parseNewDeviceForm(form: FormData): { ok: true; data: NewDeviceInput } | { ok: false; errors: FormErrors } {
  const category = text(form, "category");
  const brand = text(form, "brand");
  const name = text(form, "name").replace(/\s+/g, " ");
  const slug = slugify(name);
  const yearRaw = text(form, "releaseYear");
  const year = Number(yearRaw);
  const { variants, errors: variantErrors } = parseVariants(form, MEMORY_CATEGORIES.has(category));

  const errors: FormErrors = {};
  if (!isValidSlug(category)) errors.category = "Choose a category";
  if (!isValidSlug(brand)) errors.brand = "Choose a brand";
  const badName = nameError(name, slug);
  if (badName) errors.name = badName;
  if (yearRaw !== "" && !(Number.isInteger(year) && year >= 2000 && year <= 2100)) errors.releaseYear = "Use a year from 2000 to 2100";
  const allErrors = { ...errors, ...variantErrors };
  if (Object.keys(allErrors).length > 0) return { ok: false, errors: allErrors };

  return {
    ok: true,
    data: {
      category_slug: category,
      brand_slug: brand,
      name,
      slug,
      release_year: yearRaw === "" ? null : year,
      is_top_selling: form.get("isTopSelling") === "on",
      is_active: form.get("isActive") === "on",
      variants,
    },
  };
}

export interface PriceUpdate {
  variant_id: number;
  price: number;
}

/** Reads `price-<variantId>` fields. Errors are keyed by variant id. */
export function parsePriceForm(form: FormData): { ok: true; prices: PriceUpdate[] } | { ok: false; errors: FormErrors } {
  const prices: PriceUpdate[] = [];
  const errors: FormErrors = {};
  for (const [key, value] of form.entries()) {
    const match = /^price-([1-9]\d{0,14})$/.exec(key);
    if (!match) continue;
    if (prices.length + Object.keys(errors).length >= MAX_PRICE_ROWS) return { ok: false, errors: {} };
    const price = typeof value === "string" ? parseBuyPrice(value.trim()) : null;
    if (price === null) errors[match[1]] = PRICE_ERROR;
    else prices.push({ variant_id: Number(match[1]), price });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (prices.length === 0 || prices.length > MAX_PRICE_ROWS) return { ok: false, errors: {} };
  return { ok: true, prices };
}
