import { describe, expect, it } from "vitest";
import { normalizeIndianPhone, parseLoginIdentifier, otpSchema, safeNextPath } from "./auth";

describe("normalizeIndianPhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each(["12345", "5876543210", "+1 415 555 0100", "98765432101", "abcdefghij", ""])(
    "rejects %s",
    (input) => {
      expect(normalizeIndianPhone(input)).toBeNull();
    },
  );
});

describe("parseLoginIdentifier", () => {
  it("detects a phone number", () => {
    expect(parseLoginIdentifier("98765 43210")).toEqual({ kind: "phone", value: "+919876543210" });
  });

  it("detects and lower-cases an email", () => {
    expect(parseLoginIdentifier("  Asha@Example.COM ")).toEqual({ kind: "email", value: "asha@example.com" });
  });

  it("returns null for junk", () => {
    expect(parseLoginIdentifier("not-a-login")).toBeNull();
  });
});

describe("otpSchema", () => {
  it("accepts 6 digits", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
  });

  it.each(["12345", "1234567", "12a456", ""])("rejects %s", (input) => {
    expect(otpSchema.safeParse(input).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps internal paths", () => {
    expect(safeNextPath("/account/orders?tab=sell")).toBe("/account/orders?tab=sell");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/a\\b",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])(
    "falls back to / for %s",
    (input) => {
      expect(safeNextPath(input)).toBe("/");
    },
  );
});
