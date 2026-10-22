import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { getBrand, getCategory } from "@/lib/catalog/queries";
import { isValidSlug } from "@/lib/catalog/slug";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { PricedProduct, StoreOrderItemRow, StoreOrderRow } from "./checkout";
import { PAGE_SIZE, type ListingParams } from "./listing";
import {
  parsePricedProducts,
  parseProductDetail,
  parseProductSummaries,
  parseStoreOrderRow,
  parseStoreOrderRows,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  STORE_ORDER_NO_PATTERN,
  type OrderStatus,
  type PaymentStatus,
  type ProductDetail,
  type ProductSummary,
  type StoreOrderDetail,
  type StoreOrderSummary,
} from "./schemas";

// Store data access. Public reads go through the anon client (RLS hides
// inactive products); order writes go through service-role database
// functions; customer order reads use the signed-in client (RLS: own rows).
// Admin product edits and feed imports must call revalidateTag(PRODUCTS_TAG).

export const PRODUCTS_TAG = "products";

const SUMMARY_SELECT = "id, title, slug, condition, mrp, price, stock, images, brand:brands(name, slug)";
const DETAIL_SELECT = `${SUMMARY_SELECT}, sku, description, gst_rate, hsn_code, category:categories(name, slug)`;
const PRICED_SELECT = "id, sku, title, slug, price, gst_rate, hsn_code, stock, images";
const ITEMS_SELECT = "items:order_items(sku, title, hsn_code, gst_rate, unit_price, qty)";
const ORDER_SUMMARY_SELECT = `order_no, status, payment_status, subtotal, gst_amount, shipping_fee, total, created_at, ${ITEMS_SELECT}`;
const ORDER_DETAIL_SELECT = `${ORDER_SUMMARY_SELECT}, buyer_gstin, payment_ref, shipping_address`;

export interface ProductPage {
  items: ProductSummary[];
  total: number;
}

/** Resolves slug filters to ids, then reads through the cache. */
export async function listProducts(params: ListingParams): Promise<ProductPage> {
  const [category, brand] = await Promise.all([
    params.category ? getCategory(params.category) : null,
    params.brand ? getBrand(params.brand) : null,
  ]);
  // A filter that names an unknown category/brand matches nothing
  if ((params.category && !category) || (params.brand && !brand)) return { items: [], total: 0 };
  return listProductsCached(category?.id ?? null, brand?.id ?? null, params.condition, params.sort, params.page);
}

async function listProductsCached(
  categoryId: number | null,
  brandId: number | null,
  condition: ListingParams["condition"],
  sort: ListingParams["sort"],
  page: number,
): Promise<ProductPage> {
  "use cache";
  cacheTag(PRODUCTS_TAG);

  let query = createPublicClient().from("products").select(SUMMARY_SELECT, { count: "exact" });
  if (categoryId) query = query.eq("category_id", categoryId);
  if (brandId) query = query.eq("brand_id", brandId);
  if (condition) query = query.eq("condition", condition);

  const ordered =
    sort === "price_asc"
      ? query.order("price", { ascending: true })
      : sort === "price_desc"
        ? query.order("price", { ascending: false })
        : sort === "newest"
          ? query.order("created_at", { ascending: false })
          : query.order("stock", { ascending: false }).order("created_at", { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await ordered.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to list products", error, { categoryId, brandId, page });
    return { items: [], total: 0 };
  }
  cacheLife("minutes");
  return { items: parseProductSummaries(data), total: count ?? 0 };
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  if (!isValidSlug(slug)) return null;
  return getProductCached(slug);
}

async function getProductCached(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheTag(PRODUCTS_TAG);

  const { data, error } = await createPublicClient().from("products").select(DETAIL_SELECT).eq("slug", slug).maybeSingle();
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load product", error, { slug });
    return null;
  }
  cacheLife("minutes");
  return data ? parseProductDetail(data) : null;
}

/** Fresh (uncached) prices and stock for the cart and checkout. */
export async function getPricedProducts(ids: readonly string[]): Promise<PricedProduct[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createPublicClient().from("products").select(PRICED_SELECT).in("id", [...ids]);
  if (error) {
    logger.error("Failed to price cart", error, { count: ids.length });
    return [];
  }
  return parsePricedProducts(data);
}

export type CreateStoreOrderResult =
  | { ok: true; orderNo: string }
  | { ok: false; reason: "rate_limited" | "too_many_pending" | "stock_or_price_changed" | "error" };

const KNOWN_ORDER_ERRORS = ["rate_limited", "too_many_pending", "stock_or_price_changed"] as const;

/** Reserves stock and creates the order in one transaction (service role only). */
export async function createStoreOrder(
  order: StoreOrderRow,
  items: readonly StoreOrderItemRow[],
  limits: { maxPending: number; maxPerHour: number; expiryMinutes: number },
): Promise<CreateStoreOrderResult> {
  const { data, error } = await createAdminClient().rpc("create_store_order", {
    p_order: order,
    p_items: items,
    p_max_pending: limits.maxPending,
    p_max_per_hour: limits.maxPerHour,
    p_expiry_minutes: limits.expiryMinutes,
  });
  if (error) {
    const known = KNOWN_ORDER_ERRORS.find((code) => error.code === "P0001" && error.message === code);
    if (known) return { ok: false, reason: known };
    logger.error("Failed to create store order", error, { userId: order.user_id });
    return { ok: false, reason: "error" };
  }
  return typeof data === "string" ? { ok: true, orderNo: data } : { ok: false, reason: "error" };
}

/** Links the Razorpay order to ours. Only fills an empty slot, never overwrites. */
export async function attachGatewayOrder(orderNo: string, gatewayOrderId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .update({ gateway_order_id: gatewayOrderId })
    .eq("order_no", orderNo)
    .is("gateway_order_id", null)
    .select("order_no");
  if (error || !data || data.length !== 1) {
    logger.error("Failed to attach gateway order", error, { orderNo });
    return false;
  }
  return true;
}

/** Releases an unpaid order and its stock straight away. */
export async function cancelStoreOrder(orderNo: string): Promise<void> {
  const { error } = await createAdminClient().rpc("cancel_store_order", { p_order_no: orderNo });
  if (error) logger.error("Failed to cancel store order", error, { orderNo });
}

const markPaidSchema = z.enum(["paid", "already_paid", "needs_refund", "amount_mismatch", "not_found"]);
export type MarkPaidResult = z.infer<typeof markPaidSchema> | "error";

export async function markStoreOrderPaid(gatewayOrderId: string, paymentId: string, amountPaise: number): Promise<MarkPaidResult> {
  const { data, error } = await createAdminClient().rpc("mark_store_order_paid", {
    p_gateway_order_id: gatewayOrderId,
    p_payment_id: paymentId,
    p_amount_paise: amountPaise,
  });
  if (error) {
    logger.error("Failed to mark store order paid", error, { gatewayOrderId });
    return "error";
  }
  const parsed = markPaidSchema.safeParse(data);
  if (!parsed.success) {
    logger.error("Unexpected mark-paid result", null, { gatewayOrderId });
    return "error";
  }
  const result = parsed.data;
  if (result === "needs_refund" || result === "amount_mismatch") {
    logger.warn("Store payment needs staff attention", { gatewayOrderId, result });
  }
  return result;
}

const payableRowSchema = z.object({
  order_no: z.string(),
  total: z.coerce.number(),
  status: z.enum(ORDER_STATUSES),
  payment_status: z.enum(PAYMENT_STATUSES),
  gateway_order_id: z.string().nullable(),
});

export interface PayableOrder {
  orderNo: string;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  gatewayOrderId: string | null;
}

/** The signed-in customer's order as needed by the payment page (RLS: own rows). */
export async function getMyPayableOrder(orderNo: string): Promise<PayableOrder | null> {
  if (!STORE_ORDER_NO_PATTERN.test(orderNo)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("order_no, total, status, payment_status, gateway_order_id")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) logger.error("Failed to load order for payment", error, { orderNo });
  const parsed = payableRowSchema.safeParse(data);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    orderNo: r.order_no,
    total: r.total,
    status: r.status,
    paymentStatus: r.payment_status,
    gatewayOrderId: r.gateway_order_id,
  };
}

export async function listMyStoreOrders(): Promise<StoreOrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SUMMARY_SELECT)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    logger.error("Failed to list store orders", error);
    return [];
  }
  return parseStoreOrderRows(data);
}

export async function getMyStoreOrder(orderNo: string): Promise<StoreOrderDetail | null> {
  if (!STORE_ORDER_NO_PATTERN.test(orderNo)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_DETAIL_SELECT).eq("order_no", orderNo).maybeSingle();
  if (error) {
    logger.error("Failed to load store order", error, { orderNo });
    return null;
  }
  return data ? parseStoreOrderRow(data) : null;
}
