import { describe, expect, it } from "vitest";
import { lineTax, orderTotals, splitTax, toPaise, toRupees } from "./gst";

describe("toPaise / toRupees", () => {
  it("converts without float drift", () => {
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toRupees(1999)).toBe(19.99);
  });
});

describe("lineTax", () => {
  it("backs GST out of a GST-inclusive price", () => {
    // 11800 incl. 18% = 10000 taxable + 1800 GST
    expect(lineTax(toPaise(11800), 18, 1)).toEqual({ gross: 1180000, taxable: 1000000, tax: 180000 });
  });

  it("multiplies by quantity before rounding", () => {
    // 3 x 99.99 incl. 18% = 299.97; taxable 254.21
    expect(lineTax(9999, 18, 3)).toEqual({ gross: 29997, taxable: 25421, tax: 4576 });
  });

  it("handles zero-rated goods", () => {
    expect(lineTax(5000, 0, 2)).toEqual({ gross: 10000, taxable: 10000, tax: 0 });
  });
});

describe("orderTotals", () => {
  it("sums lines so taxable + tax always equals the total", () => {
    const totals = orderTotals([
      { unitPricePaise: 9999, gstRate: 18, qty: 3 },
      { unitPricePaise: 4999900, gstRate: 12, qty: 1 },
    ]);
    expect(totals.total).toBe(29997 + 4999900);
    expect(totals.taxable + totals.tax).toBe(totals.total);
  });

  it("returns zeros for an empty order", () => {
    expect(orderTotals([])).toEqual({ taxable: 0, tax: 0, total: 0 });
  });
});

describe("splitTax", () => {
  it("splits into CGST + SGST inside the seller's state", () => {
    expect(splitTax(1801, "Karnataka", "karnataka ")).toEqual({ cgst: 901, sgst: 900, igst: 0 });
  });

  it("uses IGST across states or when the seller state is unknown", () => {
    expect(splitTax(1800, "Karnataka", "Maharashtra")).toEqual({ cgst: 0, sgst: 0, igst: 1800 });
    expect(splitTax(1800, null, "Karnataka")).toEqual({ cgst: 0, sgst: 0, igst: 1800 });
  });
});
