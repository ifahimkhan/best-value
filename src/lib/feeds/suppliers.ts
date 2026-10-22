import { z } from "zod";
import { FEED_FORMATS, IMPORT_STATUSES, type FeedFormat, type ImportStatus } from "./constants";
import { FIELD_KEYS, parseMapping, PRODUCT_FIELDS, type FeedMapping } from "./mapping";
import { validateFeedUrl } from "./url-safety";

export { FEED_FORMATS, IMPORT_STATUSES, type FeedFormat, type ImportStatus };

export interface Supplier {
  id: number;
  name: string;
  feedUrl: string | null;
  feedFormat: FeedFormat;
  mapping: FeedMapping;
  scheduled: boolean;
  isActive: boolean;
  lastRunAt: string | null;
}

export const SUPPLIER_SELECT = "id, name, feed_url, feed_format, field_mapping, schedule_cron, is_active, last_run_at";

const supplierRow = z.object({
  id: z.number().int(),
  name: z.string(),
  feed_url: z.string().nullable(),
  feed_format: z.enum(FEED_FORMATS),
  field_mapping: z.unknown(),
  schedule_cron: z.string().nullable(),
  is_active: z.boolean(),
  last_run_at: z.string().nullable(),
});

export function parseSupplierRow(raw: unknown): Supplier | null {
  const parsed = supplierRow.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    id: row.id,
    name: row.name,
    feedUrl: row.feed_url,
    feedFormat: row.feed_format,
    mapping: parseMapping(row.field_mapping),
    scheduled: row.schedule_cron === "daily",
    isActive: row.is_active,
    lastRunAt: row.last_run_at,
  };
}

export interface ImportRunError {
  row: number | null;
  sku: string | null;
  field: string | null;
  message: string;
}

export interface ImportRun {
  id: number;
  status: ImportStatus;
  rowsTotal: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsFailed: number;
  errors: ImportRunError[];
  startedAt: string;
  finishedAt: string | null;
}

export const IMPORT_RUN_SELECT = "id, status, rows_total, rows_created, rows_updated, rows_failed, errors, started_at, finished_at";

const runError = z.object({
  row: z.number().nullable().catch(null),
  sku: z.string().nullable().catch(null),
  field: z.string().nullable().catch(null),
  message: z.string().catch("Unknown error"),
});

const runRow = z.object({
  id: z.number().int(),
  status: z.enum(IMPORT_STATUSES),
  rows_total: z.number(),
  rows_created: z.number(),
  rows_updated: z.number(),
  rows_failed: z.number(),
  errors: z.array(runError).catch([]),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

export function parseImportRuns(raw: unknown): ImportRun[] {
  const parsed = z.array(runRow).safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({
    id: row.id,
    status: row.status,
    rowsTotal: row.rows_total,
    rowsCreated: row.rows_created,
    rowsUpdated: row.rows_updated,
    rowsFailed: row.rows_failed,
    errors: row.errors,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export interface SupplierInput {
  name: string;
  feed_url: string | null;
  feed_format: FeedFormat;
  schedule_cron: "daily" | null;
  is_active: boolean;
}

export type SupplierFormResult = { ok: true; data: SupplierInput } | { ok: false; errors: Record<string, string> };

const supplierForm = z.object({
  name: z.string().trim().min(1, "Enter a supplier name").max(120, "Use 120 characters or fewer"),
  feedUrl: z.string().trim().max(2000, "URL is too long"),
  feedFormat: z.enum(FEED_FORMATS, { error: "Choose a file format" }),
  scheduled: z.boolean(),
  isActive: z.boolean(),
});

export function parseSupplierForm(form: FormData): SupplierFormResult {
  const text = (key: string): string => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = supplierForm.safeParse({
    name: text("name"),
    feedUrl: text("feedUrl"),
    feedFormat: text("feedFormat"),
    scheduled: form.get("scheduled") === "on",
    isActive: form.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { ok: false, errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const { name, feedUrl, feedFormat, scheduled, isActive } = parsed.data;
  if (feedUrl !== "") {
    const check = validateFeedUrl(feedUrl);
    if (!check.ok) return { ok: false, errors: { feedUrl: check.error } };
  }
  if (scheduled && feedUrl === "") return { ok: false, errors: { scheduled: "Daily import needs a feed URL" } };
  return {
    ok: true,
    data: {
      name,
      feed_url: feedUrl === "" ? null : feedUrl,
      feed_format: feedFormat,
      schedule_cron: scheduled ? "daily" : null,
      is_active: isActive,
    },
  };
}

export type MappingFormResult = { ok: true; mapping: FeedMapping } | { ok: false; error: string };

/** Mapping editor form: one select per product field ("field.sku" ...) plus import options. */
export function parseMappingForm(form: FormData): MappingFormResult {
  const text = (key: string): string => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const fields = Object.fromEntries(
    FIELD_KEYS.map((key) => [key, text(`field.${key}`)]).filter(([, column]) => column !== ""),
  );
  const mapping = parseMapping({
    fields,
    options: {
      missing: text("missing"),
      defaultCondition: text("defaultCondition"),
      defaultGstRate: Number(text("defaultGstRate")),
      markupPercent: Number(text("markupPercent") || "0"),
    },
  });
  const missing = FIELD_KEYS.filter((key) => PRODUCT_FIELDS[key].required && !mapping.fields[key]);
  if (missing.length > 0) {
    return { ok: false, error: `Choose a column for: ${missing.map((key) => PRODUCT_FIELDS[key].label).join(", ")}` };
  }
  return { ok: true, mapping };
}
