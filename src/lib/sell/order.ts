import { formatInr } from "@/lib/brand";
import type { Booking, PickupAddress } from "./booking";
import { computeQuote, type EvalQuestion } from "./pricing";
import { isValidPickupDate } from "./slots";

// Turns a validated booking into a sell_orders insert row. The quoted price
// comes from the current variant price and evaluation rules, never the client.

export interface QuoteVariant {
  id: number;
  price: number;
  categoryId: number;
}

export interface SellOrderRow {
  user_id: string;
  variant_id: number;
  answers: { question_id: number; option_ids: number[] }[];
  quoted_price: number;
  pickup_address: PickupAddress;
  pickup_date: string;
  pickup_slot: string;
  payout_method: Booking["payout"]["method"];
  payout_details: Record<string, string> | null;
}

/** bankAccountNumber goes to the staff-only table, never onto the order row. */
export type BuildResult =
  | { ok: true; row: SellOrderRow; bankAccountNumber: string | null }
  | { ok: false; error: string };

interface BuildInput {
  userId: string;
  booking: Booking;
  variant: QuoteVariant;
  questions: readonly EvalQuestion[];
  now: Date;
}

function payoutDetails(payout: Booking["payout"]): Record<string, string> | null {
  if (payout.method === "upi") return { upiId: payout.upiId };
  if (payout.method === "bank") {
    return { accountName: payout.accountName, accountLast4: payout.accountNumber.slice(-4), ifsc: payout.ifsc };
  }
  return null;
}

export function buildSellOrderRow({ userId, booking, variant, questions, now }: BuildInput): BuildResult {
  if (booking.variantId !== variant.id) return { ok: false, error: "This device is no longer available." };
  if (!isValidPickupDate(booking.pickupDate, now)) return { ok: false, error: "Choose a pickup date from the list." };

  const quote = computeQuote(variant.price, questions, booking.answers);
  if (!quote.ok) return { ok: false, error: quote.error };
  if (quote.price <= 0) {
    return { ok: false, error: "We can't make an offer for this device in its current condition." };
  }
  if (quote.price !== booking.expectedPrice) {
    return {
      ok: false,
      error: `Your price has changed to ${formatInr(quote.price)}. Please reload the page to review it before booking.`,
    };
  }

  return {
    ok: true,
    row: {
      user_id: userId,
      variant_id: variant.id,
      answers: questions.map((q) => ({ question_id: q.id, option_ids: [...new Set(booking.answers[q.id] ?? [])] })),
      quoted_price: quote.price,
      pickup_address: booking.address,
      pickup_date: booking.pickupDate,
      pickup_slot: booking.pickupSlot,
      payout_method: booking.payout.method,
      payout_details: payoutDetails(booking.payout),
    },
    bankAccountNumber: booking.payout.method === "bank" ? booking.payout.accountNumber : null,
  };
}
