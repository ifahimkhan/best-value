"use server";

import { redirect } from "next/navigation";
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
      : await supabase.auth.signInWithOtp({ email: parsed.value, options: { shouldCreateUser: true } });

  if (error) {
    logger.error("OTP send failed", error, { kind: parsed.kind, status: error.status });
    const message = error.status === 429 ? "Too many attempts. Please wait a minute and try again." : GENERIC_ERROR;
    return { step: "identify", identifier: raw, error: message };
  }

  const where = parsed.kind === "phone" ? "your phone by SMS" : "your email";
  return { step: "verify", identifier: parsed.value, kind: parsed.kind, info: `We sent a 6-digit code to ${where}.` };
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
