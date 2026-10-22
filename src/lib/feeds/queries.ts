import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { FeedMapping } from "./mapping";
import {
  IMPORT_RUN_SELECT,
  parseImportRuns,
  parseSupplierRow,
  SUPPLIER_SELECT,
  type ImportRun,
  type Supplier,
  type SupplierInput,
} from "./suppliers";

// Supplier admin data. Callers must have run requireStaff(); RLS limits
// suppliers and import_runs to staff as a second line of defence.

const RECENT_RUNS = 10;

export async function listSuppliers(): Promise<Supplier[]> {
  const db = await createClient();
  const { data, error } = await db.from("suppliers").select(SUPPLIER_SELECT).order("name");
  if (error) {
    logger.error("listSuppliers failed", error);
    return [];
  }
  return (data ?? []).flatMap((row) => parseSupplierRow(row) ?? []);
}

export async function getSupplier(id: number, client?: SupabaseClient): Promise<Supplier | null> {
  const db = client ?? (await createClient());
  const { data, error } = await db.from("suppliers").select(SUPPLIER_SELECT).eq("id", id).maybeSingle();
  if (error) {
    logger.error("getSupplier failed", error, { id });
    return null;
  }
  return data ? parseSupplierRow(data) : null;
}

/** Active suppliers with a daily schedule, for the cron job (service-role client). */
export async function listScheduledSuppliers(db: SupabaseClient): Promise<Supplier[]> {
  const { data, error } = await db
    .from("suppliers")
    .select(SUPPLIER_SELECT)
    .eq("is_active", true)
    .eq("schedule_cron", "daily")
    .not("feed_url", "is", null);
  if (error) throw error;
  return (data ?? []).flatMap((row) => parseSupplierRow(row) ?? []);
}

export async function listRecentRuns(supplierId: number): Promise<ImportRun[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("import_runs")
    .select(IMPORT_RUN_SELECT)
    .eq("supplier_id", supplierId)
    .order("started_at", { ascending: false })
    .limit(RECENT_RUNS);
  if (error) {
    logger.error("listRecentRuns failed", error, { supplierId });
    return [];
  }
  return parseImportRuns(data);
}

export async function insertSupplier(input: SupplierInput): Promise<number | null> {
  const db = await createClient();
  const { data, error } = await db.from("suppliers").insert(input).select("id").single();
  if (error) {
    logger.error("insertSupplier failed", error);
    return null;
  }
  return typeof data?.id === "number" ? data.id : null;
}

export async function updateSupplier(id: number, input: SupplierInput): Promise<boolean> {
  const db = await createClient();
  const { error } = await db.from("suppliers").update(input).eq("id", id);
  if (error) logger.error("updateSupplier failed", error, { id });
  return !error;
}

export async function saveSupplierMapping(id: number, mapping: FeedMapping): Promise<boolean> {
  const db = await createClient();
  const { error } = await db.from("suppliers").update({ field_mapping: mapping }).eq("id", id);
  if (error) logger.error("saveSupplierMapping failed", error, { id });
  return !error;
}
