import { z } from "zod";

export type LoginIdentifier =
  | { kind: "phone"; value: string }
  | { kind: "email"; value: string };

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Returns an E.164 Indian mobile number (+91XXXXXXXXXX), or null if invalid. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;

  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);

  return INDIAN_MOBILE.test(local) ? `+91${local}` : null;
}

const emailSchema = z.email();

/** Works out whether the user typed a phone number or an email. */
export function parseLoginIdentifier(input: string): LoginIdentifier | null {
  const trimmed = input.trim();
  const phone = normalizeIndianPhone(trimmed);
  if (phone) return { kind: "phone", value: phone };

  const email = trimmed.toLowerCase();
  return emailSchema.safeParse(email).success ? { kind: "email", value: email } : null;
}

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

/** Only allows same-site relative paths, to prevent open redirects after login. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  // URL parsers strip tabs/newlines and treat "\" as "/", so "/\t/evil.com" could become "//evil.com"
  if (/[\x00-\x1f\x7f\\]/.test(next)) return "/";
  return next;
}
