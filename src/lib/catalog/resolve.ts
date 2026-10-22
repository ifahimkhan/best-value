import "server-only";
import type { Category } from "./categories";
import { getBrand, getCategory, getDeviceDetail } from "./queries";
import type { Brand, DeviceDetail } from "./schemas";

export interface ResolvedDevice {
  category: Category;
  brand: Brand;
  device: DeviceDetail;
}

/** Turns /sell/[category]/[brand]/[device] slugs into records, or null if any part is unknown. */
export async function resolveDevice(
  categorySlug: string,
  brandSlug: string,
  deviceSlug: string,
): Promise<ResolvedDevice | null> {
  const [category, brand] = await Promise.all([getCategory(categorySlug), getBrand(brandSlug)]);
  if (!category || !brand || !category.canSell || category.comingSoon) return null;

  const device = await getDeviceDetail(category.id, brand.id, deviceSlug);
  return device ? { category, brand, device } : null;
}
