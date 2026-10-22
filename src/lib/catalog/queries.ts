import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/logger";
import { listCategories, type Category } from "./categories";
import {
  parseBrandRows,
  parseDeviceDetail,
  parseDeviceRows,
  type Brand,
  type DeviceDetail,
  type DeviceSummary,
} from "./schemas";
import { escapeLike, normalizeQuery, splitBrandFromQuery } from "./search";
import { isValidSlug } from "./slug";

// Public catalog reads. RLS already hides inactive rows from the anon client.
// Admin edits must call revalidateTag(CATALOG_TAG) so cached pages refresh.
//
// Caching rules:
//  * Success is cached for hours; a failed read calls cacheLife("seconds") so
//    a database blip is not served as an empty catalog for an hour.
//  * User input is validated in a plain wrapper BEFORE reaching a cached
//    function, so junk URLs never create cache entries or DB queries.
export const CATALOG_TAG = "catalog";

const DEVICE_SUMMARY_SELECT =
  "id, name, slug, image_url, brand:brands!inner(name, slug), category:categories!inner(slug), variants:device_variants(base_buy_price)";
const DEVICE_DETAIL_SELECT =
  "id, name, slug, image_url, brand:brands!inner(name, slug), category:categories!inner(name, slug), variants:device_variants(id, label, slug, base_buy_price)";
const TOP_SELLING_LIMIT = 12;
const SEARCH_LIMIT = 24;

export async function getCategory(slug: string): Promise<Category | null> {
  if (!isValidSlug(slug)) return null;
  const categories = await listCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function listAllBrands(): Promise<Brand[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data, error } = await createPublicClient()
    .from("brands")
    .select("id, name, slug, logo_url")
    .order("sort_order");
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load brands", error);
    return [];
  }
  cacheLife("hours");
  return parseBrandRows(data);
}

export async function getBrand(slug: string): Promise<Brand | null> {
  if (!isValidSlug(slug)) return null;
  const brands = await listAllBrands();
  return brands.find((b) => b.slug === slug) ?? null;
}

/** Brands that have at least one active device in the category. */
export async function listBrandsForCategory(categoryId: number): Promise<Brand[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data, error } = await createPublicClient()
    .from("brands")
    .select("id, name, slug, logo_url, devices!inner(id)")
    .eq("devices.category_id", categoryId)
    .order("sort_order");
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load brands for category", error, { categoryId });
    return [];
  }
  cacheLife("hours");
  return parseBrandRows(data);
}

export async function listDevices(categoryId: number, brandId: number): Promise<DeviceSummary[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data, error } = await createPublicClient()
    .from("devices")
    .select(DEVICE_SUMMARY_SELECT)
    .eq("category_id", categoryId)
    .eq("brand_id", brandId)
    .order("release_year", { ascending: false, nullsFirst: false })
    .order("name");
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load devices", error, { categoryId, brandId });
    return [];
  }
  cacheLife("hours");
  return parseDeviceRows(data);
}

export async function listTopSelling(categoryId: number): Promise<DeviceSummary[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data, error } = await createPublicClient()
    .from("devices")
    .select(DEVICE_SUMMARY_SELECT)
    .eq("category_id", categoryId)
    .eq("is_top_selling", true)
    .limit(TOP_SELLING_LIMIT);
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load top selling devices", error, { categoryId });
    return [];
  }
  cacheLife("hours");
  return parseDeviceRows(data);
}

/** Validates the slug from the URL, then reads through the cache. */
export async function getDeviceDetail(
  categoryId: number,
  brandId: number,
  deviceSlug: string,
): Promise<DeviceDetail | null> {
  if (!isValidSlug(deviceSlug)) return null;
  return getDeviceDetailCached(categoryId, brandId, deviceSlug);
}

async function getDeviceDetailCached(
  categoryId: number,
  brandId: number,
  deviceSlug: string,
): Promise<DeviceDetail | null> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const { data, error } = await createPublicClient()
    .from("devices")
    .select(DEVICE_DETAIL_SELECT)
    .eq("category_id", categoryId)
    .eq("brand_id", brandId)
    .eq("slug", deviceSlug)
    .maybeSingle();
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load device", error, { categoryId, brandId, deviceSlug });
    return null;
  }
  cacheLife("hours");
  return data ? parseDeviceDetail(data) : null;
}

/** Device search for the header box. Accepts raw user input. */
export async function searchDevices(rawQuery: string | null | undefined): Promise<DeviceSummary[]> {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  return searchDevicesCached(query);
}

async function searchDevicesCached(query: string): Promise<DeviceSummary[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const brands = await listAllBrands();
  const { brandSlug, text } = splitBrandFromQuery(query, brands);
  const brandId = brands.find((b) => b.slug === brandSlug)?.id;

  // Only devices whose /sell page actually exists (sellable, not "coming soon")
  let request = createPublicClient()
    .from("devices")
    .select(DEVICE_SUMMARY_SELECT)
    .eq("category.can_sell", true)
    .eq("category.coming_soon", false)
    .limit(SEARCH_LIMIT);
  if (brandId) request = request.eq("brand_id", brandId);
  if (text) request = request.ilike("name", `%${escapeLike(text)}%`);

  const { data, error } = await request.order("is_top_selling", { ascending: false }).order("name");
  if (error) {
    cacheLife("seconds");
    logger.error("Device search failed", error, { query });
    return [];
  }
  cacheLife("minutes");
  return parseDeviceRows(data);
}
