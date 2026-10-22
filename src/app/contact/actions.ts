"use server";

import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { clientKey } from "@/lib/content/client-key";
import { parseContactForm } from "@/lib/content/forms";
import { saveContactMessage } from "@/lib/content/messages";
import type { FieldErrors } from "@/lib/validation/form";

export interface ContactState {
  errors?: FieldErrors;
  error?: string;
  sent?: boolean;
}

export async function sendContactMessageAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  const parsed = parseContactForm(form);
  // Bots get the same reply as people so they learn nothing
  if (!parsed.ok) return parsed.bot ? { sent: true } : { errors: parsed.errors };
  const [user, requestHeaders] = await Promise.all([getSessionUser(), headers()]);
  const result = await saveContactMessage(parsed.data, user?.id ?? null, clientKey(requestHeaders), new Date());
  if (result === "rate_limited") return { error: "We have received several messages from you. Please wait a few minutes before sending another." };
  if (result === "error") return { error: "Your message could not be sent. Please try again, or email us instead." };
  return { sent: true };
}
