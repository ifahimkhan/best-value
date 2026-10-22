import { z } from "zod";
import type { Address } from "@/lib/validation/form";
import type { PricedProduct } from "./checkout";
import { PRODUCT_CONDITIONS, type ProductCondition } from "./listing";

// Supabase rows are external data (and products may come from supplier
// feeds), so validate before rendering. numeric columns can be strings.

const amount = z.coerce.number().nonnegative();

/** Only https image URLs are rendered; anything else from a feed is dropped. */
function safeImages(images: readonly string[]): string[] {
  return images.filter((url) => {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function parseEach<T, R>(rows: unknown, schema: z.ZodType<T>, map: (row: T) => R): R[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [map(parsed.data)] : [];
  });
}

const namedRef = z.object({ name: z.string(), slug: z.string() }).nullable();

const summaryRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  condition: z.enum(PRODUCT_CONDITIONS),
  mrp: amount.nullable(),
  price: amount,
  stock: z.number().int(),
  images: z.array(z.string()),
  brand: namedRef.optional(),
});

const detailRowSchema = summaryRowSchema.extend({
  sku: z.string(),
  description: z.string().nullable(),
  gst_rate: amount,
  hsn_code: z.string().nullable(),
  category: namedRef.optional(),
});

const pricedRowSchema = z.object({
  id: z.string(),
  sku: z.string(),
  title: z.string(),
  slug: z.string(),
  price: amount,
  gst_rate: amount,
  hsn_code: z.string().nullable(),
  stock: z.number().int(),
  images: z.array(z.string()),
});

export interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  condition: ProductCondition;
  mrp: number | null; // only when above price, for the strike-through
  price: number;
  inStock: boolean;
  image: string | null;
  brandName: string | null;
}

export interface ProductDetail extends ProductSummary {
  sku: string;
  description: string | null;
  gstRate: number;
  hsnCode: string | null;
  stock: number;
  images: string[];
  categoryName: string | null;
  categorySlug: string | null;
  brandSlug: string | null;
}

function toSummary(r: z.infer<typeof summaryRowSchema>): ProductSummary {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    condition: r.condition,
    mrp: r.mrp !== null && r.mrp > r.price ? r.mrp : null,
    price: r.price,
    inStock: r.stock > 0,
    image: safeImages(r.images)[0] ?? null,
    brandName: r.brand?.name ?? null,
  };
}

export function parseProductSummaries(rows: unknown): ProductSummary[] {
  return parseEach(rows, summaryRowSchema, toSummary);
}

export function parseProductDetail(row: unknown): ProductDetail | null {
  const parsed = detailRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    ...toSummary(r),
    sku: r.sku,
    description: r.description,
    gstRate: r.gst_rate,
    hsnCode: r.hsn_code,
    stock: r.stock,
    images: safeImages(r.images),
    categoryName: r.category?.name ?? null,
    categorySlug: r.category?.slug ?? null,
    brandSlug: r.brand?.slug ?? null,
  };
}

export function parsePricedProducts(rows: unknown): PricedProduct[] {
  return parseEach(rows, pricedRowSchema, (r) => ({
    id: r.id,
    sku: r.sku,
    title: r.title,
    slug: r.slug,
    price: r.price,
    gstRate: r.gst_rate,
    hsnCode: r.hsn_code,
    stock: r.stock,
    image: safeImages(r.images)[0] ?? null,
  }));
}

export const STORE_ORDER_NO_PATTERN = /^BV-O-\d{6,}$/;

export const ORDER_STATUSES = ["pending_payment", "paid", "packed", "shipped", "delivered", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_STATUSES = ["pending", "captured", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const itemRowSchema = z.object({
  sku: z.string(),
  title: z.string(),
  hsn_code: z.string().nullable(),
  gst_rate: amount,
  unit_price: amount,
  qty: z.number().int().positive(),
});

const orderRowSchema = z.object({
  order_no: z.string(),
  status: z.enum(ORDER_STATUSES),
  payment_status: z.enum(PAYMENT_STATUSES),
  subtotal: amount,
  gst_amount: amount,
  shipping_fee: amount,
  total: amount,
  created_at: z.string(),
  items: z.array(itemRowSchema),
});

const orderDetailRowSchema = orderRowSchema.extend({
  buyer_gstin: z.string().nullable(),
  payment_ref: z.string().nullable(),
  tracking_carrier: z.string().nullable(),
  tracking_number: z.string().nullable(),
  shipping_address: z.object({
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
  }),
});

export interface StoreOrderItem {
  sku: string;
  title: string;
  hsnCode: string | null;
  gstRate: number;
  unitPrice: number;
  qty: number;
}

export interface StoreOrderSummary {
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  gstAmount: number;
  shippingFee: number;
  total: number;
  createdAt: string;
  itemCount: number;
  items: StoreOrderItem[];
}

export interface StoreOrderDetail extends StoreOrderSummary {
  buyerGstin: string | null;
  paymentRef: string | null;
  address: Address;
  /** Set once the order ships. */
  tracking: { carrier: string | null; number: string } | null;
}

function toOrderSummary(r: z.infer<typeof orderRowSchema>): StoreOrderSummary {
  const items = r.items.map((i) => ({
    sku: i.sku,
    title: i.title,
    hsnCode: i.hsn_code,
    gstRate: i.gst_rate,
    unitPrice: i.unit_price,
    qty: i.qty,
  }));
  return {
    orderNo: r.order_no,
    status: r.status,
    paymentStatus: r.payment_status,
    subtotal: r.subtotal,
    gstAmount: r.gst_amount,
    shippingFee: r.shipping_fee,
    total: r.total,
    createdAt: r.created_at,
    itemCount: items.reduce((sum, i) => sum + i.qty, 0),
    items,
  };
}

export function parseStoreOrderRows(rows: unknown): StoreOrderSummary[] {
  return parseEach(rows, orderRowSchema, toOrderSummary);
}

export function parseStoreOrderRow(row: unknown): StoreOrderDetail | null {
  const parsed = orderDetailRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  const tracking = r.tracking_number ? { carrier: r.tracking_carrier ?? null, number: r.tracking_number } : null;
  return { ...toOrderSummary(r), buyerGstin: r.buyer_gstin, paymentRef: r.payment_ref, address: r.shipping_address, tracking };
}
