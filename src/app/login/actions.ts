"use server";

import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { otpSchema, parseLoginIdentifier, safeNextPath } from "@/lib/validation/auth";

export interface LoginState {
  step: "identify" | "verify";
  identifier: string;
  kind?: "phone" | "email";
  error?: string;
  info?: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again in a minute.";

function sendErrorMessage(status: number | undefined, code: string | undefined): string {
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_sms_send_rate_limit") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (code === "phone_provider_disabled" || code === "sms_send_failed") {
    return "Login by mobile number isn't available yet. Please use your email instead.";
  }
  return GENERIC_ERROR;
}

function emailCallbackUrl(next: FormDataEntryValue | null): string {
  const url = new URL("/auth/callback", publicEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", safeNextPath(typeof next === "string" ? next : null));
  return url.toString();
}

export async function sendOtp(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("identifier") ?? "");
  const parsed = parseLoginIdentifier(raw);
  if (!parsed) {
    return { step: "identify", identifier: raw, error: "Enter a valid 10-digit mobile number or email." };
  }

  const supabase = await createClient();
  const { error } =
    parsed.kind === "phone"
      ? await supabase.auth.signInWithOtp({ phone: parsed.value })
      : await supabase.auth.signInWithOtp({
          email: parsed.value,
          // Default Supabase email templates send a link, custom ones send a code: support both
          options: { shouldCreateUser: true, emailRedirectTo: emailCallbackUrl(formData.get("next")) },
        });

  if (error) {
    logger.error("OTP send failed", error, { kind: parsed.kind, status: error.status, code: error.code });
    return { step: "identify", identifier: raw, error: sendErrorMessage(error.status, error.code) };
  }

  const info =
    parsed.kind === "phone"
      ? "We sent a 6-digit code to your phone by SMS."
      : "Check your email (and spam folder). Enter the 6-digit code, or just tap the sign-in link in the email.";
  return { step: "verify", identifier: parsed.value, kind: parsed.kind, info };
}

export async function verifyOtp(prev: LoginState, formData: FormData): Promise<LoginState> {
  const token = otpSchema.safeParse(String(formData.get("token") ?? ""));
  if (!token.success) {
    return { ...prev, error: token.error.issues[0]?.message ?? "Enter the 6-digit code", info: undefined };
  }

  // Re-validate the identifier: never trust the hidden form field
  const parsed = parseLoginIdentifier(String(formData.get("identifier") ?? ""));
  if (!parsed) return { step: "identify", identifier: "", error: "Please start again." };

  const supabase = await createClient();
  const { error } =
    parsed.kind === "phone"
      ? await supabase.auth.verifyOtp({ phone: parsed.value, token: token.data, type: "sms" })
      : await supabase.auth.verifyOtp({ email: parsed.value, token: token.data, type: "email" });

  if (error) {
    logger.warn("OTP verify failed", { kind: parsed.kind, status: error.status });
    return { ...prev, error: "That code is wrong or has expired.", info: undefined };
  }

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

/** Single entry point for the two-step login form. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "");
  if (intent === "restart") return { step: "identify", identifier: "" };
  if (intent === "verify" && prev.step === "verify") return verifyOtp(prev, formData);
  return sendOtp(prev, formData);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logger.error("Sign out failed", error);
  redirect("/");
}
