// Response security headers, applied to every route from next.config.ts.
//
// The CSP is static (no nonce): cacheComponents prerenders static shells, and
// Next.js only injects nonces into dynamically rendered pages. Inline scripts
// therefore need 'unsafe-inline'; the policy still pins every other source to
// our own origin, our Supabase project and Razorpay checkout.
//
// This file is imported by next.config.ts, so it must not use "server-only"
// or the "@/" path alias.

export interface SecurityHeaderOptions {
  isDev: boolean;
  supabaseUrl: string | undefined;
}

export interface Header {
  key: string;
  value: string;
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY_FRAMES = ["https://api.razorpay.com", "https://checkout.razorpay.com"];
const RAZORPAY_ANY = "https://*.razorpay.com";

function supabaseOrigins(url: string | undefined): { http: string; ws: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { http: parsed.origin, ws: `${parsed.protocol === "https:" ? "wss" : "ws"}://${parsed.host}` };
  } catch {
    return null;
  }
}

export function buildCsp({ isDev, supabaseUrl }: SecurityHeaderOptions): string {
  const supabase = supabaseOrigins(supabaseUrl);
  const supabaseHttp = supabase ? [supabase.http] : [];
  const supabaseWs = supabase ? [supabase.ws] : [];

  const directives: readonly (readonly string[])[] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), RAZORPAY_SCRIPT],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", ...supabaseHttp, RAZORPAY_ANY],
    ["font-src", "'self'", "data:"],
    ["connect-src", "'self'", ...supabaseHttp, ...supabaseWs, RAZORPAY_ANY],
    ["frame-src", ...RAZORPAY_FRAMES],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ...(isDev ? [] : [["upgrade-insecure-requests"]]),
  ];
  return directives.map((parts) => parts.join(" ")).join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Header[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Razorpay opens bank and UPI pages in popups that must keep working
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ...(options.isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
