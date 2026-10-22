import { z } from "zod";
import { normalizeIndianPhone } from "@/lib/validation/auth";
import type { Answers } from "./pricing";
import { PICKUP_SLOTS } from "./slots";

// Validates the pickup booking form. Everything here is untrusted input;
// prices are never read from the form, only recomputed on the server.

const MAX_ANSWERS_JSON = 4000;
const MAX_QUESTIONS = 100;

const answersSchema = z
  .array(
    z.object({
      questionId: z.number().int().positive(),
      optionIds: z.array(z.number().int().positive()).max(50),
    }),
  )
  .max(MAX_QUESTIONS);

export function parseAnswers(raw: string): Answers | null {
  if (raw.length > MAX_ANSWERS_JSON) return null;
  try {
    const parsed = answersSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return Object.fromEntries(parsed.data.map((a) => [a.questionId, a.optionIds]));
  } catch {
    return null;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const requiredText = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `Enter ${label}`).max(max, `${label} is too long`);

const payoutSchema = z.discriminatedUnion("payoutMethod", [
  z.object({
    payoutMethod: z.literal("upi"),
    upiId: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a valid UPI ID, like name@bank"),
  }),
  z.object({
    payoutMethod: z.literal("bank"),
    accountName: requiredText(2, 80, "the account holder name"),
    accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a 9 to 18 digit account number"),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code"),
  }),
  z.object({ payoutMethod: z.literal("cash") }),
]);

const bookingSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  // The price the customer saw; the server rejects the booking if it changed
  expectedPrice: z.coerce.number().int().nonnegative(),
  answers: z.string().transform((raw, ctx) => {
    const answers = parseAnswers(raw);
    if (!answers) ctx.addIssue({ code: "custom", message: "Your answers could not be read. Please start again." });
    return answers ?? {};
  }),
  fullName: requiredText(2, 80, "your name"),
  phone: z.string().transform((raw, ctx) => {
    const phone = normalizeIndianPhone(raw);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
    return phone ?? "";
  }),
  line1: requiredText(3, 120, "your house and street"),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: requiredText(2, 60, "your city"),
  state: requiredText(2, 60, "your state"),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a pickup date"),
  pickupSlot: z.enum(PICKUP_SLOTS, "Choose a time slot"),
});

export type Payout =
  | { method: "upi"; upiId: string }
  | { method: "bank"; accountName: string; accountNumber: string; ifsc: string }
  | { method: "cash" };

/** Payout as stored on the customer-readable order: never the full account number. */
export type PayoutSummary =
  | { method: "upi"; upiId: string }
  | { method: "bank"; accountName: string; accountLast4: string; ifsc: string }
  | { method: "cash" };

export interface PickupAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface Booking {
  variantId: number;
  expectedPrice: number;
  answers: Answers;
  address: PickupAddress;
  pickupDate: string;
  pickupSlot: (typeof PICKUP_SLOTS)[number];
  payout: Payout;
}

export type FieldErrors = Partial<Record<string, string>>;

export type BookingParseResult = { success: true; data: Booking } | { success: false; fieldErrors: FieldErrors };

function toFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  // First message per field wins
  return issues.reduce<FieldErrors>((acc, issue) => {
    const key = String(issue.path[0] ?? "form");
    return acc[key] ? acc : { ...acc, [key]: issue.message };
  }, {});
}

function toPayout(p: z.infer<typeof payoutSchema>): Payout {
  if (p.payoutMethod === "upi") return { method: "upi", upiId: p.upiId };
  if (p.payoutMethod === "bank")
    return { method: "bank", accountName: p.accountName, accountNumber: p.accountNumber, ifsc: p.ifsc };
  return { method: "cash" };
}

export function parseBookingForm(input: Record<string, unknown>): BookingParseResult {
  const booking = bookingSchema.safeParse(input);
  const payout = payoutSchema.safeParse(input);
  if (!booking.success || !payout.success) {
    return {
      success: false,
      fieldErrors: toFieldErrors([...(booking.error?.issues ?? []), ...(payout.error?.issues ?? [])]),
    };
  }

  const b = booking.data;
  return {
    success: true,
    data: {
      variantId: b.variantId,
      expectedPrice: b.expectedPrice,
      answers: b.answers,
      address: {
        fullName: b.fullName,
        phone: b.phone,
        line1: b.line1,
        line2: b.line2,
        landmark: b.landmark,
        city: b.city,
        state: b.state,
        pincode: b.pincode,
      },
      pickupDate: b.pickupDate,
      pickupSlot: b.pickupSlot,
      payout: toPayout(payout.data),
    },
  };
}

/** Safe-to-display summary of payout details. */
export function maskPayout(payout: PayoutSummary | null): string {
  if (!payout) return "Not set";
  if (payout.method === "cash") return "Cash at pickup";
  if (payout.method === "upi") {
    const [name, handle] = payout.upiId.split("@");
    return `UPI: ${name.slice(0, 2)}•••@${handle}`;
  }
  return `Bank: ••••${payout.accountLast4} (${payout.ifsc})`;
}
