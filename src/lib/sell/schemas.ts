import { z } from "zod";
import type { PayoutSummary, PickupAddress } from "./booking";
import type { QuoteVariant } from "./order";
import type { EvalQuestion } from "./pricing";

// Supabase rows are external data: validate before pricing or rendering.
// numeric columns may arrive as strings, so amounts are coerced.

const amount = z.coerce.number().nonnegative();

const optionRowSchema = z.object({
  id: z.number(),
  label: z.string(),
  deduction_type: z.enum(["flat", "percent"]),
  deduction_value: amount,
  sort_order: z.number(),
});

const questionRowSchema = z.object({
  id: z.number(),
  section: z.enum(["question", "defect", "functional", "accessory", "age"]),
  input_type: z.enum(["yes_no", "single", "multi"]),
  title: z.string(),
  help_text: z.string().nullable(),
  options: z.array(optionRowSchema),
});

export function parseEvaluationRows(rows: unknown): EvalQuestion[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = questionRowSchema.safeParse(row);
    if (!parsed.success || parsed.data.options.length === 0) return [];
    const q = parsed.data;
    const options = [...q.options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ id: o.id, label: o.label, deductionType: o.deduction_type, deductionValue: o.deduction_value }));
    return [{ id: q.id, section: q.section, inputType: q.input_type, title: q.title, helpText: q.help_text, options }];
  });
}

const quoteVariantSchema = z.object({
  id: z.number(),
  base_buy_price: amount,
  device: z.object({
    category_id: z.number(),
    category: z.object({ can_sell: z.boolean(), coming_soon: z.boolean() }),
  }),
});

export function parseQuoteVariant(row: unknown): QuoteVariant | null {
  const parsed = quoteVariantSchema.safeParse(row);
  if (!parsed.success) return null;
  const { id, base_buy_price, device } = parsed.data;
  if (!device.category.can_sell || device.category.coming_soon) return null;
  return { id, price: base_buy_price, categoryId: device.category_id };
}

export type SellStatus = "quoted" | "pickup_assigned" | "picked_up" | "inspected" | "paid" | "cancelled";

const orderRowSchema = z.object({
  order_no: z.string(),
  status: z.enum(["quoted", "pickup_assigned", "picked_up", "inspected", "paid", "cancelled"]),
  quoted_price: amount,
  final_price: amount.nullable(),
  pickup_date: z.string(),
  pickup_slot: z.string(),
  created_at: z.string(),
  variant: z
    .object({
      label: z.string(),
      device: z.object({ name: z.string(), brand: z.object({ name: z.string() }) }),
    })
    .nullable(),
});

const addressSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
});

const orderDetailRowSchema = orderRowSchema.extend({
  pickup_address: addressSchema,
  payout_method: z.enum(["upi", "bank", "cash"]),
  payout_details: z.record(z.string(), z.string()).nullable(),
});

export interface SellOrderSummary {
  orderNo: string;
  status: SellStatus;
  quotedPrice: number;
  finalPrice: number | null;
  pickupDate: string;
  pickupSlot: string;
  createdAt: string;
  deviceName: string;
  variantLabel: string | null;
}

export interface SellOrderDetail extends SellOrderSummary {
  address: PickupAddress;
  payout: PayoutSummary | null;
}

function toSummary(r: z.infer<typeof orderRowSchema>): SellOrderSummary {
  return {
    orderNo: r.order_no,
    status: r.status,
    quotedPrice: r.quoted_price,
    finalPrice: r.final_price,
    pickupDate: r.pickup_date,
    pickupSlot: r.pickup_slot,
    createdAt: r.created_at,
    // RLS hides variants that were deactivated after the order was placed
    deviceName: r.variant ? `${r.variant.device.brand.name} ${r.variant.device.name}` : "Device no longer listed",
    variantLabel: r.variant?.label ?? null,
  };
}

export function parseSellOrderRows(rows: unknown): SellOrderSummary[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = orderRowSchema.safeParse(row);
    return parsed.success ? [toSummary(parsed.data)] : [];
  });
}

function toPayout(method: "upi" | "bank" | "cash", details: Record<string, string> | null): PayoutSummary | null {
  if (method === "cash") return { method: "cash" };
  if (method === "upi" && details?.upiId) return { method: "upi", upiId: details.upiId };
  if (method === "bank" && details?.accountLast4 && details.ifsc) {
    return { method: "bank", accountName: details.accountName ?? "", accountLast4: details.accountLast4, ifsc: details.ifsc };
  }
  return null;
}

export function parseSellOrderRow(row: unknown): SellOrderDetail | null {
  const parsed = orderDetailRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return { ...toSummary(r), address: r.pickup_address, payout: toPayout(r.payout_method, r.payout_details) };
}
