import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allCalls, callArgs } from "@/test/fake-supabase";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const {
  getSupplier,
  insertSupplier,
  listRecentRuns,
  listScheduledSuppliers,
  listSuppliers,
  saveSupplierMapping,
  updateSupplier,
} = await import("./queries");
const { IMPORT_RUN_SELECT, SUPPLIER_SELECT } = await import("./suppliers");

const db = fake.client as SupabaseClient;

const supplierRow = (id: number, name: string) => ({
  id,
  name,
  feed_url: "https://feeds.example.com/a.csv",
  feed_format: "csv",
  field_mapping: { fields: { sku: "SKU" }, options: { missing: "zero_stock" } },
  schedule_cron: "daily",
  is_active: true,
  last_run_at: null,
});

const runRow = {
  id: 9,
  status: "partial",
  rows_total: 3,
  rows_created: 1,
  rows_updated: 1,
  rows_failed: 1,
  errors: [{ row: 2, sku: "B", field: "price", message: "Price is not a valid amount" }],
  started_at: "2026-10-01T00:00:00Z",
  finished_at: "2026-10-01T00:01:00Z",
};

const input = { name: "Acme", feed_url: null, feed_format: "csv" as const, schedule_cron: null, is_active: true };
const dbError = { code: "42501", message: "permission denied" };

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("listSuppliers", () => {
  it("returns parsed suppliers ordered by name and skips malformed rows", async () => {
    fake.respond("suppliers", { data: [supplierRow(1, "Acme"), { id: "bad" }, supplierRow(2, "Zen")] });

    const suppliers = await listSuppliers();

    expect(suppliers.map((s) => s.name)).toEqual(["Acme", "Zen"]);
    expect(suppliers[0]).toMatchObject({ id: 1, feedFormat: "csv", scheduled: true, mapping: { fields: { sku: "SKU" }, options: { missing: "zero_stock" } } });
    const query = fake.queriesFor("suppliers")[0];
    expect(callArgs(query, "select")).toEqual([SUPPLIER_SELECT]);
    expect(callArgs(query, "order")).toEqual(["name"]);
  });

  it("logs and returns an empty list on error", async () => {
    fake.respond("suppliers", { error: dbError });

    await expect(listSuppliers()).resolves.toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("listSuppliers failed", dbError);
  });

  it("treats a null result as no suppliers", async () => {
    await expect(listSuppliers()).resolves.toEqual([]);
  });
});

describe("getSupplier", () => {
  it("loads one supplier by id with the default client", async () => {
    fake.respond("suppliers", { data: supplierRow(4, "Acme") });

    await expect(getSupplier(4)).resolves.toMatchObject({ id: 4, name: "Acme" });
    const query = fake.queriesFor("suppliers")[0];
    expect(callArgs(query, "eq")).toEqual(["id", 4]);
    expect(callArgs(query, "maybeSingle")).toEqual([]);
  });

  it("uses a passed client", async () => {
    const other = (await import("@/test/fake-supabase")).createFakeSupabase();
    other.respond("suppliers", { data: supplierRow(5, "Cron") });

    await expect(getSupplier(5, other.client as SupabaseClient)).resolves.toMatchObject({ id: 5 });
    expect(fake.queries).toHaveLength(0);
  });

  it("returns null when missing, malformed or failing", async () => {
    fake.respond("suppliers", { data: null }).respond("suppliers", { data: { id: 1 } }).respond("suppliers", { error: dbError });

    await expect(getSupplier(1)).resolves.toBeNull();
    await expect(getSupplier(1)).resolves.toBeNull();
    await expect(getSupplier(1)).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith("getSupplier failed", dbError, { id: 1 });
  });
});

describe("listScheduledSuppliers", () => {
  it("filters to active daily suppliers with a feed URL", async () => {
    fake.respond("suppliers", { data: [supplierRow(1, "Acme")] });

    await expect(listScheduledSuppliers(db)).resolves.toHaveLength(1);
    const query = fake.queriesFor("suppliers")[0];
    expect(allCalls(query, "eq")).toEqual([
      ["is_active", true],
      ["schedule_cron", "daily"],
    ]);
    expect(callArgs(query, "not")).toEqual(["feed_url", "is", null]);
  });

  it("throws database errors so the cron job reports them", async () => {
    fake.respond("suppliers", { error: dbError });

    await expect(listScheduledSuppliers(db)).rejects.toBe(dbError);
  });

  it("returns an empty list for a null result", async () => {
    await expect(listScheduledSuppliers(db)).resolves.toEqual([]);
  });
});

describe("listRecentRuns", () => {
  it("returns the latest ten runs for a supplier", async () => {
    fake.respond("import_runs", { data: [runRow] });

    const runs = await listRecentRuns(3);

    expect(runs).toEqual([
      {
        id: 9,
        status: "partial",
        rowsTotal: 3,
        rowsCreated: 1,
        rowsUpdated: 1,
        rowsFailed: 1,
        errors: runRow.errors,
        startedAt: runRow.started_at,
        finishedAt: runRow.finished_at,
      },
    ]);
    const query = fake.queriesFor("import_runs")[0];
    expect(callArgs(query, "select")).toEqual([IMPORT_RUN_SELECT]);
    expect(callArgs(query, "eq")).toEqual(["supplier_id", 3]);
    expect(callArgs(query, "order")).toEqual(["started_at", { ascending: false }]);
    expect(callArgs(query, "limit")).toEqual([10]);
  });

  it("logs and returns an empty list on error", async () => {
    fake.respond("import_runs", { error: dbError });

    await expect(listRecentRuns(3)).resolves.toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("listRecentRuns failed", dbError, { supplierId: 3 });
  });
});

describe("supplier writes", () => {
  it("inserts a supplier and returns its id", async () => {
    fake.respond("suppliers", { data: { id: 12 } });

    await expect(insertSupplier(input)).resolves.toBe(12);
    const query = fake.queriesFor("suppliers")[0];
    expect(callArgs(query, "insert")).toEqual([input]);
    expect(callArgs(query, "select")).toEqual(["id"]);
  });

  it("returns null when the insert fails or returns no id", async () => {
    fake.respond("suppliers", { error: dbError }).respond("suppliers", { data: { id: "12" } });

    await expect(insertSupplier(input)).resolves.toBeNull();
    await expect(insertSupplier(input)).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith("insertSupplier failed", dbError);
  });

  it("updates a supplier by id", async () => {
    await expect(updateSupplier(7, input)).resolves.toBe(true);
    const query = fake.queriesFor("suppliers")[0];
    expect(callArgs(query, "update")).toEqual([input]);
    expect(callArgs(query, "eq")).toEqual(["id", 7]);
  });

  it("reports a failed supplier update", async () => {
    fake.respond("suppliers", { error: dbError });

    await expect(updateSupplier(7, input)).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith("updateSupplier failed", dbError, { id: 7 });
  });

  it("saves the field mapping", async () => {
    const mapping = { fields: { sku: "Code" }, options: { missing: "keep" as const, defaultCondition: "new" as const, defaultGstRate: 18, markupPercent: 0 } };

    await expect(saveSupplierMapping(7, mapping)).resolves.toBe(true);
    const query = fake.queriesFor("suppliers")[0];
    expect(callArgs(query, "update")).toEqual([{ field_mapping: mapping }]);
    expect(callArgs(query, "eq")).toEqual(["id", 7]);
  });

  it("reports a failed mapping save", async () => {
    fake.respond("suppliers", { error: dbError });

    await expect(saveSupplierMapping(7, { fields: {}, options: { missing: "keep", defaultCondition: "new", defaultGstRate: 18, markupPercent: 0 } })).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith("saveSupplierMapping failed", dbError, { id: 7 });
  });
});
