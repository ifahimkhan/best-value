import { describe, expect, it } from "vitest";
import { POLICY_UPDATED, REFUND_PROCESSING_DAYS, RETURN_WINDOW_DAYS } from "./policy";

describe("policy terms", () => {
  it("uses positive whole-day windows", () => {
    for (const days of [RETURN_WINDOW_DAYS, REFUND_PROCESSING_DAYS]) {
      expect(Number.isInteger(days)).toBe(true);
      expect(days).toBeGreaterThan(0);
    }
  });

  it("has a parseable last-updated date", () => {
    expect(Number.isNaN(Date.parse(POLICY_UPDATED))).toBe(false);
  });
});
