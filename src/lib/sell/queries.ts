import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { QuoteVariant, SellOrderRow } from "./order";
import type { EvalQuestion } from "./pricing";
import {
  parseEvaluationRows,
  parseQuoteVariant,
  parseSellOrderRow,
  parseSellOrderRows,
  type SellOrderDetail,
  type SellOrderSummary,
} from "./schemas";

const ORDER_SUMMARY_SELECT =
  "order_no, status, quoted_price, final_price, pickup_date, pickup_slot, created_at, variant:device_variants(label, device:devices(name, brand:brands(name)))";
const ORDER_DETAIL_SELECT = `${ORDER_SUMMARY_SELECT}, pickup_address, payout_method, payout_details`;
export const ORDER_NO_PATTERN = /^BV-S-\d{6,}$/;

const EVALUATION_SELECT =
  "id, section, input_type, title, help_text, options:evaluation_options(id, label, deduction_type, deduction_value, sort_order)";

async function fetchEvaluation(categoryId: number): Promise<EvalQuestion[] | null> {
  const { data, error } = await createPublicClient()
    .from("evaluation_questions")
    .select(EVALUATION_SELECT)
    .eq("category_id", categoryId)
    .order("sort_order");
  if (error) {
    logger.error("Failed to load evaluation questions", error, { categoryId });
    return null;
  }
  return parseEvaluationRows(data);
}

/** Evaluation questions for the calculator page. Cached with the catalog; admins revalidate CATALOG_TAG. */
export async function getEvaluation(categoryId: number): Promise<EvalQuestion[]> {
  "use cache";
  cacheTag(CATALOG_TAG);

  const questions = await fetchEvaluation(categoryId);
  if (!questions) {
    cacheLife("seconds");
    return [];
  }
  cacheLife("hours");
  return questions;
}

/** Uncached rules for the authoritative quote at booking time. */
export async function getEvaluationFresh(categoryId: number): Promise<EvalQuestion[]> {
  return (await fetchEvaluation(categoryId)) ?? [];
}

/** Fresh (uncached) variant price for the authoritative quote at booking time. */
export async function getQuoteVariant(variantId: number): Promise<QuoteVariant | null> {
  const { data, error } = await createPublicClient()
    .from("device_variants")
    .select("id, base_buy_price, device:devices!inner(category_id, category:categories!inner(can_sell, coming_soon))")
    .eq("id", variantId)
    .maybeSingle();
  if (error) {
    logger.error("Failed to load variant for quote", error, { variantId });
    return null;
  }
  return data ? parseQuoteVariant(data) : null;
}

export type CreateSellOrderResult = { ok: true; orderNo: string } | { ok: false; reason: "rate_limited" | "error" };

/**
 * Books the pickup through the create_sell_order database function, which
 * locks per user, enforces the daily limit and writes the order plus the
 * staff-only bank details in one transaction. Service role only.
 */
export async function createSellOrder(
  row: SellOrderRow,
  bankAccountNumber: string | null,
  maxPerDay: number,
): Promise<CreateSellOrderResult> {
  const { data, error } = await createAdminClient().rpc("create_sell_order", {
    p_order: row,
    p_account_number: bankAccountNumber,
    p_max_per_day: maxPerDay,
  });
  if (error) {
    if (error.code === "P0001" && error.message === "rate_limited") return { ok: false, reason: "rate_limited" };
    logger.error("Failed to create sell order", error, { userId: row.user_id, variantId: row.variant_id });
    return { ok: false, reason: "error" };
  }
  return typeof data === "string" ? { ok: true, orderNo: data } : { ok: false, reason: "error" };
}

/** The signed-in customer's sell orders (RLS limits rows to their own). */
export async function listMySellOrders(): Promise<SellOrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sell_orders")
    .select(ORDER_SUMMARY_SELECT)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    logger.error("Failed to list sell orders", error);
    return [];
  }
  return parseSellOrderRows(data);
}

export async function getMySellOrder(orderNo: string): Promise<SellOrderDetail | null> {
  if (!ORDER_NO_PATTERN.test(orderNo)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sell_orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) {
    logger.error("Failed to load sell order", error, { orderNo });
    return null;
  }
  return data ? parseSellOrderRow(data) : null;
}
