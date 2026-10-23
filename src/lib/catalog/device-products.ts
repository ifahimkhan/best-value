import "server-only";
import { z } from "zod";
import { MAX_IMAGES } from "@/lib/feeds/mapping";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

// Shares one device photo with the shop products of all the device's
// variants. The photo is stored once; products only reference its URL.
// Callers must run requireAdmin(). Writes go through RLS (staff products).

const productRow = z.object({
  id: z.string(),
  images: z.array(z.string()),
  source: z.enum(["manual", "feed"]),
  locked_fields: z.array(z.string()),
  updated_at: z.string(),
});

export interface ApplyResult {
  updated: number;
  /** Already had the maximum number of photos; left unchanged so none of theirs is lost. */
  skippedFull: number;
  failed: number;
}

/**
 * The device photo first, with every earlier photo of the same device removed
 * (so retries never leave a stale one). Returns null when the product is full
 * and adding the photo would push one of its own photos out.
 */
export function withDeviceImage(images: readonly string[], url: string, deviceId: number): string[] | null {
  const ownDevicePhoto = new RegExp(`/catalog/devices/${deviceId}/[^/]+$`);
  const rest = images.filter((u) => u !== url && !ownDevicePhoto.test(u));
  return rest.length >= MAX_IMAGES ? null : [url, ...rest];
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((u, i) => u === b[i]);

export async function applyImageToDeviceProducts(deviceId: number, url: string): Promise<ApplyResult> {
  const db = await createClient();
  const { data, error } = await db
    .from("products")
    .select("id, images, source, locked_fields, updated_at, variant:device_variants!inner(device_id)")
    .eq("variant.device_id", deviceId);
  const rows = z.array(productRow).safeParse(data);
  if (error || !rows.success) {
    logger.error("Loading the device's shop products failed", error ?? rows.error, { deviceId });
    return { updated: 0, skippedFull: 0, failed: 1 };
  }

  const result: ApplyResult = { updated: 0, skippedFull: 0, failed: 0 };
  for (const product of rows.data) {
    const images = withDeviceImage(product.images, url, deviceId);
    if (images === null) {
      result.skippedFull += 1;
      continue;
    }
    if (sameList(images, product.images)) continue;
    // A feed import must not put the supplier's photos back over this one
    const lockedFields = product.source === "feed" && !product.locked_fields.includes("images") ? [...product.locked_fields, "images"] : product.locked_fields;
    // Only if nobody saved the product since it was read, so a staff edit is never overwritten
    const { data: changed, error: updateError } = await db
      .from("products")
      .update({ images, locked_fields: lockedFields })
      .eq("id", product.id)
      .eq("updated_at", product.updated_at)
      .select("id");
    if (updateError || !Array.isArray(changed) || changed.length === 0) {
      if (updateError) logger.error("Applying the device photo to a product failed", updateError, { deviceId, productId: product.id });
      result.failed += 1;
      continue;
    }
    result.updated += 1;
  }
  return result;
}

/** True when a shop product still shows this photo. Errs on "in use" so a shared photo is never deleted by mistake. */
export async function isImageUsedByProducts(url: string): Promise<boolean> {
  const db = await createClient();
  const { count, error } = await db.from("products").select("id", { count: "exact", head: true }).contains("images", [url]);
  if (error) {
    logger.error("Checking product use of an image failed", error);
    return true;
  }
  return (count ?? 0) > 0;
}
