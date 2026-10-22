import { z } from "zod";
import { normalizeIndianPhone } from "./auth";

// Shared form building blocks: Indian postal address and error mapping.

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const requiredText = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `Enter ${label}`).max(max, `${label} is too long`);

export const indianPhone = z.string().transform((raw, ctx) => {
  const phone = normalizeIndianPhone(raw);
  if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
  return phone ?? "";
});

/** Spread into a z.object() alongside other form fields. */
export const addressShape = {
  fullName: requiredText(2, 80, "your name"),
  phone: indianPhone,
  line1: requiredText(3, 120, "your house and street"),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: requiredText(2, 60, "your city"),
  state: requiredText(2, 60, "your state"),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
};

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export function toAddress(data: Address): Address {
  return {
    fullName: data.fullName,
    phone: data.phone,
    line1: data.line1,
    line2: data.line2,
    landmark: data.landmark,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
  };
}

export type FieldErrors = Partial<Record<string, string>>;

/** First message per top-level field wins. */
export function toFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  return issues.reduce<FieldErrors>((acc, issue) => {
    const key = String(issue.path[0] ?? "form");
    return acc[key] ? acc : { ...acc, [key]: issue.message };
  }, {});
}
