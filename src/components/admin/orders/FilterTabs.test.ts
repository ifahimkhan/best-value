import { describe, expect, it } from "vitest";
import { pickFilter } from "./FilterTabs";

describe("pickFilter", () => {
  const options = ["open", "paid", "all"] as const;
  it("accepts known values and falls back to the first option", () => {
    expect(pickFilter(options, "paid")).toBe("paid");
    expect(pickFilter(options, "bogus")).toBe("open");
    expect(pickFilter(options, ["paid"])).toBe("open");
    expect(pickFilter(options, undefined)).toBe("open");
  });
});
