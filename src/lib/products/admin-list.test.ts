import { describe, expect, it } from "vitest";
import { adminListHref, parseAdminListParams } from "./admin-list";

describe("parseAdminListParams", () => {
  it("normalises filters and page", () => {
    expect(parseAdminListParams({ q: " iphone, 13 ", source: "feed", status: "inactive", page: "3" })).toEqual({
      q: "iphone 13",
      source: "feed",
      status: "inactive",
      page: 3,
    });
  });

  it("falls back to defaults for bad input", () => {
    expect(parseAdminListParams({ q: ["a", "b"], source: "x", status: "y", page: "-1" })).toEqual({
      q: null,
      source: "all",
      status: "all",
      page: 1,
    });
  });
});

describe("adminListHref", () => {
  it("keeps only non-default params", () => {
    expect(adminListHref({ q: "pixel", source: "all", status: "active", page: 1 }, { page: 2 })).toBe(
      "/admin/products?q=pixel&status=active&page=2",
    );
    expect(adminListHref({ q: null, source: "all", status: "all", page: 4 }, { page: 1 })).toBe("/admin/products");
  });
});
