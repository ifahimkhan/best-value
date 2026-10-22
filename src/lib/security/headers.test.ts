import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "./headers";

const SUPABASE = "https://abc.supabase.co";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values] as [string, string[]];
      }),
  );
}

describe("buildCsp", () => {
  const prod = directives(buildCsp({ isDev: false, supabaseUrl: SUPABASE }));

  it("locks down defaults, framing, plugins and base URI", () => {
    expect(prod.get("default-src")).toEqual(["'self'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
  });

  it("allows Razorpay checkout and never eval in production", () => {
    expect(prod.get("script-src")).toContain("https://checkout.razorpay.com");
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(prod.get("frame-src")).toEqual(["https://api.razorpay.com", "https://checkout.razorpay.com"]);
    expect(prod.get("connect-src")).toEqual(expect.arrayContaining(["'self'", "https://*.razorpay.com"]));
  });

  it("allows our own Supabase origin for images and API calls only", () => {
    expect(prod.get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", SUPABASE]));
    expect(prod.get("connect-src")).toEqual(expect.arrayContaining([SUPABASE, "wss://abc.supabase.co"]));
    expect([...prod.values()].flat()).not.toContain("https://*.supabase.co");
  });

  it("adds eval only in development, which React needs for error overlays", () => {
    const dev = directives(buildCsp({ isDev: true, supabaseUrl: SUPABASE }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });

  it("drops the Supabase origin when the URL is missing or invalid", () => {
    for (const supabaseUrl of [undefined, "not a url", "javascript:alert(1)"]) {
      const csp = buildCsp({ isDev: false, supabaseUrl });
      expect(csp).not.toMatch(/supabase|javascript/);
      expect(directives(csp).get("img-src")).toEqual(["'self'", "data:", "blob:", "https://*.razorpay.com"]);
    }
  });

  it("is a single header line", () => {
    expect(buildCsp({ isDev: false, supabaseUrl: SUPABASE })).not.toMatch(/\n/);
  });
});

describe("securityHeaders", () => {
  const headers = new Map(securityHeaders({ isDev: false, supabaseUrl: SUPABASE }).map((h) => [h.key, h.value]));

  it("sets the standard hardening headers", () => {
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("skips HSTS in development so localhost is not pinned to https", () => {
    const dev = securityHeaders({ isDev: true, supabaseUrl: SUPABASE }).map((h) => h.key);
    expect(dev).not.toContain("Strict-Transport-Security");
  });
});
