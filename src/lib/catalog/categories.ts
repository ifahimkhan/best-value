import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/logger";

export interface Category {
  id: number;
  name: string;
  slug: string;
  iconUrl: string | null;
  canSell: boolean;
  canBuy: boolean;
  comingSoon: boolean;
}

export const CATEGORIES_TAG = "categories";

/** Active categories, cached for an hour. Admin edits call revalidateTag(CATEGORIES_TAG). */
export async function listCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATEGORIES_TAG);

  const { data, error } = await createPublicClient()
    .from("categories")
    .select("id, name, slug, icon_url, can_sell, can_buy, coming_soon")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    logger.error("Failed to load categories", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconUrl: row.icon_url,
    canSell: row.can_sell,
    canBuy: row.can_buy,
    comingSoon: row.coming_soon,
  }));
}
