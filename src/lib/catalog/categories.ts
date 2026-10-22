import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
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

const categoryRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    icon_url: z.string().nullable(),
    can_sell: z.boolean(),
    can_buy: z.boolean(),
    coming_soon: z.boolean(),
  })
  .transform((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconUrl: row.icon_url,
    canSell: row.can_sell,
    canBuy: row.can_buy,
    comingSoon: row.coming_soon,
  }));

/** Rows are external data: malformed ones are dropped and logged. */
export function parseCategoryRows(rows: unknown): Category[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = categoryRowSchema.safeParse(row);
    if (parsed.success) return [parsed.data];
    const id = typeof row === "object" && row !== null && "id" in row ? row.id : null;
    logger.warn("Dropped malformed category row", { id, issues: parsed.error.issues.length });
    return [];
  });
}

/** Active categories, cached for an hour. Admin edits call revalidateTag(CATEGORIES_TAG). */
export async function listCategories(): Promise<Category[]> {
  "use cache";
  cacheTag(CATEGORIES_TAG);

  const { data, error } = await createPublicClient()
    .from("categories")
    .select("id, name, slug, icon_url, can_sell, can_buy, coming_soon")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    // Cache the failure only briefly so a DB blip doesn't 404 the catalog for an hour
    cacheLife("seconds");
    logger.error("Failed to load categories", error);
    return [];
  }
  const categories = parseCategoryRows(data);
  // A partial list (bad rows dropped) is only cached briefly, like an error
  const complete = Array.isArray(data) && categories.length === data.length;
  if (complete) cacheLife("hours");
  else cacheLife("seconds");
  return categories;
}
