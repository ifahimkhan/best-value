import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allCalls, callArgs, type FakeResponse } from "@/test/fake-supabase";
import type { FetchedFile, SafeFetchOptions } from "./safe-fetch";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());

// The shared fake has no storage API, so the admin client gets a small bucket double.
const storage = vi.hoisted(() => ({
  existing: new Set<string>(),
  uploadError: null as { message: string } | null,
  uploads: [] as { path: string; size: number; options: unknown }[],
  buckets: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn<(url: string, options: SafeFetchOptions) => Promise<FetchedFile>>(),
  revalidateTag: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    ...(fake.client as object),
    storage: {
      from: (bucket: string) => {
        storage.buckets.push(bucket);
        return {
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
          exists: async (path: string) => ({ data: storage.existing.has(path), error: null }),
          upload: async (path: string, body: Buffer, options: unknown) => {
            storage.uploads.push({ path, size: body.length, options });
            return { data: null, error: storage.uploadError };
          },
        };
      },
    },
  }),
}));
vi.mock("./safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./safe-fetch")>()),
  safeFetch: mocks.safeFetch,
}));

const { recordFailedRun, runImport } = await import("./run-import");
const { SafeFetchError } = await import("./safe-fetch");
const { imagePath, IMAGE_TYPES, MAX_IMAGE_BYTES } = await import("./images");
const { parseMapping } = await import("./mapping");

type ImportRequest = Parameters<typeof runImport>[0];
type Row = Record<string, string>;

const db = fake.client as SupabaseClient;
const SUPPLIER_ID = 3;
const RUN_ID = 77;
const IMG = "https://img.example.com/a.jpg";
const HOSTED = `https://cdn.test/${imagePath(SUPPLIER_ID, IMG)}`;

function supplier(missing: "keep" | "zero_stock" = "keep"): ImportRequest["supplier"] {
  return {
    id: SUPPLIER_ID,
    name: "Acme",
    feedUrl: null,
    feedFormat: "csv",
    mapping: parseMapping({ fields: { sku: "SKU", title: "Title", price: "Price", stock: "Stock", images: "Image" }, options: { missing } }),
    scheduled: false,
    isActive: true,
    lastRunAt: null,
  };
}

const row = (sku: string, price = "100", extra: Row = {}): Row => ({ SKU: sku, Title: `Phone ${sku}`, Price: price, Stock: "5", Image: "", ...extra });

function request(rows: Row[], missing: "keep" | "zero_stock" = "keep"): ImportRequest {
  return { db, supplier: supplier(missing), table: { columns: ["SKU", "Title", "Price", "Stock", "Image"], rows }, startedBy: "staff-1" };
}

const stored = (sku: string, overrides: Record<string, unknown> = {}) => ({
  id: `id-${sku}`,
  sku: `S3-${sku}`,
  slug: `phone-${sku}`,
  supplier_sku: sku,
  title: `Phone ${sku}`,
  price: 100,
  mrp: null,
  stock: 5,
  description: null,
  condition: "new",
  brand_id: null,
  category_id: null,
  gst_rate: 18,
  hsn_code: null,
  images: [],
  is_active: true,
  locked_fields: [],
  ...overrides,
});

/** Queues the reads every run makes: stale-run sweep, run insert, existing products, brands, categories. */
function prime(existing: unknown[] = [], ...productWrites: FakeResponse[]): void {
  fake.respond("import_runs", {}).respond("import_runs", { data: { id: RUN_ID } });
  fake.respond("products", { data: existing });
  productWrites.forEach((response) => fake.respond("products", response));
  fake.respond("brands", { data: [] }).respond("categories", { data: [] });
}

const productWrites = () => fake.queriesFor("products").slice(1);
const finishedRun = () => callArgs(fake.queriesFor("import_runs")[2], "update")?.[0];

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  storage.existing.clear();
  storage.uploads.length = 0;
  storage.buckets.length = 0;
  storage.uploadError = null;
  mocks.safeFetch.mockResolvedValue({ body: Buffer.from("jpeg"), contentType: "image/jpeg; charset=binary", finalUrl: IMG });
});

describe("runImport: creating products", () => {
  it("inserts new products, records the run and revalidates the product tag", async () => {
    prime();

    const outcome = await runImport(request([row("A"), row("B", "250")]));

    expect(outcome).toEqual({
      ok: true,
      runId: RUN_ID,
      totals: { status: "succeeded", rowsTotal: 2, rowsCreated: 2, rowsUpdated: 0, rowsFailed: 0, errors: [] },
    });
    const [insert] = productWrites();
    const batch = callArgs(insert, "insert")?.[0] as Record<string, unknown>[];
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({ supplier_id: SUPPLIER_ID, supplier_sku: "A", sku: "S3-A", price: 100, stock: 5, source: "feed", images: [] });
    expect(batch[1]).toMatchObject({ supplier_sku: "B", price: 250 });
    expect(finishedRun()).toMatchObject({ status: "succeeded", rows_total: 2, rows_created: 2, rows_updated: 0, rows_failed: 0, errors: [] });
    expect(callArgs(fake.queriesFor("import_runs")[2], "eq")).toEqual(["id", RUN_ID]);
    expect(callArgs(fake.queriesFor("import_runs")[1], "insert")).toEqual([{ supplier_id: SUPPLIER_ID, started_by: "staff-1", status: "running" }]);
    expect(callArgs(fake.queriesFor("suppliers")[0], "eq")).toEqual(["id", SUPPLIER_ID]);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("products", "max");
  });

  it("splits inserts into batches of 500", async () => {
    prime();
    const rows = Array.from({ length: 501 }, (_, i) => row(`P${i}`));

    const outcome = await runImport(request(rows));

    expect(productWrites().map((q) => (callArgs(q, "insert")?.[0] as unknown[]).length)).toEqual([500, 1]);
    expect(outcome).toMatchObject({ ok: true, totals: { rowsCreated: 501, status: "succeeded" } });
  });

  it("retries a failed batch row by row and reports the bad row", async () => {
    prime([], { error: { code: "23514", message: "check" } }, {}, { error: { code: "23505", message: "dup" } });

    const outcome = await runImport(request([row("A"), row("B")]));

    expect(productWrites().map((q) => callArgs(q, "insert")?.[0])).toEqual([
      expect.any(Array),
      expect.objectContaining({ supplier_sku: "A" }),
      expect.objectContaining({ supplier_sku: "B" }),
    ]);
    expect(outcome).toMatchObject({
      ok: true,
      totals: { status: "partial", rowsCreated: 1, rowsFailed: 1, errors: [{ row: null, sku: "B", field: null, message: "Could not create product (23505)" }] },
    });
  });

  it("falls back to a generic code when a row error has none", async () => {
    prime([], { error: { message: "x" } }, { error: { message: "y" } });

    const outcome = await runImport(request([row("A")]));

    expect(outcome).toMatchObject({ totals: { status: "failed", rowsCreated: 0, errors: [{ message: "Could not create product (error)" }] } });
  });
});

describe("runImport: updating products", () => {
  it("writes only changed columns, scoped to the supplier", async () => {
    prime([stored("A"), stored("B")]);

    const outcome = await runImport(request([row("A", "120"), row("B")]));

    const [update] = productWrites();
    expect(callArgs(update, "update")).toEqual([{ price: 120 }]);
    expect(allCalls(update, "eq")).toEqual([
      ["id", "id-A"],
      ["supplier_id", SUPPLIER_ID],
    ]);
    expect(productWrites()).toHaveLength(1);
    expect(outcome).toMatchObject({ totals: { status: "succeeded", rowsCreated: 0, rowsUpdated: 1, rowsFailed: 0 } });
  });

  it("reports failed updates with the product's SKU", async () => {
    prime([stored("A")], { error: { code: "42501", message: "denied" } });

    const outcome = await runImport(request([row("A", "120")]));

    expect(outcome).toMatchObject({
      totals: { status: "failed", rowsUpdated: 0, rowsFailed: 1, errors: [{ sku: "A", message: "Could not update product (42501)" }] },
    });
  });

  it("counts plan errors such as duplicate SKUs as failed rows", async () => {
    prime();

    const outcome = await runImport(request([row("A"), row("A")]));

    expect(outcome).toMatchObject({
      totals: { status: "partial", rowsCreated: 1, rowsFailed: 1, errors: [{ row: 2, sku: "A", field: null, message: "Duplicate SKU in this feed" }] },
    });
  });
});

describe("runImport: invalid rows", () => {
  it("reports mapping errors with row number, SKU and field", async () => {
    prime();

    const outcome = await runImport(request([row("A"), row("B", "free")]));

    expect(outcome).toMatchObject({
      totals: {
        status: "partial",
        rowsTotal: 2,
        rowsCreated: 1,
        rowsFailed: 1,
        errors: [{ row: 2, sku: "B", field: "price", message: "Price is not a valid amount" }],
      },
    });
  });

  it("marks a run where every row fails as failed", async () => {
    prime();

    const outcome = await runImport(request([row("", "free")]));

    expect(outcome).toMatchObject({ totals: { status: "failed", rowsCreated: 0, rowsFailed: 1 } });
    expect(productWrites()).toHaveLength(0);
  });
});

describe("runImport: missing products", () => {
  it("zeroes stock of products no longer in the feed", async () => {
    prime([stored("A"), stored("GONE")]);

    const outcome = await runImport(request([row("A")], "zero_stock"));

    const [zero] = productWrites();
    expect(callArgs(zero, "update")).toEqual([{ stock: 0 }]);
    expect(callArgs(zero, "eq")).toEqual(["id", "id-GONE"]);
    expect(outcome).toMatchObject({ totals: { status: "succeeded", rowsUpdated: 0 } });
  });

  it("keeps stock of products whose rows failed validation", async () => {
    prime([stored("A"), stored("B"), stored("C"), stored("D"), stored("E"), stored("F")]);
    const rows = [row("A"), row("B"), row("C"), row("D"), row("E"), row("F", "free")];

    await runImport(request(rows, "zero_stock"));

    expect(productWrites()).toHaveLength(0);
  });

  it("does not zero stock when too many rows failed", async () => {
    prime([stored("A"), stored("GONE")]);

    const outcome = await runImport(request([row("A"), row("B", "free")], "zero_stock"));

    expect(productWrites()).toHaveLength(0);
    expect(outcome).toMatchObject({
      totals: { errors: [{ sku: null, message: "Too many rows failed, so stock of products missing from the feed was left unchanged." }, { sku: "B" }] },
    });
  });

  it("marks the run partial when zeroing fails", async () => {
    prime([stored("A"), stored("GONE")], { error: { code: "500", message: "down" } });

    const outcome = await runImport(request([row("A")], "zero_stock"));

    expect(outcome).toMatchObject({ totals: { status: "partial", rowsFailed: 0, errors: [{ sku: "GONE", message: "Could not update product (500)" }] } });
  });
});

describe("runImport: images", () => {
  it("copies new images into storage and points the product at the hosted URL", async () => {
    prime();

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(mocks.safeFetch).toHaveBeenCalledWith(IMG, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15_000, acceptTypes: IMAGE_TYPES });
    expect(storage.buckets.every((b) => b === "product-images")).toBe(true);
    expect(storage.uploads).toEqual([
      { path: imagePath(SUPPLIER_ID, IMG), size: 4, options: { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" } },
    ]);
    expect(callArgs(productWrites()[0], "insert")?.[0]).toEqual([expect.objectContaining({ images: [HOSTED] })]);
    expect(outcome).toMatchObject({ totals: { status: "succeeded", errors: [] } });
  });

  it("skips the download when the image is already stored", async () => {
    prime();
    storage.existing.add(imagePath(SUPPLIER_ID, IMG));

    await runImport(request([row("A", "100", { Image: IMG })]));

    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(storage.uploads).toHaveLength(0);
    expect(callArgs(productWrites()[0], "insert")?.[0]).toEqual([expect.objectContaining({ images: [HOSTED] })]);
  });

  it("does not fetch images an existing product already has", async () => {
    prime([stored("A", { images: [HOSTED] })]);

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(productWrites()).toHaveLength(0);
    expect(outcome).toMatchObject({ totals: { status: "succeeded", rowsUpdated: 0 } });
  });

  it("drops images whose download is refused and reports the safe reason", async () => {
    prime();
    mocks.safeFetch.mockRejectedValue(new SafeFetchError("The address resolves to a private network."));

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(callArgs(productWrites()[0], "insert")?.[0]).toEqual([expect.objectContaining({ images: [] })]);
    expect(outcome).toMatchObject({
      totals: { status: "succeeded", rowsCreated: 1, errors: [{ sku: "A", field: "images", row: null, message: "Image skipped: The address resolves to a private network." }] },
    });
  });

  it("hides raw network errors from staff", async () => {
    prime();
    mocks.safeFetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal.corp"));

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(outcome).toMatchObject({ totals: { errors: [{ message: "Image skipped: The image could not be downloaded" }] } });
  });

  it("tolerates an upload race where the object already exists", async () => {
    prime();
    storage.uploadError = { message: "The resource already exists" };

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(outcome).toMatchObject({ totals: { errors: [] } });
    expect(callArgs(productWrites()[0], "insert")?.[0]).toEqual([expect.objectContaining({ images: [HOSTED] })]);
  });

  it("reports other upload failures", async () => {
    prime();
    storage.uploadError = { message: "Payload too large" };

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(outcome).toMatchObject({ totals: { errors: [{ message: "Image skipped: Image upload failed" }] } });
  });

  it("drops an update that only changed images when the copy failed", async () => {
    prime([stored("A")]);
    mocks.safeFetch.mockRejectedValue(new SafeFetchError("The file is too large."));

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(productWrites()).toHaveLength(0);
    expect(outcome).toMatchObject({ totals: { status: "succeeded", rowsUpdated: 0, errors: [{ message: "Image skipped: The file is too large." }] } });
  });

  it("keeps other changes when an image copy fails", async () => {
    prime([stored("A")]);
    mocks.safeFetch.mockRejectedValue(new SafeFetchError("The file is too large."));

    await runImport(request([row("A", "150", { Image: IMG })]));

    expect(callArgs(productWrites()[0], "update")).toEqual([{ price: 150 }]);
  });

  it("adds a newly copied image to an existing product", async () => {
    prime([stored("A")]);

    const outcome = await runImport(request([row("A", "100", { Image: IMG })]));

    expect(callArgs(productWrites()[0], "update")).toEqual([{ images: [HOSTED] }]);
    expect(outcome).toMatchObject({ totals: { rowsUpdated: 1 } });
  });
});

describe("runImport: failures", () => {
  it("returns the start error without writing or revalidating when a run is active", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { error: { code: "23505", message: "dup" } });

    await expect(runImport(request([row("A")]))).resolves.toEqual({ ok: false, error: "An import for this supplier is already running." });
    expect(fake.queriesFor("products")).toHaveLength(0);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("records a failed run when loading data throws", async () => {
    const error = { code: "500", message: "down" };
    fake.respond("import_runs", {}).respond("import_runs", { data: { id: RUN_ID } });
    fake.respond("products", { data: [] }).respond("brands", { error }).respond("categories", { data: [] });

    const outcome = await runImport(request([row("A"), row("B")]));

    expect(outcome).toEqual({
      ok: true,
      runId: RUN_ID,
      totals: {
        status: "failed",
        rowsTotal: 2,
        rowsCreated: 0,
        rowsUpdated: 0,
        rowsFailed: 2,
        errors: [{ row: null, sku: null, field: null, message: "The import stopped because of a server error. Some products may already be saved." }],
      },
    });
    expect(mocks.logger.error).toHaveBeenCalledWith("feed import failed", error, { supplierId: SUPPLIER_ID, runId: RUN_ID });
    expect(finishedRun()).toMatchObject({ status: "failed", rows_failed: 2 });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("products", "max");
  });

  it("still returns and revalidates when the run cannot be recorded", async () => {
    const error = { code: "500", message: "down" };
    prime();
    fake.respond("import_runs", { error });

    const outcome = await runImport(request([row("A")]));

    expect(outcome).toMatchObject({ ok: true, totals: { status: "succeeded", rowsCreated: 1 } });
    expect(mocks.logger.error).toHaveBeenCalledWith("feed import could not be recorded", error, { runId: RUN_ID });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("products", "max");
  });

  it("keeps only the first 200 errors", async () => {
    prime();
    const rows = Array.from({ length: 250 }, (_, i) => row(`B${i}`, "free"));

    const outcome = await runImport(request(rows));

    expect(outcome).toMatchObject({ totals: { status: "failed", rowsFailed: 250 } });
    expect(outcome.ok && outcome.totals.errors).toHaveLength(200);
  });
});

describe("recordFailedRun", () => {
  it("opens and closes a failed run with the message", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { data: { id: RUN_ID } });

    await recordFailedRun(db, SUPPLIER_ID, "The feed could not be downloaded.", null);

    expect(finishedRun()).toMatchObject({
      status: "failed",
      rows_total: 0,
      rows_created: 0,
      rows_updated: 0,
      rows_failed: 0,
      errors: [{ row: null, sku: null, field: null, message: "The feed could not be downloaded." }],
    });
  });

  it("does nothing more when another run is active", async () => {
    fake.respond("import_runs", {}).respond("import_runs", { error: { code: "23505", message: "dup" } });

    await recordFailedRun(db, SUPPLIER_ID, "x", null);

    expect(fake.queriesFor("import_runs")).toHaveLength(2);
    expect(fake.queriesFor("suppliers")).toHaveLength(0);
  });
});
