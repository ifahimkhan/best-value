"use server";

import { headers } from "next/headers";
import { clientKey } from "@/lib/content/client-key";
import { parseNewsletterForm } from "@/lib/content/forms";
import { subscribeNewsletter } from "@/lib/content/messages";

export interface NewsletterState {
  error?: string;
  done?: boolean;
}

export async function subscribeNewsletterAction(_prev: NewsletterState, form: FormData): Promise<NewsletterState> {
  const parsed = parseNewsletterForm(form);
  if (!parsed.ok) return parsed.bot ? { done: true } : { error: parsed.error };
  const result = await subscribeNewsletter(parsed.email, clientKey(await headers()), new Date());
  if (result === "rate_limited") return { error: "Too many signups from your connection. Please try again later." };
  return result === "subscribed" ? { done: true } : { error: "Signup failed. Please try again later." };
}
