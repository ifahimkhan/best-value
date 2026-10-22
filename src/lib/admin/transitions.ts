import { z } from "zod";
import { parseAmount } from "@/lib/feeds/mapping";
import type { SellStatus } from "@/lib/sell/schemas";
import type { OrderStatus, PaymentStatus } from "@/lib/store/schemas";

// Mirrors private.guard_sell_order_update / guard_store_order_update. The
// database is the authority; these maps decide which buttons staff see and
// give clear messages before a round trip.

export const SELL_NEXT: Readonly<Record<SellStatus, readonly SellStatus[]>> = {
  quoted: ["pickup_assigned", "cancelled"],
  pickup_assigned: ["quoted", "picked_up", "cancelled"],
  picked_up: ["inspected", "cancelled"],
  inspected: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export const STORE_NEXT: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["cancelled"],
  paid: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

/** Steps worth offering: a refund only makes sense when money was captured. */
export function storeActions(status: OrderStatus, payment: PaymentStatus): OrderStatus[] {
  return STORE_NEXT[status].filter((next) => next !== "refunded" || payment === "captured");
}

export interface SellUpdate {
  status?: SellStatus;
  final_price?: number;
  payout_ref?: string;
  cancel_reason?: string;
}

export interface StoreUpdate {
  status?: OrderStatus;
  tracking_carrier?: string | null;
  tracking_number?: string;
  refund_ref?: string;
}

export type TransitionResult<T> = { ok: true; update: T } | { ok: false; error: string };

const NOT_ALLOWED = "That step is not allowed from the current status.";

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function finalPriceUpdate(form: FormData): TransitionResult<SellUpdate> {
  const price = parseAmount(text(form, "finalPrice"));
  if (price === null || price <= 0) return { ok: false, error: "Enter the final price agreed after inspection." };
  return { ok: true, update: { final_price: price } };
}

export function parseSellTransition(form: FormData, current: SellStatus): TransitionResult<SellUpdate> {
  const to = text(form, "toStatus") as SellStatus;
  // Price correction while the order is still at inspection
  if (to === current && current === "inspected") return finalPriceUpdate(form);
  if (!SELL_NEXT[current]?.includes(to)) return { ok: false, error: NOT_ALLOWED };

  if (to === "inspected") {
    const price = finalPriceUpdate(form);
    return price.ok ? { ok: true, update: { status: to, ...price.update } } : price;
  }
  if (to === "paid") {
    const ref = text(form, "payoutRef");
    if (ref.length < 1 || ref.length > 60) return { ok: false, error: "Enter the payout reference (UTR, UPI ref or cash receipt no.)." };
    return { ok: true, update: { status: to, payout_ref: ref } };
  }
  if (to === "cancelled") {
    const reason = text(form, "cancelReason");
    if (reason.length < 3 || reason.length > 300) return { ok: false, error: "Give a short reason for cancelling (3 to 300 characters)." };
    return { ok: true, update: { status: to, cancel_reason: reason } };
  }
  return { ok: true, update: { status: to } };
}

export function parseStoreTransition(form: FormData, current: OrderStatus): TransitionResult<StoreUpdate> {
  const to = text(form, "toStatus") as OrderStatus;
  if (!STORE_NEXT[current]?.includes(to)) return { ok: false, error: NOT_ALLOWED };
  if (to === "shipped") {
    const number = text(form, "trackingNumber");
    const carrier = text(form, "trackingCarrier").slice(0, 60);
    if (!/^[A-Za-z0-9-]{4,40}$/.test(number)) return { ok: false, error: "Enter the tracking number (4 to 40 letters, digits or dashes)." };
    return { ok: true, update: { status: to, tracking_carrier: carrier === "" ? null : carrier, tracking_number: number } };
  }
  if (to === "refunded") {
    const ref = text(form, "refundRef");
    if (ref.length < 1 || ref.length > 60) return { ok: false, error: "Enter the refund reference." };
    return { ok: true, update: { status: to, refund_ref: ref } };
  }
  return { ok: true, update: { status: to } };
}

const internalSchema = z.object({
  notes: z.string().trim().max(2000, "Notes can be at most 2000 characters"),
  assignedTo: z.union([z.literal(""), z.uuid()]),
});

export type InternalResult = { ok: true; data: { staff_notes: string | null; assigned_to: string | null } } | { ok: false; error: string };

export function parseSellInternalForm(form: FormData): InternalResult {
  const parsed = internalSchema.safeParse({ notes: text(form, "notes"), assignedTo: text(form, "assignedTo") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the notes" };
  return {
    ok: true,
    data: { staff_notes: parsed.data.notes || null, assigned_to: parsed.data.assignedTo || null },
  };
}

const DB_ERRORS: Record<string, string> = {
  invalid_transition: NOT_ALLOWED,
  final_price_locked: "The final price can only change between pickup and payment.",
  final_price_required: "Enter the final price first.",
  payout_ref_required: "Enter the payout reference.",
  cancel_reason_required: "Give a reason for cancelling.",
  tracking_required: "Enter the tracking number before marking as shipped.",
  tracking_locked: "Tracking can only change while the order is packed or shipped.",
  nothing_to_refund: "This order has no captured payment to refund.",
  refund_ref_required: "Enter the refund reference.",
};

/** Turns a trigger exception into staff-facing text; anything else stays generic. */
export function dbErrorMessage(message: string | undefined): string {
  return (message && DB_ERRORS[message]) ?? "The order could not be updated. Reload the page and try again.";
}
