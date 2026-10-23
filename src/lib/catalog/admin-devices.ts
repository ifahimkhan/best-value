import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { IMAGE_BUCKET } from "@/lib/feeds/images";
import { logger } from "@/lib/logger";
import { imagePrefix } from "@/lib/products/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEVICE_PAGE_SIZE, type DeviceListParams } from "./admin-device-list";
import { escapeLike } from "./search";

// Admin device photo management. Callers must run requireAdmin(). The device
// row is updated through the signed-in client so RLS applies too; only the
// storage upload uses the service-role client, as storage has no staff policy.

const PLACEHOLDER_DIR = "catalog/placeholders/";
const UPLOAD_DIR = "catalog/devices/";

const LIST_SELECT = "id, name, image_url, is_active, brand:brands!inner(name, slug), category:categories!inner(name, slug)";

const listRow = z.object({
  id: z.number(),
  name: z.string(),
  image_url: z.string().nullable(),
  is_active: z.boolean(),
  brand: z.object({ name: z.string() }),
  category: z.object({ name: z.string() }),
});

const optionRow = z.object({ name: z.string(), slug: z.string() });

export type AdminFilterOption = z.infer<typeof optionRow>;

// Signed-in client: RLS shows staff the hidden brands and categories too
async function listOptions(table: "brands" | "categories", orderBy: string): Promise<AdminFilterOption[]> {
  const db = await createClient();
  const { data, error } = await db.from(table).select("name, slug").order(orderBy);
  if (error) {
    logger.error(`Loading ${table} filter options failed`, error);
    return [];
  }
  const rows = z.array(optionRow).safeParse(data);
  if (!rows.success) {
    logger.error(`Unexpected ${table} filter rows`, rows.error);
    return [];
  }
  return rows.data;
}

/** Every brand, hidden ones included, for the catalog filter. */
export const listAdminBrands = (): Promise<AdminFilterOption[]> => listOptions("brands", "name");

/** Every category in site order, for the catalog filter. */
export const listAdminCategories = (): Promise<AdminFilterOption[]> => listOptions("categories", "sort_order");

export interface AdminDeviceRow {
  id: number;
  name: string;
  brandName: string;
  categoryName: string;
  imageUrl: string | null;
  isActive: boolean;
  hasPlaceholder: boolean;
}

export function isPlaceholderImage(url: string | null): boolean {
  return url === null || url.includes(`/${PLACEHOLDER_DIR}`);
}

export async function listAdminDevices(params: DeviceListParams): Promise<{ items: AdminDeviceRow[]; total: number }> {
  const db = await createClient();
  const from = (params.page - 1) * DEVICE_PAGE_SIZE;
  let query = db.from("devices").select(LIST_SELECT, { count: "exact" });
  if (params.q) query = query.ilike("name", `%${escapeLike(params.q)}%`);
  if (params.category) query = query.eq("category.slug", params.category);
  if (params.brand) query = query.eq("brand.slug", params.brand);
  if (params.image === "placeholder") query = query.or(`image_url.is.null,image_url.like.*/${PLACEHOLDER_DIR}*`);
  if (params.image === "custom") query = query.like("image_url", `%/${UPLOAD_DIR}%`);
  const { data, error, count } = await query.order("name").order("id").range(from, from + DEVICE_PAGE_SIZE - 1);
  if (error) {
    logger.error("listAdminDevices failed", error);
    return { items: [], total: 0 };
  }
  const rows = z.array(listRow).safeParse(data);
  if (!rows.success) {
    logger.error("listAdminDevices returned unexpected rows", rows.error);
    return { items: [], total: 0 };
  }
  return {
    items: rows.data.map((r) => ({
      id: r.id,
      name: r.name,
      brandName: r.brand.name,
      categoryName: r.category.name,
      imageUrl: r.image_url,
      isActive: r.is_active,
      hasPlaceholder: isPlaceholderImage(r.image_url),
    })),
    total: count ?? 0,
  };
}

/** Stores a processed WebP under a fresh name, so CDN caches never serve the old photo. */
export async function uploadDeviceImage(deviceId: number, body: Buffer): Promise<string> {
  const bucket = createAdminClient().storage.from(IMAGE_BUCKET);
  const path = `${UPLOAD_DIR}${deviceId}/${randomUUID()}.webp`;
  const { error } = await bucket.upload(path, body, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) {
    logger.error("uploadDeviceImage failed", error, { deviceId });
    throw new Error("Device image upload failed");
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

export type SetImageResult = { ok: true; previous: string | null } | { ok: false; error: "not_found" | "error" };

export async function setDeviceImage(deviceId: number, url: string): Promise<SetImageResult> {
  const db = await createClient();
  const current = await db.from("devices").select("image_url").eq("id", deviceId).maybeSingle();
  if (current.error) {
    logger.error("setDeviceImage lookup failed", current.error, { deviceId });
    return { ok: false, error: "error" };
  }
  if (!current.data) return { ok: false, error: "not_found" };

  const { data, error } = await db
    .from("devices")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("id", deviceId)
    .select("id");
  if (error) {
    logger.error("setDeviceImage update failed", error, { deviceId });
    return { ok: false, error: "error" };
  }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: "not_found" };
  const previous = (current.data as { image_url: string | null }).image_url;
  return { ok: true, previous };
}

/**
 * Deletes a photo uploaded here for this device. Shared placeholders, imported
 * photos and other devices' uploads are never touched, whatever the URL says.
 */
export async function removeDeviceImage(deviceId: number, url: string | null): Promise<void> {
  if (!url?.startsWith(imagePrefix())) return;
  const path = url.slice(imagePrefix().length);
  if (!new RegExp(`^${UPLOAD_DIR}${deviceId}/[0-9a-f-]{36}\\.webp$`).test(path)) return;
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).remove([path]);
  if (error) logger.error("removeDeviceImage failed", error);
}
