import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["iPhone 15 Pro Max", "iphone-15-pro-max"],
    ["6 GB / 128 GB", "6-gb-128-gb"],
    ["Galaxy S23 FE 5G", "galaxy-s23-fe-5g"],
    ["  OnePlus   Nord CE 3 Lite  ", "oneplus-nord-ce-3-lite"],
    ["Pixel 8a (2024)", "pixel-8a-2024"],
    ["Café — Edition", "cafe-edition"],
    ["Gaming Console", "gaming-console"],
  ])("slugifies %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns empty string for symbol-only input", () => {
    expect(slugify("/// ---")).toBe("");
  });
});

describe("isValidSlug", () => {
  it.each(["phone", "iphone-15", "6-gb-128-gb", "a"])("accepts %s", (s) => {
    expect(isValidSlug(s)).toBe(true);
  });

  it.each(["", "-phone", "phone-", "Phone", "iphone--15", "a/b", "a b", "%2e%2e", "x".repeat(121)])(
    "rejects %s",
    (s) => {
      expect(isValidSlug(s)).toBe(false);
    },
  );
});
