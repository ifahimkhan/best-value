import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { todayInIndia } = await import("./dashboard");

describe("todayInIndia", () => {
  it("uses the Indian calendar date, not UTC", () => {
    expect(todayInIndia(new Date("2026-10-22T19:00:00Z"))).toBe("2026-10-23");
    expect(todayInIndia(new Date("2026-10-22T18:00:00Z"))).toBe("2026-10-22");
  });
});
