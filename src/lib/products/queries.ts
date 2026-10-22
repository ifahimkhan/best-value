import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { escapeLike } from "@/lib/catalog/search";
import { publicEnv } from "@/lib/env";
import { LOCKABLE_FIELD_KEYS, type LockableField } from "@/lib/feeds/constants";
import { IMAGE_BUCKET } from "@/lib/feeds/images";
import { PRODUCT_CONDITIONS } from "@/lib/feeds/mapping";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_PAGE_SIZE, type AdminListParams } from "./admin-list";
import type { ProductInput } from "./form";

// Staff product admin. Callers must run requireStaff(); product writes go
// through the signed-in client so RLS (staff only) applies as well. Only
// image uploads use the service-role client, because storage has no
// staff write policy.

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function imagePrefix(): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/`;
}

const LIST_SELECT = "id, sku, title, price, stock, is_active, source, images, supplier:suppliers(name)";

const listRow = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  price: z.coerce.number(),
  stock: z.number(),
  is_active: z.boolean(),
  source: z.enum(["manual", "feed"]),
  images: z.array(z.string()),
  supplier: z.object({ name: z.string() }).nullable(),
});

export interface AdminProductRow {
  id: string;
  sku: string;
  title: string;
  price: number;
  stock: number;
  isActive: boolean;
  source: "manual" | "feed";
  image: string | null;
  supplierName: string | null;
}

export async function listAdminProducts(params: AdminListParams): Promise<{ items: AdminProductRow[]; total: number }> {
  const db = await createClient();
  const from = (params.page - 1) * ADMIN_PAGE_SIZE;
  let query = db.from("products").select(LIST_SELECT, { count: "exact" });
  // normalizeQuery already removed commas and parentheses, so this is safe inside or()
  if (params.q) query = query.or(`title.ilike.%${escapeLike(params.q)}%,sku.ilike.%${escapeLike(params.q)}%`);
  if (params.source !== "all") query = query.eq("source", params.source);
  if (params.status === "active") query = query.eq("is_active", true);
  if (params.status === "inactive") query = query.eq("is_active", false);
  if (params.status === "out_of_stock") query = query.eq("stock", 0);
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) {
    logger.error("listAdminProducts failed", error);
    return { items: [], total: 0 };
  }
  const rows = z.array(listRow).safeParse(data);
  if (!rows.success) return { items: [], total: 0 };
  return {
    items: rows.data.map((r) => ({
      id: r.id,
      sku: r.sku,
      title: r.title,
      price: r.price,
      stock: r.stock,
      isActive: r.is_active,
      source: r.source,
      image: r.images[0] ?? null,
      supplierName: r.supplier?.name ?? null,
    })),
    total: count ?? 0,
  };
}

const DETAIL_SELECT =
  "id, sku, slug, title, description, category_id, brand_id, condition, mrp, price, gst_rate, hsn_code, stock, images, is_active, source, supplier_sku, locked_fields, updated_at, supplier:suppliers(id, name)";

const detailRow = z.object({
  id: z.string(),
  sku: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category_id: z.number().nullable(),
  brand_id: z.number().nullable(),
  condition: z.enum(PRODUCT_CONDITIONS),
  mrp: z.coerce.number().nullable(),
  price: z.coerce.number(),
  gst_rate: z.coerce.number(),
  hsn_code: z.string().nullable(),
  stock: z.number(),
  images: z.array(z.string()),
  is_active: z.boolean(),
  source: z.enum(["manual", "feed"]),
  supplier_sku: z.string().nullable(),
  locked_fields: z.array(z.string()),
  updated_at: z.string(),
  supplier: z.object({ id: z.number(), name: z.string() }).nullable(),
});

export type AdminProduct = Omit<z.infer<typeof detailRow>, "locked_fields"> & { locked_fields: LockableField[] };

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const db = await createClient();
  const { data, error } = await db.from("products").select(DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    logger.error("getAdminProduct failed", error, { id });
    return null;
  }
  const row = detailRow.safeParse(data);
  if (!row.success) return null;
  const locked = new Set(row.data.locked_fields);
  return { ...row.data, locked_fields: LOCKABLE_FIELD_KEYS.filter((key) => locked.has(key)) };
}

export interface Option {
  id: number;
  name: string;
}

const optionRows = z.array(z.object({ id: z.number(), name: z.string() }));

export async function listProductOptions(): Promise<{ brands: Option[]; categories: Option[] }> {
  const db = await createClient();
  const [brands, categories] = await Promise.all([
    db.from("brands").select("id, name").order("name"),
    db.from("categories").select("id, name").order("name"),
  ]);
  if (brands.error || categories.error) logger.error("listProductOptions failed", brands.error ?? categories.error);
  return {
    brands: optionRows.safeParse(brands.data).data ?? [],
    categories: optionRows.safeParse(categories.data).data ?? [],
  };
}

export type WriteResult = { ok: true; id: string } | { ok: false; error: "duplicate_sku" | "duplicate_slug" | "stale" | "error" };

function writeError(error: { code?: string; message?: string }): WriteResult {
  if (error.code === "23505" && error.message?.includes("products_sku_key")) return { ok: false, error: "duplicate_sku" };
  if (error.code === "23505" && error.message?.includes("products_slug_key")) return { ok: false, error: "duplicate_slug" };
  return { ok: false, error: "error" };
}

export async function insertProduct(input: ProductInput): Promise<WriteResult> {
  const db = await createClient();
  const { data, error } = await db.from("products").insert({ ...input, source: "manual" }).select("id").single();
  if (error) {
    logger.error("insertProduct failed", error);
    return writeError(error);
  }
  return { ok: true, id: String(data.id) };
}

/**
 * Saves only if nobody (staff or a feed import) changed the product since the
 * form was loaded; otherwise reports "stale" instead of overwriting their change.
 */
export async function updateProduct(id: string, input: ProductInput, loadedAt: string): Promise<WriteResult> {
  const db = await createClient();
  const { data, error } = await db.from("products").update(input).eq("id", id).eq("updated_at", loadedAt).select("id").maybeSingle();
  if (error) {
    logger.error("updateProduct failed", error, { id });
    return writeError(error);
  }
  return data ? { ok: true, id } : { ok: false, error: "stale" };
}

/** Returns the deleted product's images, or null when nothing was deleted. */
export async function deleteProduct(id: string): Promise<string[] | null> {
  const db = await createClient();
  // Order lines keep their own copy of title, price and SKU (product_id is set to null)
  const { data, error } = await db.from("products").delete().eq("id", id).select("images").maybeSingle();
  if (error) logger.error("deleteProduct failed", error, { id });
  if (error || !data) return null;
  return z.array(z.string()).catch([]).parse(data.images);
}

/** Stores validated image bytes and returns their public URLs. */
export async function uploadProductImages(files: readonly { body: Buffer; contentType: string; extension: string }[]): Promise<string[]> {
  const bucket = createAdminClient().storage.from(IMAGE_BUCKET);
  const urls: string[] = [];
  for (const file of files) {
    const path = `manual/${randomUUID()}.${file.extension}`;
    const { error } = await bucket.upload(path, file.body, { contentType: file.contentType, cacheControl: "31536000", upsert: false });
    if (error) {
      await removeUploadedImages(urls);
      throw new Error("Image upload failed");
    }
    urls.push(bucket.getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

/**
 * Best-effort removal of hand-uploaded images (manual/ only). Feed images are
 * shared between runs and keyed by source URL, so they are never removed here.
 */
export async function removeUploadedImages(urls: readonly string[]): Promise<void> {
  const prefix = imagePrefix();
  const paths = urls.filter((u) => u.startsWith(`${prefix}manual/`)).map((u) => u.slice(prefix.length));
  if (paths.length === 0) return;
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).remove(paths);
  if (error) logger.error("removeUploadedImages failed", error);
}
