import { describe, expect, it } from "vitest";
import { clientKey } from "./client-key";

describe("clientKey", () => {
  it("hashes the first forwarded address", () => {
    const a = clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    const b = clientKey(new Headers({ "x-real-ip": "203.0.113.7" }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toContain("203.0.113.7");
  });

  it("gives different keys to different clients", () => {
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.7" }))).not.toBe(clientKey(new Headers({ "x-real-ip": "203.0.113.8" })));
  });

  it("returns null when no address is known", () => {
    expect(clientKey(new Headers())).toBeNull();
    expect(clientKey(new Headers({ "x-forwarded-for": " " }))).toBeNull();
  });
});
