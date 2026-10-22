import { z } from "zod";
import { normalizeIndianPhone } from "@/lib/validation/auth";
import { requiredText, toFieldErrors, type FieldErrors } from "@/lib/validation/form";

// Public forms (contact, newsletter). Both carry a hidden "website" field that
// people never see; bots that fill it are dropped without an error.

export const CONTACT_TOPICS = ["sell", "buy", "order", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Readonly<Record<ContactTopic, string>> = {
  sell: "Selling a device",
  buy: "Buying from the store",
  order: "An existing order",
  other: "Something else",
};

const email = z.string().trim().toLowerCase().max(254, "Email is too long").pipe(z.email("Enter a valid email address"));

const contactSchema = z.object({
  name: requiredText(2, 80, "your name"),
  email,
  phone: z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (raw === "") return null;
      const phone = normalizeIndianPhone(raw);
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number or leave it empty" });
      return phone;
    }),
  topic: z.enum(CONTACT_TOPICS, "Choose what your message is about"),
  orderNo: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z0-9-]{4,24}$/.test(v), "Order numbers look like BV-O-000123")
    .transform((v) => (v === "" ? null : v)),
  message: z.string().trim().min(10, "Write at least 10 characters").max(2000, "Keep the message under 2000 characters"),
});

export type ContactMessage = z.infer<typeof contactSchema>;

export type ContactParseResult = { ok: true; data: ContactMessage } | { ok: false; bot: boolean; errors: FieldErrors };

const field = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

const isBot = (form: FormData): boolean => field(form, "website") !== "";

export function parseContactForm(form: FormData): ContactParseResult {
  if (isBot(form)) return { ok: false, bot: true, errors: {} };
  const parsed = contactSchema.safeParse({
    name: field(form, "name"),
    email: field(form, "email"),
    phone: field(form, "phone"),
    topic: field(form, "topic"),
    orderNo: field(form, "orderNo"),
    message: field(form, "message"),
  });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, bot: false, errors: toFieldErrors(parsed.error.issues) };
}

export type NewsletterParseResult = { ok: true; email: string } | { ok: false; bot: boolean; error?: string };

export function parseNewsletterForm(form: FormData): NewsletterParseResult {
  if (isBot(form)) return { ok: false, bot: true };
  const parsed = email.safeParse(field(form, "email"));
  return parsed.success ? { ok: true, email: parsed.data } : { ok: false, bot: false, error: "Enter a valid email address" };
}
