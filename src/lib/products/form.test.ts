import { describe, expect, it } from "vitest";
import { lockedFieldsAfterEdit, parseProductForm } from "./form";

const IMAGE_PREFIX = "https://proj.supabase.co/storage/v1/object/public/product-images/";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

const VALID: [string, string][] = [
  ["title", " iPhone 13 128GB "],
  ["sku", "BV-IP13-128"],
  ["slug", ""],
  ["description", "Checked and cleaned."],
  ["categoryId", "7"],
  ["brandId", ""],
  ["condition", "refurbished_good"],
  ["mrp", "49,900"],
  ["price", "32999.50"],
  ["gstRate", "18"],
  ["hsnCode", "8517"],
  ["stock", "3"],
  ["isActive", "on"],
  ["image", `${IMAGE_PREFIX}manual/a.jpg`],
  ["image", `${IMAGE_PREFIX}manual/b.png`],
];

describe("parseProductForm", () => {
  it("builds a product row and derives the slug from the title", () => {
    expect(parseProductForm(form(VALID), IMAGE_PREFIX)).toEqual({
      ok: true,
      data: {
        title: "iPhone 13 128GB",
        sku: "BV-IP13-128",
        slug: "iphone-13-128gb",
        description: "Checked and cleaned.",
        category_id: 7,
        brand_id: null,
        condition: "refurbished_good",
        mrp: 49900,
        price: 32999.5,
        gst_rate: 18,
        hsn_code: "8517",
        stock: 3,
        is_active: true,
        images: [`${IMAGE_PREFIX}manual/a.jpg`, `${IMAGE_PREFIX}manual/b.png`],
        locked_fields: [],
      },
    });
  });

  it("keeps a valid custom slug and requested locks", () => {
    const data = form([...VALID.filter(([k]) => k !== "slug"), ["slug", "iphone-13-deal"], ["lock", "price"], ["lock", "bogus"]]);
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(result.ok && result.data.slug).toBe("iphone-13-deal");
    expect(result.ok && result.data.locked_fields).toEqual(["price"]);
  });

  it("reports field errors", () => {
    const data = form([
      ["title", ""],
      ["sku", "has space"],
      ["slug", "Bad Slug"],
      ["condition", "mint"],
      ["mrp", "100"],
      ["price", "200"],
      ["gstRate", "7"],
      ["hsnCode", "85"],
      ["stock", "1.5"],
      ["categoryId", "abc"],
    ]);
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
      ["categoryId", "condition", "gstRate", "hsnCode", "price", "sku", "slug", "stock", "title"].sort(),
    );
  });

  it("keeps device photos shared onto the product, but not other catalog files", () => {
    const shared = `${IMAGE_PREFIX}catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp`;
    const data = form([...VALID, ["image", shared], ["image", `${IMAGE_PREFIX}catalog/placeholders/phone.png`]]);
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(result.ok && result.data.images).toEqual([`${IMAGE_PREFIX}manual/a.jpg`, `${IMAGE_PREFIX}manual/b.png`, shared]);
  });

  it("drops images that are not in our storage bucket", () => {
    const data = form([...VALID, ["image", "https://evil.example.com/x.jpg"], ["image", `${IMAGE_PREFIX}../../x`]]);
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(result.ok && result.data.images).toHaveLength(2);
  });

  it("treats a missing active checkbox as inactive and blank MRP as none", () => {
    const data = form(VALID.filter(([k]) => k !== "isActive" && k !== "mrp"));
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(result).toMatchObject({ ok: true, data: { is_active: false, mrp: null } });
  });
});

describe("lockedFieldsAfterEdit", () => {
  const before = { title: "A", price: 100, stock: 2, images: ["x"], is_active: true };

  it("locks fields staff changed on a feed product", () => {
    expect(
      lockedFieldsAfterEdit({ source: "feed", before, after: { ...before, price: 90, images: ["x", "y"] }, requested: ["title"] }),
    ).toEqual(["title", "price", "images"]);
  });

  it("never locks manual products automatically", () => {
    expect(lockedFieldsAfterEdit({ source: "manual", before, after: { ...before, price: 90 }, requested: [] })).toEqual([]);
  });
});

describe("parseProductForm amounts", () => {
  it("rejects an MRP that is not a valid amount instead of dropping it", () => {
    const data = new FormData();
    [...VALID.filter(([k]) => k !== "mrp"), ["mrp", "12x"] as [string, string]].forEach(([k, v]) => data.append(k, v));
    const result = parseProductForm(data, IMAGE_PREFIX);
    expect(!result.ok && result.errors.mrp).toMatch(/positive amount/);
  });
});

describe("lockedFieldsAfterEdit normalisation", () => {
  it("does not lock fields that only differ by whitespace or blank-vs-null", () => {
    const before = { title: " A ", description: "" };
    const after = { title: "A", description: null };
    expect(lockedFieldsAfterEdit({ source: "feed", before, after, requested: [] })).toEqual([]);
  });
});
