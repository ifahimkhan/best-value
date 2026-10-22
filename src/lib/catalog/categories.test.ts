import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fake = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return createFakeSupabase();
});
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));

const { cacheLife, cacheTag } = await import("next/cache");
const { logger } = await import("@/lib/logger");
const { callArgs } = await import("@/test/fake-supabase");
const { listCategories, CATEGORIES_TAG } = await import("./categories");

const ROW = {
  id: 1,
  name: "Mobile Phones",
  slug: "mobile-phones",
  icon_url: null,
  can_sell: true,
  can_buy: false,
  coming_soon: false,
};

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("listCategories", () => {
  it("maps active categories ordered by sort_order and caches for hours", async () => {
    fake.respond("categories", { data: [ROW] });
    expect(await listCategories()).toEqual([
      { id: 1, name: "Mobile Phones", slug: "mobile-phones", iconUrl: null, canSell: true, canBuy: false, comingSoon: false },
    ]);
    const [query] = fake.queriesFor("categories");
    expect(callArgs(query, "eq")).toEqual(["is_active", true]);
    expect(callArgs(query, "order")).toEqual(["sort_order"]);
    expect(cacheTag).toHaveBeenCalledWith(CATEGORIES_TAG);
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("returns [] on error, logs, and caches only briefly", async () => {
    fake.respond("categories", { error: { message: "boom" } });
    expect(await listCategories()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load categories", { message: "boom" });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
  });

  it("drops malformed rows and logs a warning", async () => {
    fake.respond("categories", { data: [ROW, { ...ROW, id: "2", slug: null }] });
    expect((await listCategories()).map((c) => c.id)).toEqual([1]);
    expect(logger.warn).toHaveBeenCalledWith("Dropped malformed category row", { id: "2", issues: 2 });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
  });

  it("treats a non-array payload as empty", async () => {
    fake.respond("categories", { data: { not: "rows" } });
    expect(await listCategories()).toEqual([]);
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});
