import { describe, expect, it } from "vitest";
import { deviceListHref, parseDeviceId, parseDeviceListParams } from "./admin-device-list";

describe("parseDeviceListParams", () => {
  it("defaults to placeholder devices on page 1", () => {
    expect(parseDeviceListParams({})).toEqual({ q: null, brand: null, category: null, image: "placeholder", page: 1 });
  });

  it("reads a search, filter and page", () => {
    expect(parseDeviceListParams({ q: "  iPhone 15 ", brand: "apple", image: "custom", page: "3" })).toEqual({
      q: "iPhone 15",
      brand: "apple",
      category: null,
      image: "custom",
      page: 3,
    });
  });

  it("ignores unknown filters, bad pages and repeated params", () => {
    expect(parseDeviceListParams({ image: "evil", page: "-2" })).toEqual({ q: null, brand: null, category: null, image: "placeholder", page: 1 });
    expect(parseDeviceListParams({ image: ["all", "custom"], page: "1.5" })).toEqual({ q: null, brand: null, category: null, image: "placeholder", page: 1 });
    expect(parseDeviceListParams({ page: "10001" }).page).toBe(1);
  });

  it.each(["Apple", "apple,samsung", "a.b", "", "x".repeat(121)])("ignores the invalid slug %s", (slug) => {
    expect(parseDeviceListParams({ brand: slug, category: slug })).toMatchObject({ brand: null, category: null });
  });

  it("reads a category slug", () => {
    expect(parseDeviceListParams({ category: "smartwatch" }).category).toBe("smartwatch");
  });
});

describe("deviceListHref", () => {
  const base = { q: null, brand: null, category: null, image: "placeholder", page: 1 } as const;

  it("omits defaults", () => {
    expect(deviceListHref(base)).toBe("/admin/catalog");
  });

  it("encodes changed values", () => {
    expect(deviceListHref(base, { q: "galaxy s23", category: "phone", brand: "samsung", image: "all", page: 2 })).toBe(
      "/admin/catalog?q=galaxy+s23&category=phone&brand=samsung&image=all&page=2",
    );
  });
});

describe("parseDeviceId", () => {
  it("accepts positive integer strings", () => {
    expect(parseDeviceId("42")).toBe(42);
  });

  it.each([null, "", "0", "-1", "1.5", "01", "abc", "1e3", "1234567890123456"])("rejects %s", (value) => {
    expect(parseDeviceId(value)).toBeNull();
  });
});
