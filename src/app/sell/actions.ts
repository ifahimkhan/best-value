"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { parseBookingForm, type FieldErrors } from "@/lib/sell/booking";
import { buildSellOrderRow } from "@/lib/sell/order";
import { createSellOrder, getEvaluationFresh, getQuoteVariant } from "@/lib/sell/queries";

export interface BookingState {
  error?: string;
  fieldErrors?: FieldErrors;
}

const MAX_SELL_ORDERS_PER_DAY = 5;
const GENERIC_ERROR = "We couldn't book your pickup. Please try again in a moment.";

export async function bookPickup(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please log in to book your pickup." };

  const parsed = parseBookingForm(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };

  // Price and rules are read fresh: the quote is decided here, not in the browser
  const variant = await getQuoteVariant(parsed.data.variantId);
  if (!variant) return { error: "This device is no longer available to sell." };
  const questions = await getEvaluationFresh(variant.categoryId);
  if (questions.length === 0) return { error: GENERIC_ERROR };

  const built = buildSellOrderRow({ userId: user.id, booking: parsed.data, variant, questions, now: new Date() });
  if (!built.ok) return { error: built.error };

  // The database function enforces the daily limit atomically
  const created = await createSellOrder(built.row, built.bankAccountNumber, MAX_SELL_ORDERS_PER_DAY);
  if (!created.ok) {
    return created.reason === "rate_limited"
      ? { error: "You've booked several pickups today. Please contact support to book more." }
      : { error: GENERIC_ERROR };
  }

  redirect(`/account/sell/${created.orderNo}?new=1`);
}
