import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export interface OrderEvent {
  fromStatus: string;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

const eventRows = z.array(
  z.object({
    from_status: z.string(),
    to_status: z.string(),
    note: z.string().nullable(),
    created_at: z.string(),
    actor: z.object({ full_name: z.string().nullable() }).nullable(),
  }),
);

/** Status history written by the database triggers (staff-only via RLS). */
export async function loadEvents(column: "sell_order_id" | "order_id", id: string): Promise<OrderEvent[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("order_events")
    .select("from_status, to_status, note, created_at, actor:profiles(full_name)")
    .eq(column, id)
    .order("created_at");
  if (error) {
    logger.error("loadEvents failed", error, { column });
    return [];
  }
  return (eventRows.safeParse(data).data ?? []).map((e) => ({
    fromStatus: e.from_status,
    toStatus: e.to_status,
    note: e.note,
    actorName: e.actor?.full_name ?? null,
    createdAt: e.created_at,
  }));
}

export interface StaffMember {
  id: string;
  name: string;
}

export async function listStaff(): Promise<StaffMember[]> {
  const db = await createClient();
  const { data, error } = await db.from("profiles").select("id, full_name, role").in("role", ["staff", "admin"]).order("full_name");
  if (error) {
    logger.error("listStaff failed", error);
    return [];
  }
  const rows = z.array(z.object({ id: z.string(), full_name: z.string().nullable() })).safeParse(data).data ?? [];
  return rows.map((r) => ({ id: r.id, name: r.full_name || "Unnamed staff member" }));
}
