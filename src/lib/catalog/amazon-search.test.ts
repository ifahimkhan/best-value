import { describe, expect, it } from "vitest";
import { amazonSearchUrl } from "./amazon-search";

describe("amazonSearchUrl", () => {
  it("searches Amazon India for name, brand and category", () => {
    const url = new URL(amazonSearchUrl({ name: "10 Pro 5G", brandName: "OnePlus", categoryName: "Smartphones" }));
    expect(url.origin).toBe("https://www.amazon.in");
    expect(url.pathname).toBe("/s");
    expect(url.searchParams.get("k")).toBe("10 Pro 5G OnePlus Smartphones");
  });

  it("encodes special characters so they cannot add parameters", () => {
    const url = new URL(amazonSearchUrl({ name: "A&B=C #1", brandName: "X", categoryName: "Y" }));
    expect(url.searchParams.get("k")).toBe("A&B=C #1 X Y");
    expect([...url.searchParams.keys()]).toEqual(["k"]);
  });

  it("skips blank parts", () => {
    const url = new URL(amazonSearchUrl({ name: " Pixel 8 ", brandName: "", categoryName: "Smartphones" }));
    expect(url.searchParams.get("k")).toBe("Pixel 8 Smartphones");
  });
});
