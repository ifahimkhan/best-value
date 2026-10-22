import { describe, expect, it } from "vitest";
import type { FeedItem } from "./mapping";
import { planImport, type ExistingProduct } from "./plan";

const ITEM: FeedItem = {
  supplierSku: "IP14-128",
  title: "iPhone 14 128GB",
  price: 39600,
  mrp: 59900,
  stock: 4,
  description: null,
  condition: "refurbished_good",
  brandName: "apple",
  categoryName: "Smartphones",
  gstRate: 18,
  hsnCode: "8517",
  images: ["https://cdn.example.com/a.jpg"],
  isActive: true,
};

const BRANDS = [{ id: 1, name: "Apple", slug: "apple" }];
const CATEGORIES = [{ id: 7, name: "Smartphones", slug: "phone" }];

const EXISTING: ExistingProduct = {
  id: "p1",
  supplierSku: "IP14-128",
  title: "iPhone 14 128GB",
  price: 39600,
  mrp: 59900,
  stock: 4,
  description: "Hand-written by staff",
  condition: "refurbished_good",
  brandId: 1,
  categoryId: 7,
  gstRate: 18,
  hsnCode: "8517",
  images: ["https://cdn.example.com/a.jpg"],
  isActive: true,
  lockedFields: ["description"],
};

const base = { supplierId: 3, brands: BRANDS, categories: CATEGORIES, missingPolicy: "keep" as const };

describe("planImport", () => {
  it("creates new products with a supplier-scoped sku and slug", () => {
    const plan = planImport({ ...base, items: [{ row: 2, item: ITEM }], existing: [] });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      supplier_id: 3,
      supplier_sku: "IP14-128",
      sku: "S3-IP14-128",
      brand_id: 1,
      category_id: 7,
      source: "feed",
      price: 39600,
    });
    expect(plan.inserts[0].slug).toMatch(/^iphone-14-128gb-s3-[a-z0-9]{6}$/);
  });

  it("skips unchanged products", () => {
    const plan = planImport({ ...base, items: [{ row: 2, item: ITEM }], existing: [EXISTING] });
    expect(plan).toMatchObject({ inserts: [], updates: [], unchanged: 1 });
  });

  it("updates only changed, unlocked fields", () => {
    const plan = planImport({
      ...base,
      items: [{ row: 2, item: { ...ITEM, price: 38000, stock: 2, description: "Supplier text" } }],
      existing: [EXISTING],
    });
    expect(plan.updates).toEqual([{ id: "p1", changes: { price: 38000, stock: 2 } }]);
  });

  it("keeps the existing MRP valid when a locked MRP is below the new price", () => {
    const plan = planImport({
      ...base,
      items: [{ row: 2, item: { ...ITEM, price: 60000, mrp: 70000 } }],
      existing: [{ ...EXISTING, mrp: 59900, lockedFields: ["mrp"] }],
    });
    expect(plan.updates).toEqual([]);
    expect(plan.errors).toEqual([{ row: 2, sku: "IP14-128", message: "Price is above the locked MRP" }]);
  });

  it("flags duplicate SKUs in the same feed", () => {
    const plan = planImport({ ...base, items: [{ row: 2, item: ITEM }, { row: 3, item: ITEM }], existing: [] });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.errors).toEqual([{ row: 3, sku: "IP14-128", message: "Duplicate SKU in this feed" }]);
  });

  it("zeroes stock for products missing from a full feed", () => {
    const plan = planImport({
      ...base,
      missingPolicy: "zero_stock",
      items: [],
      existing: [EXISTING, { ...EXISTING, id: "p2", supplierSku: "GONE", stock: 0 }],
    });
    expect(plan.updates).toEqual([]);
    expect(plan.zeroed).toEqual([{ id: "p1", changes: { stock: 0 } }]);
  });

  it("does not zero products whose feed row failed validation", () => {
    const plan = planImport({
      ...base,
      missingPolicy: "zero_stock",
      items: [],
      existing: [EXISTING],
      failedSkus: new Set(["IP14-128"]),
    });
    expect(plan.zeroed).toEqual([]);
  });

  it("never overwrites fields the mapping does not fill", () => {
    const plan = planImport({
      ...base,
      mappedFields: new Set(["sku", "title", "price"]),
      items: [{ row: 2, item: { ...ITEM, price: 38000, stock: 0, gstRate: 5, images: [] } }],
      existing: [EXISTING],
    });
    expect(plan.updates).toEqual([{ id: "p1", changes: { price: 38000 } }]);
  });

  it("clears an unlocked MRP the feed no longer sends", () => {
    const plan = planImport({ ...base, items: [{ row: 2, item: { ...ITEM, mrp: null } }], existing: [EXISTING] });
    expect(plan.updates).toEqual([{ id: "p1", changes: { mrp: null } }]);
  });

  it("leaves unknown brands and categories empty", () => {
    const plan = planImport({ ...base, items: [{ row: 2, item: { ...ITEM, brandName: "Nokia", categoryName: null } }], existing: [] });
    expect(plan.inserts[0]).toMatchObject({ brand_id: null, category_id: null });
  });
});
