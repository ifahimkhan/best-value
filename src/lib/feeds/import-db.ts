import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PRODUCT_CONDITIONS } from "./mapping";
import type { ExistingProduct, NamedRef } from "./plan";
import type { ImportRunError, ImportStatus } from "./suppliers";

// Database reads and writes for one import run. The caller picks the client:
// the signed-in staff client for manual runs (RLS applies) or the service-role
// client for the cron job.

const PAGE = 1000;
const STALE_RUN_MINUTES = 30;

export const EXISTING_SELECT =
  "id, sku, slug, supplier_sku, title, price, mrp, stock, description, condition, brand_id, category_id, gst_rate, hsn_code, images, is_active, locked_fields";

const existingRow = z.object({
  id: z.string(),
  sku: z.string(),
  slug: z.string(),
  supplier_sku: z.string(),
  title: z.string(),
  price: z.coerce.number(),
  mrp: z.coerce.number().nullable(),
  stock: z.number().int(),
  description: z.string().nullable(),
  condition: z.enum(PRODUCT_CONDITIONS),
  brand_id: z.number().nullable(),
  category_id: z.number().nullable(),
  gst_rate: z.coerce.number(),
  hsn_code: z.string().nullable(),
  images: z.array(z.string()),
  is_active: z.boolean(),
  locked_fields: z.array(z.string()),
});

export interface StoredProduct extends ExistingProduct {
  sku: string;
  slug: string;
}

function toStored(row: z.infer<typeof existingRow>): StoredProduct {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    supplierSku: row.supplier_sku,
    title: row.title,
    price: row.price,
    mrp: row.mrp,
    stock: row.stock,
    description: row.description,
    condition: row.condition,
    brandId: row.brand_id,
    categoryId: row.category_id,
    gstRate: row.gst_rate,
    hsnCode: row.hsn_code,
    images: row.images,
    isActive: row.is_active,
    lockedFields: row.locked_fields,
  };
}

/** All products already imported from this supplier, paged past PostgREST's row cap. */
export async function loadSupplierProducts(db: SupabaseClient, supplierId: number): Promise<StoredProduct[]> {
  const all: StoredProduct[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("products")
      .select(EXISTING_SELECT)
      .eq("supplier_id", supplierId)
      .not("supplier_sku", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = z.array(existingRow).parse(data);
    all.push(...rows.map(toStored));
    if (rows.length < PAGE) return all;
  }
}

const refRows = z.array(z.object({ id: z.number(), name: z.string(), slug: z.string() }));

export async function loadRefs(db: SupabaseClient): Promise<{ brands: NamedRef[]; categories: NamedRef[] }> {
  const [brands, categories] = await Promise.all([
    db.from("brands").select("id, name, slug"),
    db.from("categories").select("id, name, slug"),
  ]);
  if (brands.error) throw brands.error;
  if (categories.error) throw categories.error;
  return { brands: refRows.parse(brands.data), categories: refRows.parse(categories.data) };
}

export type StartRunResult = { ok: true; runId: number } | { ok: false; error: string };

/** Opens an import_runs row; the partial unique index allows one running import per supplier. */
export async function startRun(db: SupabaseClient, supplierId: number, startedBy: string | null): Promise<StartRunResult> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  // A crashed run would otherwise block this supplier forever
  const { error: staleError } = await db
    .from("import_runs")
    .update({ status: "failed", finished_at: new Date().toISOString() })
    .eq("supplier_id", supplierId)
    .eq("status", "running")
    .lt("started_at", staleBefore);
  if (staleError) throw staleError;

  const { data, error } = await db
    .from("import_runs")
    .insert({ supplier_id: supplierId, started_by: startedBy, status: "running" })
    .select("id")
    .single();
  if (error?.code === "23505") return { ok: false, error: "An import for this supplier is already running." };
  if (error) throw error;
  return { ok: true, runId: z.object({ id: z.number() }).parse(data).id };
}

export interface RunTotals {
  status: ImportStatus;
  rowsTotal: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsFailed: number;
  errors: ImportRunError[];
}

export async function finishRun(db: SupabaseClient, runId: number, supplierId: number, totals: RunTotals): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { error } = await db
    .from("import_runs")
    .update({
      status: totals.status,
      rows_total: totals.rowsTotal,
      rows_created: totals.rowsCreated,
      rows_updated: totals.rowsUpdated,
      rows_failed: totals.rowsFailed,
      errors: totals.errors,
      finished_at: finishedAt,
    })
    .eq("id", runId);
  if (error) throw error;
  const { error: supplierError } = await db.from("suppliers").update({ last_run_at: finishedAt }).eq("id", supplierId);
  if (supplierError) throw supplierError;
}
