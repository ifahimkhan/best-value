import { describe, expect, it } from "vitest";
import { applyMapping, DEFAULT_OPTIONS, parseMapping, suggestMapping, type FeedMapping } from "./mapping";

const MAPPING: FeedMapping = {
  fields: {
    sku: "Item Code",
    title: "Name",
    price: "Dealer Price",
    mrp: "MRP",
    stock: "Qty",
    condition: "Grade",
    brand: "Make",
    gstRate: "GST",
    images: "Images",
    active: "Status",
  },
  options: { ...DEFAULT_OPTIONS, markupPercent: 10 },
};

const ROW = {
  "Item Code": " IP14-128 ",
  Name: "iPhone 14 128GB",
  "Dealer Price": "₹36,000.00",
  MRP: "59,900",
  Qty: "4",
  Grade: "Like New",
  Make: "Apple",
  GST: "18%",
  Images: "https://cdn.example.com/a.jpg | http://insecure.example.com/b.jpg, https://cdn.example.com/c.jpg",
  Status: "Active",
};

describe("applyMapping", () => {
  it("normalises a row and applies the markup", () => {
    expect(applyMapping(ROW, MAPPING)).toEqual({
      ok: true,
      item: {
        supplierSku: "IP14-128",
        title: "iPhone 14 128GB",
        price: 39600,
        mrp: 59900,
        stock: 4,
        description: null,
        condition: "refurbished_superb",
        brandName: "Apple",
        categoryName: null,
        gstRate: 18,
        hsnCode: null,
        images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/c.jpg"],
        isActive: true,
      },
    });
  });

  it("drops MRP when the selling price would be above it", () => {
    const result = applyMapping({ ...ROW, MRP: "30000" }, MAPPING);
    expect(result.ok && result.item.mrp).toBeNull();
  });

  it("uses defaults for unmapped or empty optional fields", () => {
    const result = applyMapping(
      { "Item Code": "X", Name: "Case", "Dealer Price": "100" },
      { fields: { sku: "Item Code", title: "Name", price: "Dealer Price" }, options: DEFAULT_OPTIONS },
    );
    expect(result).toMatchObject({ ok: true, item: { stock: 0, condition: "new", gstRate: 18, isActive: true, mrp: null } });
  });

  it("reports every problem in a row", () => {
    const result = applyMapping({ ...ROW, "Item Code": "", "Dealer Price": "call us", Qty: "-2", GST: "7" }, MAPPING);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual(["sku", "price", "stock", "gstRate"]);
  });

  it("maps condition words and inactive statuses", () => {
    const fair = applyMapping({ ...ROW, Grade: "Grade C", Status: "discontinued" }, MAPPING);
    expect(fair).toMatchObject({ ok: true, item: { condition: "refurbished_fair", isActive: false } });
    const sealed = applyMapping({ ...ROW, Grade: "Brand new sealed" }, MAPPING);
    expect(sealed.ok && sealed.item.condition).toBe("new");
  });

  it("truncates over-long text", () => {
    const result = applyMapping({ ...ROW, Name: "x".repeat(500) }, MAPPING);
    expect(result.ok && result.item.title.length).toBe(200);
  });
});

describe("suggestMapping", () => {
  it("guesses fields from common column names", () => {
    expect(suggestMapping(["Item Code", "Product Name", "Selling Price", "MRP", "Quantity", "Brand", "Image URL", "HSN"])).toEqual({
      sku: "Item Code",
      title: "Product Name",
      price: "Selling Price",
      mrp: "MRP",
      stock: "Quantity",
      brand: "Brand",
      images: "Image URL",
      hsnCode: "HSN",
    });
  });
});

describe("parseMapping", () => {
  it("fills defaults and drops unknown fields", () => {
    expect(parseMapping({ fields: { sku: "a", bogus: "b" } })).toEqual({ fields: { sku: "a" }, options: DEFAULT_OPTIONS });
    expect(parseMapping(null)).toEqual({ fields: {}, options: DEFAULT_OPTIONS });
  });

  it("rejects out-of-range options", () => {
    expect(parseMapping({ fields: {}, options: { markupPercent: 900 } }).options.markupPercent).toBe(0);
  });
});
