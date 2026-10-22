import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ORDER_NO_PATTERN } from "@/lib/sell/queries";
import { parseSellOrderRow, parseSellOrderRows, type SellOrderDetail, type SellOrderSummary, type SellStatus } from "@/lib/sell/schemas";
import { createClient } from "@/lib/supabase/server";
import { loadEvents, type OrderEvent } from "./events";
import type { SellUpdate } from "./transitions";

// Staff views of buyback orders. Callers must run requireStaff(); RLS lets
// staff read every order and the staff-only tables, and the database
// triggers decide which updates are allowed.

export const SELL_FILTERS = ["open", "quoted", "pickup_assigned", "picked_up", "inspected", "paid", "cancelled", "all"] as const;
export type SellFilter = (typeof SELL_FILTERS)[number];
const OPEN: SellStatus[] = ["quoted", "pickup_assigned", "picked_up", "inspected"];
const LIST_LIMIT = 100;

const SUMMARY_SELECT =
  "order_no, status, quoted_price, final_price, pickup_date, pickup_slot, created_at, pickup_address, variant:device_variants(label, device:devices(name, brand:brands(name)))";
const DETAIL_SELECT = `id, ${SUMMARY_SELECT}, payout_method, payout_details, answers, payout_ref, paid_at, cancel_reason, updated_at, bank:sell_order_bank_accounts(account_number), internal:sell_order_internal(assigned_to, staff_notes)`;

export interface AdminSellRow extends SellOrderSummary {
  city: string;
}

export async function listSellOrders(filter: SellFilter): Promise<AdminSellRow[]> {
  const db = await createClient();
  let query = db.from("sell_orders").select(SUMMARY_SELECT);
  if (filter === "open") query = query.in("status", OPEN);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query.order("pickup_date", { ascending: filter === "open" }).limit(LIST_LIMIT);
  if (error) {
    logger.error("listSellOrders failed", error);
    return [];
  }
  const summaries = parseSellOrderRows(data);
  const cities = new Map(
    (data ?? []).map((row) => [row.order_no as string, z.object({ city: z.string() }).safeParse(row.pickup_address).data?.city ?? ""]),
  );
  return summaries.map((s) => ({ ...s, city: cities.get(s.orderNo) ?? "" }));
}

const extraSchema = z.object({
  id: z.string(),
  answers: z.array(z.object({ question_id: z.number(), option_ids: z.array(z.number()) })).catch([]),
  payout_ref: z.string().nullable(),
  paid_at: z.string().nullable(),
  cancel_reason: z.string().nullable(),
  updated_at: z.string(),
  bank: z.object({ account_number: z.string() }).nullable(),
  internal: z.object({ assigned_to: z.string().nullable(), staff_notes: z.string().nullable() }).nullable(),
});

export interface AnswerLine {
  question: string;
  options: string[];
}

export interface AdminSellOrder extends SellOrderDetail {
  id: string;
  answers: AnswerLine[];
  payoutRef: string | null;
  paidAt: string | null;
  cancelReason: string | null;
  bankAccountNumber: string | null;
  assignedTo: string | null;
  staffNotes: string | null;
  events: OrderEvent[];
}

async function describeAnswers(raw: z.infer<typeof extraSchema>["answers"]): Promise<AnswerLine[]> {
  const chosen = raw.filter((a) => a.option_ids.length > 0);
  if (chosen.length === 0) return [];
  const db = await createClient();
  const [questions, options] = await Promise.all([
    db.from("evaluation_questions").select("id, title").in("id", chosen.map((a) => a.question_id)),
    db.from("evaluation_options").select("id, label").in("id", chosen.flatMap((a) => a.option_ids)),
  ]);
  const names = z.array(z.object({ id: z.number(), title: z.string() })).catch([]).parse(questions.data);
  const labels = z.array(z.object({ id: z.number(), label: z.string() })).catch([]).parse(options.data);
  const title = new Map(names.map((q) => [q.id, q.title]));
  const label = new Map(labels.map((o) => [o.id, o.label]));
  return chosen.map((a) => ({
    question: title.get(a.question_id) ?? `Question ${a.question_id}`,
    options: a.option_ids.map((id) => label.get(id) ?? `Option ${id}`),
  }));
}

export async function getSellOrder(orderNo: string): Promise<AdminSellOrder | null> {
  if (!ORDER_NO_PATTERN.test(orderNo)) return null;
  const db = await createClient();
  const { data, error } = await db.from("sell_orders").select(DETAIL_SELECT).eq("order_no", orderNo).maybeSingle();
  if (error) {
    logger.error("getSellOrder failed", error, { orderNo });
    return null;
  }
  const base = parseSellOrderRow(data);
  const extra = extraSchema.safeParse(data);
  if (!base || !extra.success) return null;
  const e = extra.data;
  const [answers, events] = await Promise.all([describeAnswers(e.answers), loadEvents("sell_order_id", e.id)]);
  return {
    ...base,
    id: e.id,
    answers,
    payoutRef: e.payout_ref,
    paidAt: e.paid_at,
    cancelReason: e.cancel_reason,
    bankAccountNumber: e.bank?.account_number ?? null,
    assignedTo: e.internal?.assigned_to ?? null,
    staffNotes: e.internal?.staff_notes ?? null,
    events,
  };
}

export type UpdateResult = { ok: true } | { ok: false; message: string | undefined };

/** Only rows still in `expected` status are touched, so two staff clicking at once cannot both apply. */
export async function updateSellOrder(id: string, expected: SellStatus, update: SellUpdate): Promise<UpdateResult> {
  const db = await createClient();
  const { data, error } = await db.from("sell_orders").update(update).eq("id", id).eq("status", expected).select("id").maybeSingle();
  if (error) {
    logger.error("updateSellOrder failed", error, { id });
    return { ok: false, message: error.message };
  }
  return data ? { ok: true } : { ok: false, message: "stale" };
}

export async function saveSellInternal(id: string, internal: { staff_notes: string | null; assigned_to: string | null }): Promise<boolean> {
  const db = await createClient();
  const { error } = await db.from("sell_order_internal").upsert({ sell_order_id: id, ...internal });
  if (error) logger.error("saveSellInternal failed", error, { id });
  return !error;
}
