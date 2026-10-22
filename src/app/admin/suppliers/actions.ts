"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { applyMapping, suggestMapping, type FieldKey } from "@/lib/feeds/mapping";
import type { ParseResult } from "@/lib/feeds/parse";
import { getSupplier, insertSupplier, saveSupplierMapping, updateSupplier } from "@/lib/feeds/queries";
import { runImport } from "@/lib/feeds/run-import";
import { fetchFeed, parseFeedBytes } from "@/lib/feeds/source";
import { parseMappingForm, parseSupplierForm, type Supplier } from "@/lib/feeds/suppliers";
import { createClient } from "@/lib/supabase/server";

// Every action re-checks staff access: the admin layout gate does not run for server actions.

export interface SupplierFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}

export interface PreviewState {
  error?: string;
  rowCount?: number;
  columns?: string[];
  sample?: Record<string, string>[];
  suggested?: Partial<Record<FieldKey, string>>;
  sampleErrors?: { row: number; message: string }[];
}

export interface ImportState {
  error?: string;
  summary?: string;
}

export interface MappingState {
  error?: string;
  saved?: boolean;
}

// Vercel caps request bodies at ~4.5 MB; bigger feeds must be imported from a URL
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SAMPLE_ROWS = 5;
const supplierId = z.coerce.number().int().positive();

async function loadSupplier(form: FormData): Promise<Supplier | null> {
  const id = supplierId.safeParse(form.get("supplierId"));
  return id.success ? getSupplier(id.data) : null;
}

async function readFeed(supplier: Supplier, form: FormData): Promise<ParseResult> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Uploads are limited to 4 MB. Use a feed URL for bigger files." };
    return parseFeedBytes(Buffer.from(await file.arrayBuffer()), supplier.feedFormat);
  }
  if (!supplier.feedUrl) return { ok: false, error: "Choose a file to upload." };
  return fetchFeed(supplier.feedUrl, supplier.feedFormat);
}

export async function createSupplierAction(_prev: SupplierFormState, form: FormData): Promise<SupplierFormState> {
  await requireStaff();
  const parsed = parseSupplierForm(form);
  if (!parsed.ok) return { error: "Please check the highlighted fields.", fieldErrors: parsed.errors };
  const id = await insertSupplier(parsed.data);
  if (id === null) return { error: "The supplier could not be saved. Please try again." };
  redirect(`/admin/suppliers/${id}`);
}

export async function updateSupplierAction(_prev: SupplierFormState, form: FormData): Promise<SupplierFormState> {
  await requireStaff();
  const id = supplierId.safeParse(form.get("supplierId"));
  if (!id.success) return { error: "Unknown supplier." };
  const parsed = parseSupplierForm(form);
  if (!parsed.ok) return { error: "Please check the highlighted fields.", fieldErrors: parsed.errors };
  if (!(await updateSupplier(id.data, parsed.data))) return { error: "The supplier could not be saved. Please try again." };
  revalidatePath(`/admin/suppliers/${id.data}`);
  return { saved: true };
}

export async function saveMappingAction(_prev: MappingState, form: FormData): Promise<MappingState> {
  await requireStaff();
  const id = supplierId.safeParse(form.get("supplierId"));
  if (!id.success) return { error: "Unknown supplier." };
  const parsed = parseMappingForm(form);
  if (!parsed.ok) return { error: parsed.error };
  if (!(await saveSupplierMapping(id.data, parsed.mapping))) return { error: "The mapping could not be saved. Please try again." };
  revalidatePath(`/admin/suppliers/${id.data}`);
  return { saved: true };
}

export async function previewFeedAction(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  await requireStaff();
  const supplier = await loadSupplier(form);
  if (!supplier) return { error: "Unknown supplier." };
  const result = await readFeed(supplier, form);
  if (!result.ok) return { error: result.error };
  const { columns, rows } = result.table;
  const sample = rows.slice(0, SAMPLE_ROWS);
  const hasMapping = Boolean(supplier.mapping.fields.sku);
  const sampleErrors = hasMapping
    ? sample.flatMap((row, i) => {
        const mapped = applyMapping(row, supplier.mapping);
        return mapped.ok ? [] : mapped.errors.map((e) => ({ row: i + 1, message: e.message }));
      })
    : [];
  return { rowCount: rows.length, columns, sample: sample.map((row) => ({ ...row })), suggested: suggestMapping(columns), sampleErrors };
}

export async function importFeedAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireStaff();
  const supplier = await loadSupplier(form);
  if (!supplier) return { error: "Unknown supplier." };
  if (!supplier.mapping.fields.sku || !supplier.mapping.fields.title || !supplier.mapping.fields.price) {
    return { error: "Save a column mapping with SKU, title and price before importing." };
  }
  const result = await readFeed(supplier, form);
  if (!result.ok) return { error: result.error };
  const outcome = await runImport({ db: await createClient(), supplier, table: result.table, startedBy: user.id });
  revalidatePath(`/admin/suppliers/${supplier.id}`);
  if (!outcome.ok) return { error: outcome.error };
  const { totals } = outcome;
  return {
    summary: `Import ${totals.status}: ${totals.rowsCreated} created, ${totals.rowsUpdated} updated, ${totals.rowsFailed} failed of ${totals.rowsTotal} rows.`,
  };
}
