import { describe, expect, it } from "vitest";
import { googleFullName } from "./google-profile";

describe("googleFullName", () => {
  it("joins first and last name", () => {
    expect(googleFullName({ given_name: "Fahim", family_name: "Khan", name: "Ignored" })).toBe("Fahim Khan");
  });

  it("uses only the first name when there is no last name", () => {
    expect(googleFullName({ given_name: "Fahim" })).toBe("Fahim");
  });

  it("falls back to full_name, then name", () => {
    expect(googleFullName({ full_name: "Fahim Khan" })).toBe("Fahim Khan");
    expect(googleFullName({ name: "  Fahim   Khan " })).toBe("Fahim Khan");
  });

  it("returns null when nothing usable is present", () => {
    expect(googleFullName(null)).toBeNull();
    expect(googleFullName(undefined)).toBeNull();
    expect(googleFullName({})).toBeNull();
    expect(googleFullName({ given_name: 5, name: "   " })).toBeNull();
  });

  it("caps very long names", () => {
    expect(googleFullName({ name: "a".repeat(500) })?.length).toBe(100);
  });
});
