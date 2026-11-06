import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { safeNextPath } from "@/lib/validation/auth";

// Landing point for the sign-in link in Supabase auth emails (PKCE flow).
// Exchanges the one-time ?code= for a session cookie, then sends the user on.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Google (or Supabase) reports a failed/cancelled OAuth attempt as ?error=...
  if (searchParams.get("error")) {
    logger.warn("OAuth sign-in rejected", { error: searchParams.get("error_code") ?? searchParams.get("error") });
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logger.warn("Email link sign-in failed", { status: error.status, code: error.code });
  }

  // Expired/used link, or opened in a different browser than the one that requested it
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
