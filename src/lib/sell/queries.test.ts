import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellOrderRow } from "./order";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fake = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return createFakeSupabase();
});
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));

const { cacheLife, cacheTag } = await import("next/cache");
const { logger } = await import("@/lib/logger");
const { allCalls, callArgs } = await import("@/test/fake-supabase");
const { CATALOG_TAG } = await import("@/lib/catalog/queries");
const {
  ORDER_NO_PATTERN,
  createSellOrder,
  getEvaluation,
  getEvaluationFresh,
  getMySellOrder,
  getQuoteVariant,
  listMySellOrders,
} = await import("./queries");

const DB_ERROR = { message: "connection reset" };
const QUESTION_ROW = {
  id: 5,
  section: "question",
  input_type: "yes_no",
  title: "Does the phone switch on?",
  help_text: null,
  options: [
    { id: 52, label: "No", deduction_type: "percent", deduction_value: "40", sort_order: 2 },
    { id: 51, label: "Yes", deduction_type: "flat", deduction_value: 0, sort_order: 1 },
  ],
};
const PARSED_QUESTION = {
  id: 5,
  section: "question",
  inputType: "yes_no",
  title: "Does the phone switch on?",
  helpText: null,
  options: [
    { id: 51, label: "Yes", deductionType: "flat", deductionValue: 0 },
    { id: 52, label: "No", deductionType: "percent", deductionValue: 40 },
  ],
};
const ORDER_ROW = {
  order_no: "BV-S-000123",
  status: "quoted",
  quoted_price: "42000.00",
  final_price: null,
  pickup_date: "2026-10-25",
  pickup_slot: "10:00-13:00",
  created_at: "2026-10-22T10:00:00Z",
  variant: { label: "128 GB", device: { name: "iPhone 15", brand: { name: "Apple" } } },
};
const ADDRESS = {
  fullName: "Asha Rao",
  phone: "9876543210",
  line1: "12 MG Road",
  line2: null,
  landmark: null,
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};
const SELL_ROW: SellOrderRow = {
  user_id: "user-1",
  variant_id: 7,
  answers: [{ question_id: 5, option_ids: [51] }],
  quoted_price: 42000,
  pickup_address: ADDRESS,
  pickup_date: "2026-10-25",
  pickup_slot: "10:00-13:00",
  payout_method: "upi",
  payout_details: { upiId: "asha@upi" },
};

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("getEvaluation", () => {
  it("parses questions for the category and caches for hours", async () => {
    fake.respond("evaluation_questions", { data: [QUESTION_ROW, { ...QUESTION_ROW, id: 6, options: [] }] });
    expect(await getEvaluation(10)).toEqual([PARSED_QUESTION]);
    const [query] = fake.queriesFor("evaluation_questions");
    expect(callArgs(query, "eq")).toEqual(["category_id", 10]);
    expect(callArgs(query, "order")).toEqual(["sort_order"]);
    expect(cacheTag).toHaveBeenCalledWith(CATALOG_TAG);
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("returns [] on error and caches only briefly", async () => {
    fake.respond("evaluation_questions", { error: DB_ERROR });
    expect(await getEvaluation(10)).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load evaluation questions", DB_ERROR, { categoryId: 10 });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
  });
});

describe("getEvaluationFresh", () => {
  it("returns parsed questions without touching the cache", async () => {
    fake.respond("evaluation_questions", { data: [QUESTION_ROW] });
    expect(await getEvaluationFresh(10)).toEqual([PARSED_QUESTION]);
    expect(cacheLife).not.toHaveBeenCalled();
  });

  it("returns [] on error", async () => {
    fake.respond("evaluation_questions", { error: DB_ERROR });
    expect(await getEvaluationFresh(10)).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("getQuoteVariant", () => {
  const variant = {
    id: 7,
    base_buy_price: "42000.00",
    device: { category_id: 10, category: { can_sell: true, coming_soon: false } },
  };

  it("returns the variant price for a sellable category", async () => {
    fake.respond("device_variants", { data: variant });
    expect(await getQuoteVariant(7)).toEqual({ id: 7, price: 42000, categoryId: 10 });
    const [query] = fake.queriesFor("device_variants");
    expect(callArgs(query, "eq")).toEqual(["id", 7]);
    expect(callArgs(query, "maybeSingle")).toEqual([]);
  });

  it("returns null when the category is not sellable", async () => {
    fake.respond("device_variants", { data: { ...variant, device: { ...variant.device, category: { can_sell: false, coming_soon: false } } } });
    expect(await getQuoteVariant(7)).toBeNull();
  });

  it("returns null when the variant is missing", async () => {
    fake.respond("device_variants", { data: null });
    expect(await getQuoteVariant(7)).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("device_variants", { error: DB_ERROR });
    expect(await getQuoteVariant(7)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Failed to load variant for quote", DB_ERROR, { variantId: 7 });
  });
});

describe("createSellOrder", () => {
  it("calls the rpc with the order, account number and daily limit", async () => {
    fake.respond("rpc:create_sell_order", { data: "BV-S-000123" });
    expect(await createSellOrder(SELL_ROW, "123456789012", 3)).toEqual({ ok: true, orderNo: "BV-S-000123" });
    expect(callArgs(fake.queriesFor("rpc:create_sell_order")[0], "rpc")).toEqual([
      { p_order: SELL_ROW, p_account_number: "123456789012", p_max_per_day: 3 },
    ]);
  });

  it("maps the rate_limited exception without logging it", async () => {
    fake.respond("rpc:create_sell_order", { error: { code: "P0001", message: "rate_limited" } });
    expect(await createSellOrder(SELL_ROW, null, 3)).toEqual({ ok: false, reason: "rate_limited" });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("maps other errors to a generic failure and logs", async () => {
    const error = { code: "P0001", message: "something else" };
    fake.respond("rpc:create_sell_order", { error });
    expect(await createSellOrder(SELL_ROW, null, 3)).toEqual({ ok: false, reason: "error" });
    expect(logger.error).toHaveBeenCalledWith("Failed to create sell order", error, { userId: "user-1", variantId: 7 });
  });

  it("treats a non-string result as a failure", async () => {
    fake.respond("rpc:create_sell_order", { data: null });
    expect(await createSellOrder(SELL_ROW, null, 3)).toEqual({ ok: false, reason: "error" });
  });
});

describe("listMySellOrders", () => {
  it("lists the newest 50 orders and summarises each", async () => {
    fake.respond("sell_orders", { data: [ORDER_ROW, { ...ORDER_ROW, order_no: "BV-S-000124", variant: null }] });
    expect(await listMySellOrders()).toEqual([
      {
        orderNo: "BV-S-000123",
        status: "quoted",
        quotedPrice: 42000,
        finalPrice: null,
        pickupDate: "2026-10-25",
        pickupSlot: "10:00-13:00",
        createdAt: "2026-10-22T10:00:00Z",
        deviceName: "Apple iPhone 15",
        variantLabel: "128 GB",
      },
      expect.objectContaining({ orderNo: "BV-S-000124", deviceName: "Device no longer listed", variantLabel: null }),
    ]);
    const [query] = fake.queriesFor("sell_orders");
    expect(callArgs(query, "order")).toEqual(["created_at", { ascending: false }]);
    expect(callArgs(query, "limit")).toEqual([50]);
  });

  it("returns [] and logs on error", async () => {
    fake.respond("sell_orders", { error: DB_ERROR });
    expect(await listMySellOrders()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to list sell orders", DB_ERROR);
  });
});

describe("getMySellOrder", () => {
  const detail = { ...ORDER_ROW, pickup_address: ADDRESS, payout_method: "upi", payout_details: { upiId: "asha@upi" } };

  it("accepts only BV-S order numbers", () => {
    expect(ORDER_NO_PATTERN.test("BV-S-000123")).toBe(true);
    expect(ORDER_NO_PATTERN.test("BV-O-000123")).toBe(false);
    expect(ORDER_NO_PATTERN.test("BV-S-123")).toBe(false);
  });

  it("rejects a malformed order number without querying", async () => {
    expect(await getMySellOrder("BV-S-1'; drop")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("returns the order with address and payout", async () => {
    fake.respond("sell_orders", { data: detail });
    expect(await getMySellOrder("BV-S-000123")).toMatchObject({
      orderNo: "BV-S-000123",
      address: ADDRESS,
      payout: { method: "upi", upiId: "asha@upi" },
    });
    const [query] = fake.queriesFor("sell_orders");
    expect(allCalls(query, "eq")).toEqual([["order_no", "BV-S-000123"]]);
    expect(String(callArgs(query, "select")?.[0])).toContain("payout_details");
  });

  it("returns null when the order is not found", async () => {
    fake.respond("sell_orders", { data: null });
    expect(await getMySellOrder("BV-S-000999")).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("sell_orders", { error: DB_ERROR });
    expect(await getMySellOrder("BV-S-000123")).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Failed to load sell order", DB_ERROR, { orderNo: "BV-S-000123" });
  });
});
