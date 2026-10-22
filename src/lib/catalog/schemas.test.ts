import { describe, expect, it } from "vitest";
import { parseBrandRows, parseDeviceDetail, parseDeviceRows } from "./schemas";

describe("parseBrandRows", () => {
  it("maps valid rows to camelCase", () => {
    expect(parseBrandRows([{ id: 1, name: "Apple", slug: "apple", logo_url: null }])).toEqual([
      { id: 1, name: "Apple", slug: "apple", logoUrl: null },
    ]);
  });

  it("drops malformed rows instead of throwing", () => {
    const rows = [{ id: 1, name: "Apple", slug: "apple", logo_url: null }, { id: "x", name: null }];
    expect(parseBrandRows(rows)).toHaveLength(1);
  });

  it("returns [] for non-array input", () => {
    expect(parseBrandRows(null)).toEqual([]);
  });
});

describe("parseDeviceRows", () => {
  const row = {
    id: 7,
    name: "iPhone 15",
    slug: "iphone-15",
    image_url: "https://x.supabase.co/storage/v1/object/public/devices/iphone-15.png",
    brand: { name: "Apple", slug: "apple" },
    category: { slug: "phone" },
    variants: [{ base_buy_price: "42000.00" }, { base_buy_price: 47000 }],
  };

  it("builds the device URL and the best 'up to' price", () => {
    expect(parseDeviceRows([row])).toEqual([
      {
        id: 7,
        name: "iPhone 15",
        slug: "iphone-15",
        imageUrl: row.image_url,
        brandName: "Apple",
        brandSlug: "apple",
        categorySlug: "phone",
        href: "/sell/phone/apple/iphone-15",
        maxPrice: 47000,
      },
    ]);
  });

  it("uses null maxPrice when a device has no variants", () => {
    expect(parseDeviceRows([{ ...row, variants: [] }])[0]?.maxPrice).toBeNull();
  });
});

describe("parseDeviceDetail", () => {
  it("sorts variants by price and builds variant URLs", () => {
    const detail = parseDeviceDetail({
      id: 7,
      name: "iPhone 15",
      slug: "iphone-15",
      image_url: null,
      brand: { name: "Apple", slug: "apple" },
      category: { name: "Smartphones", slug: "phone" },
      variants: [
        { id: 2, label: "6 GB / 256 GB", slug: "6-gb-256-gb", base_buy_price: 47000 },
        { id: 1, label: "6 GB / 128 GB", slug: "6-gb-128-gb", base_buy_price: "42000.00" },
      ],
    });

    expect(detail?.variants.map((v) => v.slug)).toEqual(["6-gb-128-gb", "6-gb-256-gb"]);
    expect(detail?.variants[0]).toMatchObject({
      price: 42000,
      href: "/sell/phone/apple/iphone-15/6-gb-128-gb",
    });
    expect(detail?.categoryName).toBe("Smartphones");
  });

  it("returns null for malformed input", () => {
    expect(parseDeviceDetail({ id: 7 })).toBeNull();
    expect(parseDeviceDetail(null)).toBeNull();
  });
});
