import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { safeNextPath } from "@/lib/validation/auth";
import { googleFullName } from "@/lib/auth/google-profile";
import { phonePromptUrl } from "@/lib/auth/phone-prompt";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Fills the profile name from Google, only when it is still empty. Never blocks login. */
async function syncGoogleName(supabase: Supabase, user: User): Promise<void> {
  const fullName = googleFullName(user.user_metadata);
  if (!fullName) return;
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id).is("full_name", null);
  if (error) logger.warn("Could not save Google name", { code: error.code });
}

async function hasPhone(supabase: Supabase, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("phone").eq("id", userId).single();
  if (error) {
    logger.warn("Profile phone lookup failed", { code: error.code });
    return true; // don't trap the user in a prompt we can't verify
  }
  return Boolean(data?.phone);
}

// Landing point for the sign-in link in Supabase auth emails and for Google OAuth (PKCE flow).
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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      if (user?.app_metadata?.provider === "google") {
        await syncGoogleName(supabase, user);
        // Mobile number is required for Google users; keep asking until one is saved
        if (!(await hasPhone(supabase, user.id))) {
          return NextResponse.redirect(new URL(phonePromptUrl(next), origin));
        }
      }
      return NextResponse.redirect(new URL(next, origin));
    }
    logger.warn("Email link sign-in failed", { status: error.status, code: error.code });
  }

  // Expired/used link, or opened in a different browser than the one that requested it
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
