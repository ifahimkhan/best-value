import "server-only";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContactMessage, ContactTopic } from "./forms";

// Public form rows are written by the server only (service role) after
// validation, so the rate limits below cannot be skipped by calling the API.
// Limits are per client (hashed network address), per email and a global
// ceiling that bounds storage if many clients are used at once.

export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const CONTACT_LIMITS = { perClient: 5, perEmail: 3, global: 500 } as const;
export const NEWSLETTER_LIMITS = { perClient: 5, global: 300 } as const;

type Db = ReturnType<typeof createAdminClient>;
type FormTable = "contact_messages" | "newsletter_subscribers";

/** Rows created in the window, optionally for one column value; null when the count failed. */
async function countRecent(db: Db, table: FormTable, since: string, filter?: { column: string; value: string }): Promise<number | null> {
  let query = db.from(table).select("created_at", { count: "exact", head: true }).gte("created_at", since);
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) {
    logger.error("Form rate check failed", error, { table });
    return null;
  }
  return count ?? 0;
}

interface LimitCheck {
  table: FormTable;
  clientHash: string | null;
  now: Date;
  perClient: number;
  global: number;
  email?: { value: string; limit: number };
}

async function checkLimits(db: Db, check: LimitCheck): Promise<"ok" | "rate_limited" | "error"> {
  const since = new Date(check.now.getTime() - RATE_WINDOW_MS).toISOString();
  const [overall, byClient, byEmail] = await Promise.all([
    countRecent(db, check.table, since),
    check.clientHash ? countRecent(db, check.table, since, { column: "client_hash", value: check.clientHash }) : 0,
    check.email ? countRecent(db, check.table, since, { column: "email", value: check.email.value }) : 0,
  ]);
  if (overall === null || byClient === null || byEmail === null) return "error";
  const limited = overall >= check.global || byClient >= check.perClient || (check.email !== undefined && byEmail >= check.email.limit);
  if (limited) logger.warn("Public form rate limited", { table: check.table, overall, byClient, byEmail });
  return limited ? "rate_limited" : "ok";
}

export type SaveMessageResult = "saved" | "rate_limited" | "error";

export async function saveContactMessage(
  message: ContactMessage,
  userId: string | null,
  clientHash: string | null,
  now: Date,
): Promise<SaveMessageResult> {
  const db = createAdminClient();
  const limit = await checkLimits(db, {
    table: "contact_messages",
    clientHash,
    now,
    perClient: CONTACT_LIMITS.perClient,
    global: CONTACT_LIMITS.global,
    email: { value: message.email, limit: CONTACT_LIMITS.perEmail },
  });
  if (limit !== "ok") return limit;
  const { error } = await db.from("contact_messages").insert({
    name: message.name,
    email: message.email,
    phone: message.phone,
    topic: message.topic,
    order_no: message.orderNo,
    message: message.message,
    user_id: userId,
    client_hash: clientHash,
  });
  if (error) {
    logger.error("Failed to save contact message", error);
    return "error";
  }
  return "saved";
}

export type SubscribeResult = "subscribed" | "rate_limited" | "error";

/** Adds an email to the newsletter list. Repeats count as success so the form never reveals who subscribed. */
export async function subscribeNewsletter(email: string, clientHash: string | null, now: Date): Promise<SubscribeResult> {
  const db = createAdminClient();
  const limit = await checkLimits(db, {
    table: "newsletter_subscribers",
    clientHash,
    now,
    perClient: NEWSLETTER_LIMITS.perClient,
    global: NEWSLETTER_LIMITS.global,
  });
  if (limit !== "ok") return limit;
  const { error } = await db.from("newsletter_subscribers").insert({ email, client_hash: clientHash });
  if (!error || error.code === "23505") return "subscribed";
  logger.error("Newsletter signup failed", error);
  return "error";
}

export interface InboxMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  topic: ContactTopic;
  orderNo: string | null;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

export const INBOX_FILTERS = ["open", "handled", "all"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];
export const INBOX_LIMIT = 100;

interface MessageRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  topic: ContactTopic;
  order_no: string | null;
  message: string;
  created_at: string;
  handled_at: string | null;
}

/** Staff inbox, read through RLS with the signed-in staff session. */
export async function listContactMessages(filter: InboxFilter): Promise<InboxMessage[]> {
  const db = await createClient();
  let query = db.from("contact_messages").select("id, name, email, phone, topic, order_no, message, created_at, handled_at");
  if (filter === "open") query = query.is("handled_at", null);
  else if (filter === "handled") query = query.not("handled_at", "is", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(INBOX_LIMIT);
  if (error) {
    logger.error("Failed to list contact messages", error);
    return [];
  }
  return (data as MessageRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    topic: r.topic,
    orderNo: r.order_no,
    message: r.message,
    createdAt: r.created_at,
    handledAt: r.handled_at,
  }));
}

export async function setMessageHandled(id: number, handled: boolean, staffId: string, now: Date): Promise<boolean> {
  const db = await createClient();
  const { data, error } = await db
    .from("contact_messages")
    .update(handled ? { handled_at: now.toISOString(), handled_by: staffId } : { handled_at: null, handled_by: null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    logger.error("Failed to update contact message", error, { id });
    return false;
  }
  return true;
}
