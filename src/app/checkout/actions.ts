"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { readCart, writeCart } from "@/lib/store/cart-cookie";
import { buildStoreOrder, parseCheckoutForm } from "@/lib/store/checkout";
import { toPaise } from "@/lib/store/gst";
import { razorpayConfig } from "@/lib/store/payments";
import {
  attachGatewayOrder,
  cancelStoreOrder,
  createStoreOrder,
  getMyPayableOrder,
  getPricedProducts,
  markStoreOrderPaid,
} from "@/lib/store/queries";
import { STORE_ORDER_NO_PATTERN } from "@/lib/store/schemas";
import { createRazorpayOrder, verifyPaymentSignature } from "@/lib/store/razorpay";
import type { FieldErrors } from "@/lib/validation/form";

export interface CheckoutState {
  error?: string;
  fieldErrors?: FieldErrors;
}

const ORDER_LIMITS = { maxPending: 3, maxPerHour: 10, expiryMinutes: 30 };
const GENERIC_ERROR = "We couldn't start your payment. Please try again in a moment.";

const CREATE_ERRORS = {
  rate_limited: "You've placed many orders in the last hour. Please try again later or contact support.",
  too_many_pending: "You have unpaid orders waiting. Please pay for them or wait 30 minutes before trying again.",
  stock_or_price_changed: "The price or stock of an item changed just now. Please review your cart.",
  error: GENERIC_ERROR,
} as const;

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const config = razorpayConfig();
  if (!config) return { error: "Online payment is not available yet. Please check back soon." };

  const user = await getSessionUser();
  if (!user) return { error: "Please log in to place your order." };

  const parsed = parseCheckoutForm(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };

  const cart = await readCart();
  const products = await getPricedProducts(cart.map((l) => l.productId));
  const built = buildStoreOrder({ userId: user.id, cart, products, checkout: parsed.data });
  if (!built.ok) return { error: built.error };

  const created = await createStoreOrder(built.order, built.items, ORDER_LIMITS);
  if (!created.ok) return { error: CREATE_ERRORS[created.reason] };

  // If payment cannot start, release the reserved stock straight away
  const gateway = await createRazorpayOrder({ amountPaise: built.totalPaise, receipt: created.orderNo }, config);
  if (!gateway.ok || !(await attachGatewayOrder(created.orderNo, gateway.orderId))) {
    await cancelStoreOrder(created.orderNo);
    return { error: GENERIC_ERROR };
  }

  redirect(`/checkout/pay/${created.orderNo}`);
}

const proofSchema = z.object({
  orderNo: z.string().regex(STORE_ORDER_NO_PATTERN),
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(128),
});

export type PaymentProofInput = z.infer<typeof proofSchema>;

const VERIFY_ERROR = "We couldn't confirm your payment. If money was taken, it will be refunded or your order confirmed shortly.";

/** Called by the Razorpay checkout success handler. The webhook confirms independently. */
export async function confirmPayment(input: PaymentProofInput): Promise<CheckoutState> {
  const parsed = proofSchema.safeParse(input);
  const config = razorpayConfig();
  if (!parsed.success || !config) return { error: VERIFY_ERROR };

  const user = await getSessionUser();
  if (!user) return { error: "Please log in again to see your order." };

  const proof = parsed.data;
  // RLS: only finds the order if it belongs to this customer
  const order = await getMyPayableOrder(proof.orderNo);
  if (!order || order.gatewayOrderId !== proof.razorpayOrderId) return { error: VERIFY_ERROR };

  const valid = verifyPaymentSignature(
    { orderId: proof.razorpayOrderId, paymentId: proof.razorpayPaymentId, signature: proof.razorpaySignature },
    config.keySecret,
  );
  if (!valid) return { error: VERIFY_ERROR };

  const result = await markStoreOrderPaid(proof.razorpayOrderId, proof.razorpayPaymentId, toPaise(order.total));
  // Paid but nothing to ship: the order page explains the refund; keep the cart
  if (result === "needs_refund") redirect(`/account/orders/${proof.orderNo}`);
  if (result !== "paid" && result !== "already_paid") return { error: VERIFY_ERROR };

  await writeCart([]);
  redirect(`/account/orders/${proof.orderNo}?new=1`);
}

/** Empties the cart after a payment the webhook confirmed (customer closed the tab). */
export async function clearCartAfterPayment(orderNo: string): Promise<void> {
  if (!STORE_ORDER_NO_PATTERN.test(orderNo)) return;
  const order = await getMyPayableOrder(orderNo);
  if (order?.paymentStatus === "captured" && order.status !== "cancelled") await writeCart([]);
}
