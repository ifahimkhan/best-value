import { describe, expect, it } from "vitest";
import type { Booking } from "./booking";
import { buildSellOrderRow, type QuoteVariant } from "./order";
import type { EvalQuestion } from "./pricing";

const NOW = new Date("2026-10-22T06:00:00Z");

const QUESTIONS: EvalQuestion[] = [
  {
    id: 1,
    section: "question",
    inputType: "yes_no",
    title: "Switches on?",
    helpText: null,
    options: [
      { id: 11, label: "Yes", deductionType: "flat", deductionValue: 0 },
      { id: 12, label: "No", deductionType: "percent", deductionValue: 50 },
    ],
  },
];

const VARIANT: QuoteVariant = { id: 4, price: 40000, categoryId: 1 };

const BOOKING: Booking = {
  variantId: 4,
  expectedPrice: 20000,
  answers: { 1: [12] },
  address: {
    fullName: "Asha Rao",
    phone: "+919876543210",
    line1: "12 MG Road",
    line2: null,
    landmark: null,
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  pickupDate: "2026-10-23",
  pickupSlot: "10:00-13:00",
  payout: { method: "upi", upiId: "asha@okbank" },
};

describe("buildSellOrderRow", () => {
  it("builds the insert row with the server-computed price", () => {
    const result = buildSellOrderRow({ userId: "u1", booking: BOOKING, variant: VARIANT, questions: QUESTIONS, now: NOW });
    expect(result).toEqual({
      ok: true,
      row: {
        user_id: "u1",
        variant_id: 4,
        answers: [{ question_id: 1, option_ids: [12] }],
        quoted_price: 20000,
        pickup_address: BOOKING.address,
        pickup_date: "2026-10-23",
        pickup_slot: "10:00-13:00",
        payout_method: "upi",
        payout_details: { upiId: "asha@okbank" },
      },
      bankAccountNumber: null,
    });
  });

  it("stores no payout details for cash", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: { ...BOOKING, payout: { method: "cash" } },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result.ok && result.row.payout_details).toBeNull();
  });

  it("keeps the full bank account number out of the customer-readable row", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: {
        ...BOOKING,
        payout: { method: "bank", accountName: "Asha Rao", accountNumber: "123456789012", ifsc: "SBIN0001234" },
      },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.payout_details).toEqual({ accountName: "Asha Rao", accountLast4: "9012", ifsc: "SBIN0001234" });
    expect(JSON.stringify(result.row)).not.toContain("123456789012");
    expect(result.bankAccountNumber).toBe("123456789012");
  });

  it("rejects the booking when the price changed since the customer saw it", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: { ...BOOKING, expectedPrice: 21000 },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/price has changed to ₹20,000/);
  });

  it("rejects a variant that does not match the form", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: { ...BOOKING, variantId: 5 },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects pickup dates outside the booking window", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: { ...BOOKING, pickupDate: "2026-10-22" },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "Choose a pickup date from the list." });
  });

  it("passes pricing errors through", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: { ...BOOKING, answers: {} },
      variant: VARIANT,
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "Please answer: Switches on?" });
  });

  it("refuses to quote a device worth nothing", () => {
    const result = buildSellOrderRow({
      userId: "u1",
      booking: BOOKING,
      variant: { ...VARIANT, price: 0 },
      questions: QUESTIONS,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });
});
