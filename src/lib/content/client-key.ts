import { createHash } from "node:crypto";

/**
 * Stable, non-reversible key for the visitor's network address, used only to
 * rate limit public forms. On Vercel the platform sets these headers, so the
 * first x-forwarded-for entry is the real client address.
 */
export function clientKey(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip")?.trim();
  if (!address) return null;
  return createHash("sha256").update(`bv-form-limit:${address}`).digest("hex");
}
