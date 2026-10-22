import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in the browser bundle.
export function publicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment variables: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function serverEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment variables: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

// Optional store settings. Online payment stays switched off until all three
// Razorpay values are set; invoices omit seller details that are not set.
const storeSchema = z.object({
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  SELLER_LEGAL_NAME: z.string().min(1).optional(),
  SELLER_GSTIN: z.string().min(1).optional(),
  SELLER_ADDRESS: z.string().min(1).optional(),
  SELLER_STATE: z.string().min(1).optional(),
});

export type StoreEnv = z.infer<typeof storeSchema>;

const emptyToUndefined = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

export function storeEnv(): StoreEnv {
  const parsed = storeSchema.safeParse({
    RAZORPAY_KEY_ID: emptyToUndefined(process.env.RAZORPAY_KEY_ID),
    RAZORPAY_KEY_SECRET: emptyToUndefined(process.env.RAZORPAY_KEY_SECRET),
    RAZORPAY_WEBHOOK_SECRET: emptyToUndefined(process.env.RAZORPAY_WEBHOOK_SECRET),
    SELLER_LEGAL_NAME: emptyToUndefined(process.env.SELLER_LEGAL_NAME),
    SELLER_GSTIN: emptyToUndefined(process.env.SELLER_GSTIN),
    SELLER_ADDRESS: emptyToUndefined(process.env.SELLER_ADDRESS),
    SELLER_STATE: emptyToUndefined(process.env.SELLER_STATE),
  });
  if (!parsed.success) {
    throw new Error(`Invalid store environment variables: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

// Optional company contact details for the contact and legal pages. Indian
// e-commerce rules expect a named grievance officer; the pages show a
// placeholder until these are set.
const companySchema = z.object({
  SUPPORT_PHONE: z.string().regex(/^\+?[0-9 -]{8,16}$/).optional(),
  GRIEVANCE_OFFICER_NAME: z.string().min(2).max(80).optional(),
  GRIEVANCE_OFFICER_EMAIL: z.email().optional(),
});

export type CompanyEnv = z.infer<typeof companySchema>;

export function companyEnv(): CompanyEnv {
  const parsed = companySchema.safeParse({
    SUPPORT_PHONE: emptyToUndefined(process.env.SUPPORT_PHONE),
    GRIEVANCE_OFFICER_NAME: emptyToUndefined(process.env.GRIEVANCE_OFFICER_NAME),
    GRIEVANCE_OFFICER_EMAIL: emptyToUndefined(process.env.GRIEVANCE_OFFICER_EMAIL),
  });
  if (!parsed.success) {
    throw new Error(`Invalid company environment variables: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

// Shared secret Vercel Cron sends as "Authorization: Bearer <CRON_SECRET>".
// When unset, the scheduled feed import endpoint refuses every request.
const cronSchema = z.object({ CRON_SECRET: z.string().min(16).optional() });

export function cronEnv(): z.infer<typeof cronSchema> {
  const parsed = cronSchema.safeParse({ CRON_SECRET: emptyToUndefined(process.env.CRON_SECRET) });
  if (!parsed.success) {
    throw new Error(`Invalid cron environment variables: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}
