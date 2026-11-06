"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { phonePromptUrl } from "@/lib/auth/phone-prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { normalizeIndianPhone, safeNextPath } from "@/lib/validation/auth";

export interface PhoneState {
  error?: string;
}

const UNIQUE_VIOLATION = "23505";

export async function savePhone(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const user = await requireUser(phonePromptUrl(next));

  const phone = normalizeIndianPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a valid 10-digit Indian mobile number." };

  // profiles.phone is not user-writable (RLS grants only full_name), so write it server side for this user only
  const { error } = await createAdminClient().from("profiles").update({ phone }).eq("id", user.id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "That number is already linked to another account." };
    logger.error("Saving phone failed", error, { userId: user.id });
    return { error: "Couldn't save your number. Please try again." };
  }

  redirect(next);
}
