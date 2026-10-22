import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCTS_TAG } from "@/lib/store/queries";
import { IMAGE_BUCKET, IMAGE_TYPES, MAX_IMAGE_BYTES, toHostedImages, transferImages, type ImageNeed, type ImageStore } from "./images";
import { finishRun, loadRefs, loadSupplierProducts, startRun, type RunTotals, type StoredProduct } from "./import-db";
import { applyMapping, FIELD_KEYS, rawSku, type FeedItem, type FeedMapping, type FieldKey } from "./mapping";
import type { FeedTable } from "./parse";
import { planImport, type ImportPlan, type ProductInsert, type ProductUpdate } from "./plan";
import { runPool } from "./pool";
import { safeFetch, SafeFetchError } from "./safe-fetch";
import type { ImportRunError, Supplier } from "./suppliers";

const BATCH = 500;
const UPDATE_CONCURRENCY = 8;
const MAX_STORED_ERRORS = 200;
// Above this share of bad rows the feed is probably broken, so don't zero "missing" stock
const MAX_FAILED_SHARE_FOR_ZEROING = 0.2;

export type ImportOutcome = { ok: true; runId: number; totals: RunTotals } | { ok: false; error: string };

export interface ImportRequest {
  /** Staff client (RLS) for manual runs, service-role client for cron. */
  db: SupabaseClient;
  supplier: Supplier;
  table: FeedTable;
  startedBy: string | null;
}

interface Progress {
  created: number;
  updated: number;
}

const runError = (sku: string | null, message: string, row: number | null = null, field: string | null = null): ImportRunError => ({
  row,
  sku,
  field,
  message,
});

function adminImageStore(): ImageStore {
  const bucket = createAdminClient().storage.from(IMAGE_BUCKET);
  return {
    publicUrl: (path) => bucket.getPublicUrl(path).data.publicUrl,
    exists: async (path) => {
      // Resolves false on 400/404 and throws on any other failure
      const { data } = await bucket.exists(path);
      return data === true;
    },
    upload: async (path, body, contentType) => {
      const { error } = await bucket.upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
      if (error && !/exists|duplicate/i.test(error.message)) throw new Error("Image upload failed");
    },
  };
}

async function downloadImage(url: string): Promise<{ body: Buffer; contentType: string }> {
  const file = await safeFetch(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15_000, acceptTypes: IMAGE_TYPES });
  return { body: file.body, contentType: file.contentType.split(";")[0].trim() };
}

// Raw network errors (e.g. "getaddrinfo ENOTFOUND host") would hand staff a network probe
const describeImageError = (error: unknown): string =>
  error instanceof SafeFetchError ? error.message : error instanceof Error && error.message === "Image upload failed" ? error.message : "The image could not be downloaded";

interface MappedRows {
  items: { row: number; item: FeedItem }[];
  errors: ImportRunError[];
  failedSkus: Set<string>;
}

/** Item numbers count data rows from 1, so they work for CSV, Excel, JSON and XML alike. */
function mapRows(table: FeedTable, mapping: FeedMapping): MappedRows {
  const items: MappedRows["items"] = [];
  const errors: ImportRunError[] = [];
  const failedSkus = new Set<string>();
  table.rows.forEach((raw, index) => {
    const result = applyMapping(raw, mapping);
    if (result.ok) {
      items.push({ row: index + 1, item: result.item });
      return;
    }
    const sku = rawSku(raw, mapping);
    if (sku) failedSkus.add(sku);
    result.errors.forEach((e) => errors.push(runError(sku, e.message, index + 1, e.field)));
  });
  return { items, errors, failedSkus };
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
}

async function writeInserts(db: SupabaseClient, inserts: readonly ProductInsert[], progress: Progress): Promise<ImportRunError[]> {
  const errors: ImportRunError[] = [];
  for (const batch of chunk(inserts, BATCH)) {
    const { error } = await db.from("products").insert(batch);
    if (!error) {
      progress.created += batch.length;
      continue;
    }
    // One bad row fails the whole batch, so retry row by row to isolate it
    for (const row of batch) {
      const { error: rowError } = await db.from("products").insert(row);
      if (!rowError) progress.created += 1;
      else errors.push(runError(row.supplier_sku, `Could not create product (${rowError.code ?? "error"})`));
    }
  }
  return errors;
}

/** Writes only the changed columns, so stock sold or staff edits made during the run are not reverted. */
async function writeUpdates(db: SupabaseClient, supplierId: number, updates: readonly ProductUpdate[], skuById: ReadonlyMap<string, string>): Promise<{ done: number; errors: ImportRunError[] }> {
  const results = await runPool(
    updates.map(({ id, changes }) => async () => {
      const { error } = await db.from("products").update(changes).eq("id", id).eq("supplier_id", supplierId);
      return error ? runError(skuById.get(id) ?? null, `Could not update product (${error.code ?? "error"})`) : null;
    }),
    UPDATE_CONCURRENCY,
  );
  const errors = results.filter((e): e is ImportRunError => e !== null);
  return { done: results.length - errors.length, errors };
}

/** Copies images for products that will actually take them, then drops any that failed to copy. */
async function attachImages(plan: ImportPlan, byId: ReadonlyMap<string, StoredProduct>, hosted: ReturnType<typeof toHostedImages>): Promise<{ plan: ImportPlan; errors: ImportRunError[] }> {
  const needs: ImageNeed[] = [
    ...plan.inserts.flatMap((p) => p.images.map((publicUrl) => ({ sku: p.supplier_sku, publicUrl }))),
    ...plan.updates.flatMap(({ id, changes }) => {
      const product = byId.get(id);
      const current = new Set(product?.images ?? []);
      return (changes.images ?? []).filter((url) => !current.has(url)).map((publicUrl) => ({ sku: product?.supplierSku ?? "", publicUrl }));
    }),
  ];
  const result = await transferImages(needs, hosted.sources, { store: adminImageStore(), download: downloadImage, describeError: describeImageError });
  const keep = (urls: readonly string[], current: readonly string[] = []): string[] => urls.filter((url) => result.ready.has(url) || current.includes(url));
  const updates = plan.updates.flatMap(({ id, changes }) => {
    if (!changes.images) return [{ id, changes }];
    const current = byId.get(id)?.images ?? [];
    const images = keep(changes.images, current);
    const rest = Object.fromEntries(Object.entries(changes).filter(([key]) => key !== "images"));
    const next = images.length === current.length && images.every((url, i) => url === current[i]) ? rest : { ...rest, images };
    return Object.keys(next).length > 0 ? [{ id, changes: next }] : [];
  });
  const errors = result.failures.map((f) => runError(f.sku || null, `Image skipped: ${f.message}`, null, "images"));
  return { plan: { ...plan, inserts: plan.inserts.map((p) => ({ ...p, images: keep(p.images) })), updates }, errors };
}

function mappedFields(mapping: FeedMapping): Set<FieldKey> {
  return new Set(FIELD_KEYS.filter((key) => Boolean(mapping.fields[key])));
}

function missingPolicy(supplier: Supplier, mapped: MappedRows, total: number): { policy: "keep" | "zero_stock"; notice: ImportRunError | null } {
  if (supplier.mapping.options.missing !== "zero_stock") return { policy: "keep", notice: null };
  const failedShare = total === 0 ? 1 : (total - mapped.items.length) / total;
  if (mapped.items.length > 0 && failedShare <= MAX_FAILED_SHARE_FOR_ZEROING) return { policy: "zero_stock", notice: null };
  return { policy: "keep", notice: runError(null, "Too many rows failed, so stock of products missing from the feed was left unchanged.") };
}

async function executeRun(req: ImportRequest, progress: Progress): Promise<RunTotals> {
  const { db, supplier, table } = req;
  const mapped = mapRows(table, supplier.mapping);
  const missing = missingPolicy(supplier, mapped, table.rows.length);
  const [existing, refs] = await Promise.all([loadSupplierProducts(db, supplier.id), loadRefs(db)]);
  const byId = new Map(existing.map((p) => [p.id, p]));
  const hosted = toHostedImages(mapped.items.map(({ item }) => item), supplier.id, adminImageStore());
  const draft = planImport({
    supplierId: supplier.id,
    items: mapped.items.map(({ row }, i) => ({ row, item: hosted.items[i] })),
    existing,
    ...refs,
    missingPolicy: missing.policy,
    mappedFields: mappedFields(supplier.mapping),
    failedSkus: mapped.failedSkus,
  });
  const { plan, errors: imageErrors } = await attachImages(draft, byId, hosted);
  const insertErrors = await writeInserts(db, plan.inserts, progress);
  const skuById = new Map(existing.map((p) => [p.id, p.supplierSku]));
  const updated = await writeUpdates(db, supplier.id, plan.updates, skuById);
  progress.updated += updated.done;
  const zeroed = await writeUpdates(db, supplier.id, plan.zeroed, skuById);

  const unchanged = plan.unchanged + (draft.updates.length - plan.updates.length);
  const rowsFailed = table.rows.length - mapped.items.length + plan.errors.length + insertErrors.length + updated.errors.length;
  const planErrors = plan.errors.map((e) => runError(e.sku, e.message, e.row));
  const errors = [...(missing.notice ? [missing.notice] : []), ...mapped.errors, ...planErrors, ...insertErrors, ...updated.errors, ...zeroed.errors, ...imageErrors];
  const okRows = progress.created + progress.updated + unchanged;
  return {
    status: rowsFailed === 0 && zeroed.errors.length === 0 ? "succeeded" : okRows > 0 ? "partial" : "failed",
    rowsTotal: table.rows.length,
    rowsCreated: progress.created,
    rowsUpdated: progress.updated,
    rowsFailed,
    errors: errors.slice(0, MAX_STORED_ERRORS),
  };
}

/** Runs one supplier import end to end and records it in import_runs. */
export async function runImport(req: ImportRequest): Promise<ImportOutcome> {
  const started = await startRun(req.db, req.supplier.id, req.startedBy);
  if (!started.ok) return started;
  const progress: Progress = { created: 0, updated: 0 };
  let totals: RunTotals;
  try {
    totals = await executeRun(req, progress);
  } catch (error) {
    logger.error("feed import failed", error, { supplierId: req.supplier.id, runId: started.runId });
    totals = {
      status: "failed",
      rowsTotal: req.table.rows.length,
      rowsCreated: progress.created,
      rowsUpdated: progress.updated,
      rowsFailed: Math.max(0, req.table.rows.length - progress.created - progress.updated),
      errors: [runError(null, "The import stopped because of a server error. Some products may already be saved.")],
    };
  }
  try {
    await finishRun(req.db, started.runId, req.supplier.id, totals);
  } catch (error) {
    logger.error("feed import could not be recorded", error, { runId: started.runId });
  } finally {
    revalidateTag(PRODUCTS_TAG, "max");
  }
  return { ok: true, runId: started.runId, totals };
}

/** Records a run that failed before any rows could be read, e.g. the feed download failed. */
export async function recordFailedRun(db: SupabaseClient, supplierId: number, message: string, startedBy: string | null): Promise<void> {
  const started = await startRun(db, supplierId, startedBy);
  if (!started.ok) return;
  await finishRun(db, started.runId, supplierId, {
    status: "failed",
    rowsTotal: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    errors: [runError(null, message)],
  });
}
