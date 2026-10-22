import { afterEach, describe, expect, it, vi } from "vitest";

// next.config.ts reads the environment when it is loaded, so each case
// re-imports it under its own stubbed NODE_ENV.
async function loadConfig(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  const config = (await import("../../../next.config")).default;
  const rules = (await config.headers?.()) ?? [];
  return { config, rules, headers: new Map(rules.flatMap((rule) => rule.headers.map((h) => [h.key, h.value]))) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config security wiring", () => {
  it("applies the production headers to every path and hides the framework", async () => {
    const { config, rules, headers } = await loadConfig("production");
    expect(config.poweredByHeader).toBe(false);
    expect(rules.map((rule) => rule.source)).toEqual(["/:path*"]);
    expect(headers.get("Strict-Transport-Security")).toBeDefined();
    expect(headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
    expect(headers.get("Content-Security-Policy")).toContain("https://abc.supabase.co");
  });

  it("uses the development policy only under next dev", async () => {
    const { headers } = await loadConfig("development");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
  });
});
