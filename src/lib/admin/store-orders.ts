import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { parseStoreOrderRow, parseStoreOrderRows, STORE_ORDER_NO_PATTERN, type OrderStatus, type StoreOrderDetail, type StoreOrderSummary } from "@/lib/store/schemas";
import { createClient } from "@/lib/supabase/server";
import { loadEvents, type OrderEvent } from "./events";
import type { UpdateResult } from "./sell-orders";
import type { StoreUpdate } from "./transitions";

// Staff views of store orders. Callers must run requireStaff().

export const STORE_FILTERS = ["to_ship", "needs_refund", "pending_payment", "shipped", "delivered", "cancelled", "refunded", "all"] as const;
export type StoreFilter = (typeof STORE_FILTERS)[number];
const LIST_LIMIT = 100;

const ITEMS_SELECT = "items:order_items(sku, title, hsn_code, gst_rate, unit_price, qty)";
const SUMMARY_SELECT = `order_no, status, payment_status, subtotal, gst_amount, shipping_fee, total, created_at, ${ITEMS_SELECT}`;
const DETAIL_SELECT = `id, ${SUMMARY_SELECT}, buyer_gstin, payment_ref, shipping_address, tracking_carrier, tracking_number, shipped_at, delivered_at, refund_ref, refunded_at`;

export async function listStoreOrders(filter: StoreFilter): Promise<StoreOrderSummary[]> {
  const db = await createClient();
  let query = db.from("orders").select(SUMMARY_SELECT);
  if (filter === "to_ship") query = query.in("status", ["paid", "packed"]);
  else if (filter === "needs_refund") query = query.eq("status", "cancelled").eq("payment_status", "captured");
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query.order("created_at", { ascending: filter === "to_ship" }).limit(LIST_LIMIT);
  if (error) {
    logger.error("listStoreOrders failed", error);
    return [];
  }
  return parseStoreOrderRows(data);
}

const extraSchema = z.object({
  id: z.string(),
  tracking_carrier: z.string().nullable(),
  tracking_number: z.string().nullable(),
  shipped_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  refund_ref: z.string().nullable(),
  refunded_at: z.string().nullable(),
});

export interface AdminStoreOrder extends StoreOrderDetail {
  id: string;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  refundRef: string | null;
  refundedAt: string | null;
  events: OrderEvent[];
}

export async function getStoreOrder(orderNo: string): Promise<AdminStoreOrder | null> {
  if (!STORE_ORDER_NO_PATTERN.test(orderNo)) return null;
  const db = await createClient();
  const { data, error } = await db.from("orders").select(DETAIL_SELECT).eq("order_no", orderNo).maybeSingle();
  if (error) {
    logger.error("getStoreOrder failed", error, { orderNo });
    return null;
  }
  const base = parseStoreOrderRow(data);
  const extra = extraSchema.safeParse(data);
  if (!base || !extra.success) return null;
  const e = extra.data;
  return {
    ...base,
    id: e.id,
    trackingCarrier: e.tracking_carrier,
    trackingNumber: e.tracking_number,
    shippedAt: e.shipped_at,
    deliveredAt: e.delivered_at,
    refundRef: e.refund_ref,
    refundedAt: e.refunded_at,
    events: await loadEvents("order_id", e.id),
  };
}

export async function updateStoreOrder(id: string, expected: OrderStatus, update: StoreUpdate): Promise<UpdateResult> {
  const db = await createClient();
  const { data, error } = await db.from("orders").update(update).eq("id", id).eq("status", expected).select("id").maybeSingle();
  if (error) {
    logger.error("updateStoreOrder failed", error, { id });
    return { ok: false, message: error.message };
  }
  return data ? { ok: true } : { ok: false, message: "stale" };
}
