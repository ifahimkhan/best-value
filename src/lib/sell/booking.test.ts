import { describe, expect, it } from "vitest";
import { maskPayout, parseAnswers, parseBookingForm } from "./booking";

const VALID = {
  variantId: "4",
  expectedPrice: "20000",
  answers: JSON.stringify([{ questionId: 1, optionIds: [11] }]),
  fullName: "Asha Rao",
  phone: "98765 43210",
  line1: "12 MG Road",
  line2: "",
  landmark: "",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  pickupDate: "2026-10-23",
  pickupSlot: "10:00-13:00",
  payoutMethod: "upi",
  upiId: "asha@okbank",
};

describe("parseAnswers", () => {
  it("turns the JSON payload into an answers map", () => {
    expect(parseAnswers(VALID.answers)).toEqual({ 1: [11] });
  });

  it("rejects malformed or oversized payloads", () => {
    expect(parseAnswers("not json")).toBeNull();
    expect(parseAnswers(JSON.stringify([{ questionId: "x", optionIds: [] }]))).toBeNull();
    expect(parseAnswers(JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ questionId: i + 1, optionIds: [] }))))).toBeNull();
  });
});

describe("parseBookingForm", () => {
  it("accepts a complete UPI booking and normalises the phone", () => {
    const result = parseBookingForm(VALID);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.address.phone).toBe("+919876543210");
    expect(result.data.address.line2).toBeNull();
    expect(result.data.payout).toEqual({ method: "upi", upiId: "asha@okbank" });
    expect(result.data.answers).toEqual({ 1: [11] });
    expect(result.data.expectedPrice).toBe(20000);
  });

  it("accepts a bank payout and upper-cases the IFSC", () => {
    const result = parseBookingForm({
      ...VALID,
      payoutMethod: "bank",
      upiId: "",
      accountName: "Asha Rao",
      accountNumber: "123456789012",
      ifsc: "sbin0001234",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.payout).toEqual({
      method: "bank",
      accountName: "Asha Rao",
      accountNumber: "123456789012",
      ifsc: "SBIN0001234",
    });
  });

  it("accepts cash without extra details", () => {
    const result = parseBookingForm({ ...VALID, payoutMethod: "cash", upiId: "" });
    expect(result.success && result.data.payout).toEqual({ method: "cash" });
  });

  it("reports field errors", () => {
    const result = parseBookingForm({ ...VALID, pincode: "012345", phone: "12345", upiId: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["phone", "pincode", "upiId"]);
  });

  it("rejects an unknown slot and a bad answers payload", () => {
    const result = parseBookingForm({ ...VALID, pickupSlot: "00:00-01:00", answers: "[" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.pickupSlot).toBeDefined();
    expect(result.fieldErrors.answers).toBeDefined();
  });
});

describe("maskPayout", () => {
  it("hides most of the account details", () => {
    expect(maskPayout({ method: "upi", upiId: "asha@okbank" })).toBe("UPI: as•••@okbank");
    expect(
      maskPayout({ method: "bank", accountName: "Asha", accountLast4: "9012", ifsc: "SBIN0001234" }),
    ).toBe("Bank: ••••9012 (SBIN0001234)");
    expect(maskPayout({ method: "cash" })).toBe("Cash at pickup");
    expect(maskPayout(null)).toBe("Not set");
  });
});
