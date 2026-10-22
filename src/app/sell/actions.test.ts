import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getQuoteVariant: vi.fn(),
  getEvaluationFresh: vi.fn(),
  createSellOrder: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/sell/queries", () => ({
  getQuoteVariant: mocks.getQuoteVariant,
  getEvaluationFresh: mocks.getEvaluationFresh,
  createSellOrder: mocks.createSellOrder,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { bookPickup } from "./actions";

const QUESTIONS = [
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

function tomorrowIst(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    variantId: "4",
    expectedPrice: "20000",
    answers: JSON.stringify([{ questionId: 1, optionIds: [12] }]),
    fullName: "Asha Rao",
    phone: "9876543210",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    pickupDate: tomorrowIst(),
    pickupSlot: "10:00-13:00",
    payoutMethod: "cash",
    // A tampered client price field must be ignored
    quoted_price: "999999",
    ...overrides,
  };
  Object.entries(fields).forEach(([k, v]) => data.set(k, v));
  return data;
}

describe("bookPickup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.getQuoteVariant.mockResolvedValue({ id: 4, price: 40000, categoryId: 1 });
    mocks.getEvaluationFresh.mockResolvedValue(QUESTIONS);
    mocks.createSellOrder.mockResolvedValue({ ok: true, orderNo: "BV-S-000007" });
  });

  it("requires a signed-in user", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    expect(await bookPickup({}, form())).toEqual({ error: "Please log in to book your pickup." });
    expect(mocks.createSellOrder).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    const result = await bookPickup({}, form({ pincode: "1" }));
    expect(result.fieldErrors?.pincode).toBeDefined();
    expect(mocks.createSellOrder).not.toHaveBeenCalled();
  });

  it("rejects unavailable variants", async () => {
    mocks.getQuoteVariant.mockResolvedValue(null);
    expect((await bookPickup({}, form())).error).toMatch(/no longer available/);
  });

  it("rejects the booking when the price moved", async () => {
    mocks.getQuoteVariant.mockResolvedValue({ id: 4, price: 42000, categoryId: 1 });
    expect((await bookPickup({}, form())).error).toMatch(/price has changed/);
    expect(mocks.createSellOrder).not.toHaveBeenCalled();
  });

  it("reports the database rate limit", async () => {
    mocks.createSellOrder.mockResolvedValue({ ok: false, reason: "rate_limited" });
    expect((await bookPickup({}, form())).error).toMatch(/several pickups/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("books with the server-computed price for the session user and redirects", async () => {
    await expect(bookPickup({}, form())).rejects.toThrow("REDIRECT:/account/sell/BV-S-000007?new=1");
    expect(mocks.createSellOrder).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", variant_id: 4, quoted_price: 20000, payout_method: "cash" }),
      null,
      5,
    );
  });

  it("passes the bank account number separately from the order row", async () => {
    const bank = { payoutMethod: "bank", accountName: "Asha Rao", accountNumber: "123456789012", ifsc: "SBIN0001234" };
    await expect(bookPickup({}, form(bank))).rejects.toThrow("REDIRECT:");
    const [row, accountNumber] = mocks.createSellOrder.mock.calls[0];
    expect(accountNumber).toBe("123456789012");
    expect(JSON.stringify(row)).not.toContain("123456789012");
  });

  it("reports insert failures without redirecting", async () => {
    mocks.createSellOrder.mockResolvedValue({ ok: false, reason: "error" });
    expect((await bookPickup({}, form())).error).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
