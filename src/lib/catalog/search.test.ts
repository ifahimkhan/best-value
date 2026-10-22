import { describe, expect, it } from "vitest";
import { escapeLike, normalizeQuery, splitBrandFromQuery, MAX_QUERY_LENGTH } from "./search";

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  iphone    15  ")).toBe("iphone 15");
  });

  it("returns null for empty or too-short queries", () => {
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery("a")).toBeNull();
    expect(normalizeQuery(null)).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
  });

  it("caps length", () => {
    expect(normalizeQuery("x".repeat(500))?.length).toBe(MAX_QUERY_LENGTH);
  });

  it("strips characters that break PostgREST filters", () => {
    expect(normalizeQuery("galaxy,s23)(")).toBe("galaxy s23");
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and backslash", () => {
    expect(escapeLike("100%_off\\")).toBe("100\\%\\_off\\\\");
  });
});

describe("splitBrandFromQuery", () => {
  const brands = [
    { slug: "apple", name: "Apple" },
    { slug: "oneplus", name: "OnePlus" },
    { slug: "google", name: "Google" },
  ];

  it("pulls a leading brand out of the query", () => {
    expect(splitBrandFromQuery("apple iphone 15", brands)).toEqual({ brandSlug: "apple", text: "iphone 15" });
  });

  it("matches brand case-insensitively anywhere in the query", () => {
    expect(splitBrandFromQuery("nord ce oneplus", brands)).toEqual({ brandSlug: "oneplus", text: "nord ce" });
  });

  it("returns brand only when query is just a brand", () => {
    expect(splitBrandFromQuery("Google", brands)).toEqual({ brandSlug: "google", text: "" });
  });

  it("leaves query alone when no brand matches", () => {
    expect(splitBrandFromQuery("galaxy s23", brands)).toEqual({ brandSlug: null, text: "galaxy s23" });
  });

  it("does not match brand names inside other words", () => {
    expect(splitBrandFromQuery("pineapple phone", brands)).toEqual({ brandSlug: null, text: "pineapple phone" });
  });
});
