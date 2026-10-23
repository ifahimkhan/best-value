import { describe, expect, it } from "vitest";
import { formatStorage, parseBuyPrice, parseNewDeviceForm, parsePriceForm, variantLabel } from "./device-form";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of [value].flat()) data.append(key, v);
  return data;
}

const VALID = {
  category: "phone",
  brand: "samsung",
  name: "  Galaxy S26  ",
  releaseYear: "2026",
  isActive: "on",
  variantRam: ["8", "12", ""],
  variantStorage: ["256", "1024", ""],
  variantPrice: ["45,000", "₹52000.50", ""],
};

describe("formatStorage and variantLabel", () => {
  it("shows whole terabytes as TB", () => {
    expect(formatStorage(128)).toBe("128 GB");
    expect(formatStorage(1024)).toBe("1 TB");
    expect(formatStorage(2048)).toBe("2 TB");
    expect(formatStorage(1536)).toBe("1536 GB");
  });

  it("matches the existing catalog labels", () => {
    expect(variantLabel(8, 256)).toBe("8 GB / 256 GB");
    expect(variantLabel(16, 1024)).toBe("16 GB / 1 TB");
    expect(variantLabel(null, 64)).toBe("64 GB");
    expect(variantLabel(null, null)).toBe("Standard");
  });
});

describe("parseBuyPrice", () => {
  it.each([
    ["45000", 45000],
    ["45,000", 45000],
    ["₹ 1,23,456.5", 123456.5],
    ["0", 0],
    ["1000000", 1000000],
  ])("reads %s", (raw, value) => {
    expect(parseBuyPrice(raw)).toBe(value);
  });

  it.each(["", "abc", "-5", "1.234", "1000000.01", "1e5"])("rejects %s", (raw) => {
    expect(parseBuyPrice(raw)).toBeNull();
  });
});

describe("parseNewDeviceForm", () => {
  it("builds the device and its variants, skipping blank rows", () => {
    expect(parseNewDeviceForm(form(VALID))).toEqual({
      ok: true,
      data: {
        category_slug: "phone",
        brand_slug: "samsung",
        name: "Galaxy S26",
        slug: "galaxy-s26",
        release_year: 2026,
        is_top_selling: false,
        is_active: true,
        variants: [
          { label: "8 GB / 256 GB", slug: "8-gb-256-gb", ram_gb: 8, storage_gb: 256, base_buy_price: 45000 },
          { label: "12 GB / 1 TB", slug: "12-gb-1-tb", ram_gb: 12, storage_gb: 1024, base_buy_price: 52000.5 },
        ],
      },
    });
  });

  it("gives a device with no memory sizes one standard variant", () => {
    const result = parseNewDeviceForm(
      form({ category: "tv", brand: "sony", name: "Bravia 55", variantRam: "", variantStorage: "", variantPrice: "18000", isTopSelling: "on" }),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        release_year: null,
        is_top_selling: true,
        is_active: false,
        variants: [{ label: "Standard", slug: "default", ram_gb: null, storage_gb: null, base_buy_price: 18000 }],
      },
    });
  });

  it("reports every field problem at once", () => {
    const result = parseNewDeviceForm(
      form({
        category: "Phone!",
        brand: "",
        name: " ",
        releaseYear: "1999",
        variantRam: ["8", "", "4"],
        variantStorage: ["", "128", "64"],
        variantPrice: ["1000", "abc", ""],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        category: "Choose a category",
        brand: "Choose a brand",
        name: "Enter the device name",
        releaseYear: "Use a year from 2000 to 2100",
        "variant-0": "Enter the storage as well as the RAM",
        "variant-1": "Enter a price from ₹0 to ₹10,00,000",
        "variant-2": "Enter a price from ₹0 to ₹10,00,000",
      },
    });
  });

  it("needs a storage size for phones and tablets", () => {
    const result = parseNewDeviceForm(form({ ...VALID, category: "tablet", variantRam: [""], variantStorage: [""], variantPrice: ["9000"] }));
    expect(result).toEqual({ ok: false, errors: { "variant-0": "Phones and tablets need the storage size" } });
  });

  it("needs at least one variant", () => {
    const result = parseNewDeviceForm(form({ ...VALID, variantRam: [""], variantStorage: [""], variantPrice: [""] }));
    expect(result).toEqual({ ok: false, errors: { variants: "Add at least one variant with a price" } });
  });

  it("rejects duplicate variants and bad sizes", () => {
    const result = parseNewDeviceForm(
      form({ ...VALID, variantRam: ["8", "8", "0"], variantStorage: ["256", "256", "64"], variantPrice: ["1", "2", "3"] }),
    );
    expect(result).toEqual({
      ok: false,
      errors: { "variant-1": "This variant is listed twice", "variant-2": "RAM and storage must be whole numbers of GB" },
    });
  });

  it("rejects names that give no URL and more than 20 variants", () => {
    expect(parseNewDeviceForm(form({ ...VALID, name: "!!!" }))).toEqual({ ok: false, errors: { name: "Use some letters or digits in the name" } });
    const many = Array.from({ length: 21 }, (_, i) => String(i + 1));
    const result = parseNewDeviceForm(form({ ...VALID, variantRam: many, variantStorage: many, variantPrice: many }));
    expect(result).toEqual({ ok: false, errors: { variants: "Add at most 20 variants" } });
    const huge = Array.from({ length: 41 }, () => "");
    expect(parseNewDeviceForm(form({ ...VALID, variantRam: huge }))).toEqual({ ok: false, errors: { variants: "Add at most 20 variants" } });
  });
});

describe("parsePriceForm", () => {
  it("reads one price per variant id", () => {
    expect(parsePriceForm(form({ deviceId: "7", "price-11": "41,000", "price-12": "0" }))).toEqual({
      ok: true,
      prices: [
        { variant_id: 11, price: 41000 },
        { variant_id: 12, price: 0 },
      ],
    });
  });

  it("reports bad prices by variant and ignores other fields", () => {
    expect(parsePriceForm(form({ "price-11": "", "price-12": "abc", "price-x": "5", other: "1" }))).toEqual({
      ok: false,
      errors: { "11": "Enter a price from ₹0 to ₹10,00,000", "12": "Enter a price from ₹0 to ₹10,00,000" },
    });
  });

  it("needs at least one price and at most 50", () => {
    expect(parsePriceForm(form({}))).toEqual({ ok: false, errors: {} });
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`price-${i + 1}`, "1"]));
    expect(parsePriceForm(form(many))).toEqual({ ok: false, errors: {} });
  });
});
