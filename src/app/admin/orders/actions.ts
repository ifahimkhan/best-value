"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { orderNoFrom, STALE_MESSAGE, type AdminActionState } from "@/lib/admin/action-state";
import { getStoreOrder, updateStoreOrder } from "@/lib/admin/store-orders";
import { dbErrorMessage, parseStoreTransition } from "@/lib/admin/transitions";
import { logger } from "@/lib/logger";
import { toPaise } from "@/lib/store/gst";
import { razorpayConfig } from "@/lib/store/payments";
import { PRODUCTS_TAG } from "@/lib/store/queries";
import { refundRazorpayPayment } from "@/lib/store/razorpay";

// Every action re-checks staff access: the admin layout gate does not run for server actions.

async function loadOrder(form: FormData) {
  const orderNo = orderNoFrom(form);
  return orderNo ? getStoreOrder(orderNo) : null;
}

export async function transitionStoreOrderAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  await requireStaff();
  const order = await loadOrder(form);
  if (!order) return { error: "Unknown order." };
  const parsed = parseStoreTransition(form, order.status);
  if (!parsed.ok) return { error: parsed.error };
  const result = await updateStoreOrder(order.id, order.status, parsed.update);
  if (!result.ok) return { error: result.message === "stale" ? STALE_MESSAGE : dbErrorMessage(result.message) };
  // Cancelling puts items back into stock, which the shop pages cache
  if (parsed.update.status === "cancelled") updateTag(PRODUCTS_TAG);
  revalidatePath(`/admin/orders/${order.orderNo}`);
  return { done: "Order updated." };
}

/** Refunds the full amount through Razorpay, then records the refund on the order. Admins only: it moves money. */
export async function refundStoreOrderAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const user = await requireStaff();
  if (user.role !== "admin") return { error: "Only an admin can send refunds through Razorpay." };
  const order = await loadOrder(form);
  if (!order) return { error: "Unknown order." };
  if (order.paymentStatus !== "captured" || !["cancelled", "delivered"].includes(order.status)) {
    return { error: "Only cancelled or delivered orders with a captured payment can be refunded." };
  }
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm the refund." };
  const config = razorpayConfig();
  if (!config || !order.paymentRef) return { error: "Online refunds are not available. Refund in the Razorpay dashboard and record it below." };

  const refund = await refundRazorpayPayment({ paymentId: order.paymentRef, amountPaise: toPaise(order.total), receipt: order.orderNo }, config);
  if (!refund.ok) {
    logger.warn("razorpay refund failed", { orderNo: order.orderNo, status: refund.status });
    return { error: "Razorpay did not accept the refund. Check the payment in the Razorpay dashboard." };
  }
  const result = await updateStoreOrder(order.id, order.status, { status: "refunded", refund_ref: refund.refundId });
  revalidatePath(`/admin/orders/${order.orderNo}`);
  if (!result.ok) {
    logger.error("refund recorded at gateway but not on order", result.message, { orderNo: order.orderNo, refundId: refund.refundId });
    return { error: `Refund ${refund.refundId} was sent, but the order could not be updated. Record it below with that reference.` };
  }
  return { done: `Refund ${refund.refundId} sent.` };
}
