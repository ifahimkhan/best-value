import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { imagePrefix } from "@/lib/products/queries";
import { createClient } from "@/lib/supabase/server";
import { countVariantProducts, isPlaceholderImage, PLACEHOLDER_DIR } from "./admin-devices";
import type { NewDeviceInput, PriceUpdate } from "./device-form";

// Admin device creation and price edits. Callers must run requireAdmin(); the
// database functions check the admin role again and run as the signed-in user.

const DUPLICATE = "23505";

/** Every category has a generic photo, used until an admin uploads a real one. */
export function placeholderImageUrl(categorySlug: string): string {
  return `${imagePrefix()}${PLACEHOLDER_DIR}${categorySlug}.png`;
}

export type CreateDeviceResult = { ok: true; id: number } | { ok: false; error: "duplicate" | "error" };

export async function createDevice(input: NewDeviceInput): Promise<CreateDeviceResult> {
  const { variants, ...device } = input;
  const db = await createClient();
  const { data, error } = await db.rpc("admin_create_device", {
    p_device: { ...device, image_url: placeholderImageUrl(device.category_slug) },
    p_variants: variants,
  });
  if (error) {
    if (error.code === DUPLICATE) return { ok: false, error: "duplicate" };
    logger.error("createDevice failed", error);
    return { ok: false, error: "error" };
  }
  const id = z.number().int().positive().safeParse(data);
  if (!id.success) {
    logger.error("createDevice returned no id", id.error);
    return { ok: false, error: "error" };
  }
  return { ok: true, id: id.data };
}

const DETAIL_SELECT =
  "id, name, slug, image_url, is_active, release_year, brand:brands!inner(name, slug), category:categories!inner(name, slug), variants:device_variants(id, label, base_buy_price, is_active, products(count))";

const detailRow = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  image_url: z.string().nullable(),
  is_active: z.boolean(),
  release_year: z.number().nullable(),
  brand: z.object({ name: z.string(), slug: z.string() }),
  category: z.object({ name: z.string(), slug: z.string() }),
  variants: z.array(
    z.object({
      id: z.number(),
      label: z.string(),
      base_buy_price: z.coerce.number(),
      is_active: z.boolean(),
      products: z.array(z.object({ count: z.number() })),
    }),
  ),
});

export interface AdminDeviceVariant {
  id: number;
  label: string;
  price: number;
  isActive: boolean;
}

export interface AdminDeviceDetail {
  id: number;
  name: string;
  imageUrl: string | null;
  hasPlaceholder: boolean;
  isActive: boolean;
  releaseYear: number | null;
  brandName: string;
  categoryName: string;
  /** Public sell page, e.g. /sell/phone/samsung/galaxy-s23 */
  sellHref: string;
  /** Shop products of this device's variants, which can share its photo. */
  productCount: number;
  variants: AdminDeviceVariant[];
}

export async function getAdminDevice(id: number): Promise<AdminDeviceDetail | null> {
  const db = await createClient();
  const { data, error } = await db.from("devices").select(DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    logger.error("getAdminDevice failed", error, { id });
    return null;
  }
  if (!data) return null;
  const row = detailRow.safeParse(data);
  if (!row.success) {
    logger.error("getAdminDevice returned an unexpected row", row.error, { id });
    return null;
  }
  const d = row.data;
  return {
    id: d.id,
    name: d.name,
    imageUrl: d.image_url,
    hasPlaceholder: isPlaceholderImage(d.image_url),
    isActive: d.is_active,
    releaseYear: d.release_year,
    brandName: d.brand.name,
    categoryName: d.category.name,
    sellHref: `/sell/${d.category.slug}/${d.brand.slug}/${d.slug}`,
    productCount: countVariantProducts(d.variants),
    variants: [...d.variants]
      .sort((a, b) => a.base_buy_price - b.base_buy_price || a.id - b.id)
      .map((v) => ({ id: v.id, label: v.label, price: v.base_buy_price, isActive: v.is_active })),
  };
}

/** Changes base buy prices only. Variants of other devices are ignored by the database function. */
export async function setVariantPrices(deviceId: number, prices: readonly PriceUpdate[]): Promise<{ ok: true; updated: number } | { ok: false }> {
  const db = await createClient();
  const { data, error } = await db.rpc("admin_set_variant_prices", { p_device_id: deviceId, p_prices: prices });
  if (error) {
    logger.error("setVariantPrices failed", error, { deviceId });
    return { ok: false };
  }
  const updated = z.number().int().nonnegative().safeParse(data);
  return updated.success ? { ok: true, updated: updated.data } : { ok: false };
}
