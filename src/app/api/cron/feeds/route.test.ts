import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Supplier } from "@/lib/feeds/suppliers";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const mocks = vi.hoisted(() => ({
  listScheduledSuppliers: vi.fn(),
  runImport: vi.fn(),
  recordFailedRun: vi.fn(),
  fetchFeed: vi.fn(),
  timingSafeEqual: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  mocks.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: mocks.timingSafeEqual };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));
vi.mock("@/lib/feeds/queries", () => ({ listScheduledSuppliers: mocks.listScheduledSuppliers }));
vi.mock("@/lib/feeds/run-import", () => ({ runImport: mocks.runImport, recordFailedRun: mocks.recordFailedRun }));
vi.mock("@/lib/feeds/source", () => ({ fetchFeed: mocks.fetchFeed }));

const { GET } = await import("./route");

const SECRET = "s".repeat(32);
const TABLE = { columns: ["SKU"], rows: [] };

function request(authorization?: string): Request {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
  return new Request("http://localhost/api/cron/feeds", { headers });
}

function supplier(id: number, overrides: Partial<Supplier> = {}): Supplier {
  return {
    id,
    name: `Supplier ${id}`,
    feedUrl: `https://feeds.example.com/${id}.csv`,
    feedFormat: "csv",
    mapping: { fields: { sku: "SKU" }, options: {} } as Supplier["mapping"],
    scheduled: true,
    isActive: true,
    lastRunAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  fake.reset();
  mocks.listScheduledSuppliers.mockReset();
  mocks.runImport.mockReset();
  mocks.recordFailedRun.mockReset();
  mocks.fetchFeed.mockReset();
  mocks.logError.mockReset();
  mocks.timingSafeEqual.mockClear();
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.listScheduledSuppliers.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cron feeds authorisation", () => {
  it("rejects a missing authorization header", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Unauthorised" });
    expect(mocks.listScheduledSuppliers).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret of the same length using a timing-safe compare", async () => {
    const response = await GET(request(`Bearer ${"x".repeat(32)}`));
    expect(response.status).toBe(401);
    expect(mocks.timingSafeEqual).toHaveBeenCalledOnce();
    expect(mocks.listScheduledSuppliers).not.toHaveBeenCalled();
  });

  it("rejects a header of a different length without comparing bytes", async () => {
    const response = await GET(request(`Bearer ${SECRET}x`));
    expect(response.status).toBe(401);
    expect(mocks.timingSafeEqual).not.toHaveBeenCalled();
  });

  it("rejects the raw secret without the Bearer scheme", async () => {
    expect((await GET(request(SECRET))).status).toBe(401);
  });

  it("refuses every request when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("refuses and logs when CRON_SECRET is too short", async () => {
    vi.stubEnv("CRON_SECRET", "short");
    expect((await GET(request("Bearer short"))).status).toBe(401);
    expect(mocks.logError).toHaveBeenCalledWith("CRON_SECRET is misconfigured", expect.any(Error));
  });
});

describe("cron feeds import", () => {
  const auth = `Bearer ${SECRET}`;

  it("runs the import for each scheduled supplier", async () => {
    const s = supplier(1);
    mocks.listScheduledSuppliers.mockResolvedValue([s]);
    mocks.fetchFeed.mockResolvedValue({ ok: true, table: TABLE });
    mocks.runImport.mockResolvedValue({ ok: true, runId: 5, totals: { status: "success" } });

    const response = await GET(request(auth));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [{ supplierId: 1, status: "success" }] });
    expect(mocks.listScheduledSuppliers).toHaveBeenCalledWith(fake.client);
    expect(mocks.fetchFeed).toHaveBeenCalledWith(s.feedUrl, "csv");
    expect(mocks.runImport).toHaveBeenCalledWith({ db: fake.client, supplier: s, table: TABLE, startedBy: null });
  });

  it("skips suppliers without a feed URL or SKU mapping", async () => {
    mocks.listScheduledSuppliers.mockResolvedValue([
      supplier(1, { feedUrl: null }),
      supplier(2, { mapping: { fields: {}, options: {} } as Supplier["mapping"] }),
    ]);
    const body = await (await GET(request(auth))).json();
    expect(body.data).toEqual([
      { supplierId: 1, status: "skipped" },
      { supplierId: 2, status: "skipped" },
    ]);
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it("records a failed run when the feed cannot be fetched", async () => {
    mocks.listScheduledSuppliers.mockResolvedValue([supplier(3)]);
    mocks.fetchFeed.mockResolvedValue({ ok: false, error: "HTTP 500" });
    const body = await (await GET(request(auth))).json();
    expect(body.data).toEqual([{ supplierId: 3, status: "failed" }]);
    expect(mocks.recordFailedRun).toHaveBeenCalledWith(fake.client, 3, "HTTP 500", null);
    expect(mocks.runImport).not.toHaveBeenCalled();
  });

  it("reports skipped when the import declines to run", async () => {
    mocks.listScheduledSuppliers.mockResolvedValue([supplier(4)]);
    mocks.fetchFeed.mockResolvedValue({ ok: true, table: TABLE });
    mocks.runImport.mockResolvedValue({ ok: false, error: "already running" });
    const body = await (await GET(request(auth))).json();
    expect(body.data).toEqual([{ supplierId: 4, status: "skipped" }]);
  });

  it("isolates a supplier whose import throws and continues", async () => {
    mocks.listScheduledSuppliers.mockResolvedValue([supplier(5), supplier(6)]);
    mocks.fetchFeed.mockResolvedValue({ ok: true, table: TABLE });
    const boom = new Error("boom");
    mocks.runImport.mockRejectedValueOnce(boom).mockResolvedValueOnce({ ok: true, runId: 1, totals: { status: "partial" } });
    const response = await GET(request(auth));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([
      { supplierId: 5, status: "failed" },
      { supplierId: 6, status: "partial" },
    ]);
    expect(mocks.logError).toHaveBeenCalledWith("scheduled feed import failed", boom, { supplierId: 5 });
  });

  it("defers suppliers once the start budget is spent", async () => {
    vi.useFakeTimers({ now: 0 });
    mocks.listScheduledSuppliers.mockResolvedValue([supplier(7), supplier(8)]);
    mocks.fetchFeed.mockResolvedValue({ ok: true, table: TABLE });
    mocks.runImport.mockImplementation(async () => {
      vi.setSystemTime(200_001);
      return { ok: true, runId: 1, totals: { status: "success" } };
    });
    const body = await (await GET(request(auth))).json();
    expect(body.data).toEqual([
      { supplierId: 7, status: "success" },
      { supplierId: 8, status: "deferred" },
    ]);
    expect(mocks.runImport).toHaveBeenCalledOnce();
  });

  it("returns 500 when listing suppliers fails", async () => {
    const error = new Error("db down");
    mocks.listScheduledSuppliers.mockRejectedValue(error);
    const response = await GET(request(auth));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Import failed" });
    expect(mocks.logError).toHaveBeenCalledWith("scheduled feed import failed", error);
  });
});
