import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allCalls, callArgs } from "@/test/fake-supabase";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());

vi.mock("server-only", () => ({}));

const { EXISTING_SELECT, finishRun, loadRefs, loadSupplierProducts, startRun } = await import("./import-db");

const db = fake.client as SupabaseClient;
const NOW = new Date("2026-10-23T12:00:00.000Z");

const productRow = (n: number) => ({
  id: `p${n}`,
  sku: `S1-${n}`,
  slug: `phone-${n}`,
  supplier_sku: `${n}`,
  title: `Phone ${n}`,
  price: "199.50",
  mrp: null,
  stock: 3,
  description: null,
  condition: "new",
  brand_id: 2,
  category_id: null,
  gst_rate: "18",
  hsn_code: "8517",
  images: ["https://cdn.test/a"],
  is_active: true,
  locked_fields: ["price"],
});

beforeEach(() => {
  fake.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loadSupplierProducts", () => {
  it("maps rows to stored products with numeric prices", async () => {
    fake.respond("products", { data: [productRow(1)] });

    const products = await loadSupplierProducts(db, 1);

    expect(products).toEqual([
      {
        id: "p1",
        sku: "S1-1",
        slug: "phone-1",
        supplierSku: "1",
        title: "Phone 1",
        price: 199.5,
        mrp: null,
        stock: 3,
        description: null,
        condition: "new",
        brandId: 2,
        categoryId: null,
        gstRate: 18,
        hsnCode: "8517",
        images: ["https://cdn.test/a"],
        isActive: true,
        lockedFields: ["price"],
      },
    ]);
    const query = fake.queriesFor("products")[0];
    expect(callArgs(query, "select")).toEqual([EXISTING_SELECT]);
    expect(callArgs(query, "eq")).toEqual(["supplier_id", 1]);
    expect(callArgs(query, "not")).toEqual(["supplier_sku", "is", null]);
    expect(callArgs(query, "order")).toEqual(["id"]);
    expect(callArgs(query, "range")).toEqual([0, 999]);
  });

  it("pages past the 1000-row cap until a short page", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => productRow(i));
    fake.respond("products", { data: full }).respond("products", { data: [productRow(1000)] });

    const products = await loadSupplierProducts(db, 1);

    expect(products).toHaveLength(1001);
    expect(fake.queriesFor("products").map((q) => callArgs(q, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("asks for one more page when a page is exactly full", async () => {
    fake.respond("products", { data: Array.from({ length: 1000 }, (_, i) => productRow(i)) }).respond("products", { data: [] });

    await expect(loadSupplierProducts(db, 1)).resolves.toHaveLength(1000);
    expect(fake.queriesFor("products")).toHaveLength(2);
  });

  it("throws database errors and malformed rows", async () => {
    const error = { code: "42501", message: "denied" };
    fake.respond("products", { error }).respond("products", { data: [{ ...productRow(1), condition: "broken" }] });

    await expect(loadSupplierProducts(db, 1)).rejects.toBe(error);
    await expect(loadSupplierProducts(db, 1)).rejects.toThrow();
  });
});

describe("loadRefs", () => {
  it("loads brands and categories", async () => {
    fake.respond("brands", { data: [{ id: 1, name: "Apple", slug: "apple" }] }).respond("categories", { data: [{ id: 3, name: "Phones", slug: "phones" }] });

    await expect(loadRefs(db)).resolves.toEqual({ brands: [{ id: 1, name: "Apple", slug: "apple" }], categories: [{ id: 3, name: "Phones", slug: "phones" }] });
    expect(callArgs(fake.queriesFor("brands")[0], "select")).toEqual(["id, name, slug"]);
  });

  it("throws when either lookup fails", async () => {
    const error = { code: "500", message: "down" };
    fake.respond("brands", { error }).respond("categories", { data: [] });
    await expect(loadRefs(db)).rejects.toBe(error);

    fake.respond("brands", { data: [] }).respond("categories", { error });
    await expect(loadRefs(db)).rejects.toBe(error);
  });
});

describe("startRun", () => {
  it("fails stale runs, then opens a running row", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { data: { id: 41 } });

    await expect(startRun(db, 5, "user-1")).resolves.toEqual({ ok: true, runId: 41 });

    const [stale, insert] = fake.queriesFor("import_runs");
    expect(callArgs(stale, "update")).toEqual([{ status: "failed", finished_at: NOW.toISOString() }]);
    expect(allCalls(stale, "eq")).toEqual([
      ["supplier_id", 5],
      ["status", "running"],
    ]);
    expect(callArgs(stale, "lt")).toEqual(["started_at", "2026-10-23T11:30:00.000Z"]);
    expect(callArgs(insert, "insert")).toEqual([{ supplier_id: 5, started_by: "user-1", status: "running" }]);
    expect(callArgs(insert, "single")).toEqual([]);
  });

  it("reports an import that is already running", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { error: { code: "23505", message: "duplicate" } });

    await expect(startRun(db, 5, null)).resolves.toEqual({ ok: false, error: "An import for this supplier is already running." });
  });

  it("throws other insert errors and stale-run errors", async () => {
    const insertError = { code: "42501", message: "denied" };
    fake.respond("import_runs", {}).respond("import_runs", { error: insertError });
    await expect(startRun(db, 5, null)).rejects.toBe(insertError);

    const staleError = { code: "500", message: "down" };
    fake.respond("import_runs", { error: staleError });
    await expect(startRun(db, 5, null)).rejects.toBe(staleError);
  });

  it("throws when the insert returns no id", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { data: null });

    await expect(startRun(db, 5, null)).rejects.toThrow();
  });
});

describe("finishRun", () => {
  const totals = {
    status: "partial" as const,
    rowsTotal: 3,
    rowsCreated: 1,
    rowsUpdated: 1,
    rowsFailed: 1,
    errors: [{ row: 2, sku: "B", field: null, message: "bad" }],
  };

  it("records totals on the run and stamps the supplier", async () => {
    await finishRun(db, 41, 5, totals);

    const run = fake.queriesFor("import_runs")[0];
    expect(callArgs(run, "update")).toEqual([
      { status: "partial", rows_total: 3, rows_created: 1, rows_updated: 1, rows_failed: 1, errors: totals.errors, finished_at: NOW.toISOString() },
    ]);
    expect(callArgs(run, "eq")).toEqual(["id", 41]);
    const supplier = fake.queriesFor("suppliers")[0];
    expect(callArgs(supplier, "update")).toEqual([{ last_run_at: NOW.toISOString() }]);
    expect(callArgs(supplier, "eq")).toEqual(["id", 5]);
  });

  it("throws when the run cannot be updated and skips the supplier", async () => {
    const error = { code: "500", message: "down" };
    fake.respond("import_runs", { error });

    await expect(finishRun(db, 41, 5, totals)).rejects.toBe(error);
    expect(fake.queriesFor("suppliers")).toHaveLength(0);
  });

  it("throws when the supplier cannot be stamped", async () => {
    const error = { code: "500", message: "down" };
    fake.respond("suppliers", { error });

    await expect(finishRun(db, 41, 5, totals)).rejects.toBe(error);
  });
});
