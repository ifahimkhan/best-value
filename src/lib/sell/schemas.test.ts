import { describe, expect, it } from "vitest";
import { parseEvaluationRows, parseQuoteVariant, parseSellOrderRow, parseSellOrderRows } from "./schemas";

describe("parseEvaluationRows", () => {
  it("maps rows, coerces numeric strings and sorts options", () => {
    const result = parseEvaluationRows([
      {
        id: 1,
        section: "defect",
        input_type: "multi",
        title: "Damage",
        help_text: null,
        options: [
          { id: 3, label: "B", deduction_type: "flat", deduction_value: "500.00", sort_order: 2 },
          { id: 2, label: "A", deduction_type: "percent", deduction_value: 10, sort_order: 1 },
        ],
      },
      { id: "bad" },
    ]);
    expect(result).toEqual([
      {
        id: 1,
        section: "defect",
        inputType: "multi",
        title: "Damage",
        helpText: null,
        options: [
          { id: 2, label: "A", deductionType: "percent", deductionValue: 10 },
          { id: 3, label: "B", deductionType: "flat", deductionValue: 500 },
        ],
      },
    ]);
  });

  it("drops questions that have no options", () => {
    const rows = [{ id: 1, section: "age", input_type: "single", title: "Age", help_text: null, options: [] }];
    expect(parseEvaluationRows(rows)).toEqual([]);
    expect(parseEvaluationRows(null)).toEqual([]);
  });
});

describe("parseQuoteVariant", () => {
  const row = {
    id: 4,
    base_buy_price: "42000.00",
    device: { category_id: 1, category: { can_sell: true, coming_soon: false } },
  };

  it("returns the variant when its category is open for selling", () => {
    expect(parseQuoteVariant(row)).toEqual({ id: 4, price: 42000, categoryId: 1 });
  });

  it("returns null for closed categories or bad rows", () => {
    expect(parseQuoteVariant({ ...row, device: { ...row.device, category: { can_sell: true, coming_soon: true } } })).toBeNull();
    expect(parseQuoteVariant({ id: 4 })).toBeNull();
  });
});

const ORDER = {
  order_no: "BV-S-000001",
  status: "quoted",
  quoted_price: "20000.00",
  final_price: null,
  pickup_date: "2026-10-23",
  pickup_slot: "10:00-13:00",
  created_at: "2026-10-22T06:00:00Z",
  variant: { label: "6 GB / 128 GB", device: { name: "iPhone 15", brand: { name: "Apple" } } },
};

describe("parseSellOrderRows", () => {
  it("maps list rows and tolerates a hidden variant", () => {
    const result = parseSellOrderRows([ORDER, { ...ORDER, order_no: "BV-S-000002", variant: null }]);
    expect(result[0]).toMatchObject({ orderNo: "BV-S-000001", quotedPrice: 20000, deviceName: "Apple iPhone 15", variantLabel: "6 GB / 128 GB" });
    expect(result[1]).toMatchObject({ deviceName: "Device no longer listed", variantLabel: null });
  });
});

describe("parseSellOrderRow", () => {
  it("adds address and masked-ready payout to the detail", () => {
    const result = parseSellOrderRow({
      ...ORDER,
      pickup_address: {
        fullName: "Asha",
        phone: "+919876543210",
        line1: "12 MG Road",
        line2: null,
        landmark: null,
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
      },
      payout_method: "upi",
      payout_details: { upiId: "asha@okbank" },
    });
    expect(result?.payout).toEqual({ method: "upi", upiId: "asha@okbank" });
    expect(result?.address.city).toBe("Bengaluru");
  });

  it("returns null for broken rows", () => {
    expect(parseSellOrderRow({ ...ORDER, pickup_address: "x" })).toBeNull();
  });
});
