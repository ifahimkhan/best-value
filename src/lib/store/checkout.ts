import { z } from "zod";
import { formatInr } from "@/lib/brand";
import { addressShape, optionalText, toAddress, toFieldErrors, type Address, type FieldErrors } from "@/lib/validation/form";
import type { Cart } from "./cart";
import { orderTotals, toPaise, toRupees, type OrderTotals } from "./gst";

// Prices the cart from fresh product rows and turns a checkout into order
// + item rows. Prices always come from the database, never the client.

export const SHIPPING_FEE_PAISE = 0; // free delivery

export interface PricedProduct {
  id: string;
  sku: string;
  title: string;
  slug: string;
  price: number; // GST-inclusive rupees
  gstRate: number;
  hsnCode: string | null;
  stock: number;
  image: string | null;
}

export type LineProblem = "unavailable" | "out_of_stock" | "low_stock";

export interface PricedLine {
  productId: string;
  qty: number;
  product: PricedProduct | null;
  lineTotalPaise: number;
  problem: LineProblem | null;
}

export interface PricedCart {
  lines: PricedLine[];
  totals: OrderTotals;
  canCheckout: boolean;
}

function lineProblem(product: PricedProduct | null, qty: number): LineProblem | null {
  if (!product) return "unavailable";
  if (product.stock <= 0) return "out_of_stock";
  if (qty > product.stock) return "low_stock";
  return null;
}

export function priceCart(cart: Cart, products: readonly PricedProduct[]): PricedCart {
  const lines = cart.map((line) => {
    const product = products.find((p) => p.id === line.productId) ?? null;
    const problem = lineProblem(product, line.qty);
    return {
      productId: line.productId,
      qty: line.qty,
      product,
      lineTotalPaise: product ? toPaise(product.price) * line.qty : 0,
      problem,
    };
  });
  const totals = orderTotals(
    // Only lines that can actually be bought count towards the total
    lines.flatMap((l) =>
      l.product && l.problem === null
        ? [{ unitPricePaise: toPaise(l.product.price), gstRate: l.product.gstRate, qty: l.qty }]
        : [],
    ),
  );
  return { lines, totals, canCheckout: lines.length > 0 && lines.every((l) => l.problem === null) };
}

const checkoutSchema = z.object({
  ...addressShape,
  gstin: optionalText(15).transform((v, ctx) => {
    if (!v) return null;
    const upper = v.toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(upper)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 15-character GSTIN, or leave it empty" });
    }
    return upper;
  }),
  // The total (paise) the customer reviewed; rejected if it changed
  expectedTotal: z.coerce.number().int().nonnegative(),
});

export interface CheckoutInput {
  address: Address;
  gstin: string | null;
  expectedTotalPaise: number;
}

export type CheckoutParseResult = { success: true; data: CheckoutInput } | { success: false; fieldErrors: FieldErrors };

export function parseCheckoutForm(input: Record<string, unknown>): CheckoutParseResult {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  return {
    success: true,
    data: { address: toAddress(parsed.data), gstin: parsed.data.gstin, expectedTotalPaise: parsed.data.expectedTotal },
  };
}

export interface StoreOrderRow {
  user_id: string;
  subtotal: number;
  gst_amount: number;
  shipping_fee: number;
  total: number;
  shipping_address: Address;
  buyer_gstin: string | null;
}

export interface StoreOrderItemRow {
  product_id: string;
  sku: string;
  title: string;
  hsn_code: string | null;
  gst_rate: number;
  unit_price: number;
  qty: number;
}

export type BuildStoreOrderResult =
  | { ok: true; order: StoreOrderRow; items: StoreOrderItemRow[]; totalPaise: number }
  | { ok: false; error: string };

interface BuildStoreOrderInput {
  userId: string;
  cart: Cart;
  products: readonly PricedProduct[];
  checkout: CheckoutInput;
}

export function buildStoreOrder({ userId, cart, products, checkout }: BuildStoreOrderInput): BuildStoreOrderResult {
  if (cart.length === 0) return { ok: false, error: "Your cart is empty." };
  const priced = priceCart(cart, products);
  if (!priced.canCheckout) {
    return { ok: false, error: "Some items in your cart are no longer available. Please review your cart." };
  }

  const totalPaise = priced.totals.total + SHIPPING_FEE_PAISE;
  if (totalPaise !== checkout.expectedTotalPaise) {
    return {
      ok: false,
      error: `Your order total has changed to ${formatInr(toRupees(totalPaise))}. Please review your cart before paying.`,
    };
  }

  const items = priced.lines.flatMap((l) =>
    l.product
      ? [
          {
            product_id: l.product.id,
            sku: l.product.sku,
            title: l.product.title,
            hsn_code: l.product.hsnCode,
            gst_rate: l.product.gstRate,
            unit_price: l.product.price,
            qty: l.qty,
          },
        ]
      : [],
  );

  return {
    ok: true,
    order: {
      user_id: userId,
      subtotal: toRupees(priced.totals.taxable),
      gst_amount: toRupees(priced.totals.tax),
      shipping_fee: toRupees(SHIPPING_FEE_PAISE),
      total: toRupees(totalPaise),
      shipping_address: checkout.address,
      buyer_gstin: checkout.gstin,
    },
    items,
    totalPaise,
  };
}

