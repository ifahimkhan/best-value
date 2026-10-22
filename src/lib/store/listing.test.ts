import { describe, expect, it } from "vitest";
import { listingHref, parseListingParams, PAGE_SIZE } from "./listing";

describe("parseListingParams", () => {
  it("applies defaults", () => {
    expect(parseListingParams({})).toEqual({ category: null, brand: null, condition: null, sort: "featured", page: 1 });
  });

  it("keeps valid filters and drops junk", () => {
    expect(
      parseListingParams({ category: "phone", brand: "apple", condition: "refurbished_good", sort: "price_asc", page: "3" }),
    ).toEqual({ category: "phone", brand: "apple", condition: "refurbished_good", sort: "price_asc", page: 3 });
    expect(parseListingParams({ category: "../x", condition: "broken", sort: "random", page: "-2" })).toEqual({
      category: null,
      brand: null,
      condition: null,
      sort: "featured",
      page: 1,
    });
  });

  it("uses the first value of repeated params", () => {
    expect(parseListingParams({ brand: ["apple", "samsung"] }).brand).toBe("apple");
  });

  it("caps the page number", () => {
    expect(parseListingParams({ page: "100000" }).page).toBe(100);
  });
});

describe("listingHref", () => {
  it("builds a URL with only non-default params", () => {
    const base = parseListingParams({ category: "phone" });
    expect(listingHref(base)).toBe("/shop?category=phone");
    expect(listingHref(base, { sort: "price_desc", page: 2 })).toBe("/shop?category=phone&sort=price_desc&page=2");
    expect(listingHref(base, { category: null })).toBe("/shop");
  });

  it("resets to page 1 when filters change", () => {
    const base = parseListingParams({ page: "4" });
    expect(listingHref(base, { brand: "apple" })).toBe("/shop?brand=apple");
  });

  it("exposes a sane page size", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});
