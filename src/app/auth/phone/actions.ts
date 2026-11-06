"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PHONE_PROMPT_COOKIE, PHONE_PROMPT_PATH } from "@/lib/auth/phone-prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { normalizeIndianPhone, safeNextPath } from "@/lib/validation/auth";

export interface PhoneState {
  error?: string;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UNIQUE_VIOLATION = "23505";

async function markPrompted(): Promise<void> {
  const jar = await cookies();
  jar.set(PHONE_PROMPT_COOKIE, "1", {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function nextFrom(formData: FormData): string {
  return safeNextPath(String(formData.get("next") ?? ""));
}

export async function savePhone(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const next = nextFrom(formData);
  const user = await requireUser(`${PHONE_PROMPT_PATH}?next=${encodeURIComponent(next)}`);

  const phone = normalizeIndianPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a valid 10-digit Indian mobile number, or skip this step." };

  // profiles.phone is not user-writable (RLS grants only full_name), so write it server side for this user only
  const { error } = await createAdminClient().from("profiles").update({ phone }).eq("id", user.id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "That number is already linked to another account." };
    logger.error("Saving phone failed", error, { userId: user.id });
    return { error: "Couldn't save your number. Please try again, or skip for now." };
  }

  await markPrompted();
  redirect(next);
}

export async function skipPhone(formData: FormData): Promise<void> {
  const next = nextFrom(formData);
  await requireUser(`${PHONE_PROMPT_PATH}?next=${encodeURIComponent(next)}`);
  await markPrompted();
  redirect(next);
}
