import { describe, expect, it } from "vitest";
import { googleImageSearchUrl } from "./google-image-search";

describe("googleImageSearchUrl", () => {
  it("searches Google Images for name, brand and category", () => {
    const url = new URL(googleImageSearchUrl({ name: "10 Pro 5G", brandName: "OnePlus", categoryName: "Smartphones" }));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("tbm")).toBe("isch");
    expect(url.searchParams.get("q")).toBe("10 Pro 5G OnePlus Smartphones");
  });

  it("encodes special characters so they cannot add parameters", () => {
    const url = new URL(googleImageSearchUrl({ name: "A&B=C #1", brandName: "X", categoryName: "Y" }));
    expect(url.searchParams.get("q")).toBe("A&B=C #1 X Y");
    expect([...url.searchParams.keys()].sort()).toEqual(["q", "tbm"]);
  });

  it("skips blank parts", () => {
    const url = new URL(googleImageSearchUrl({ name: " Pixel 8 ", brandName: "", categoryName: "Smartphones" }));
    expect(url.searchParams.get("q")).toBe("Pixel 8 Smartphones");
  });
});
