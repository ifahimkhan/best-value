import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { logger } = await import("@/lib/logger");
const { allCalls, callArgs } = await import("@/test/fake-supabase");
const { applyImageToDeviceProducts, isImageUsedByProducts, withDeviceImage } = await import("./device-products");

const P = "https://db.example.com/storage/v1/object/public/product-images/";
const NEW = `${P}catalog/devices/7/new.webp`;
const OLD = `${P}catalog/devices/7/old.webp`;
const OLDER = `${P}catalog/devices/7/older.webp`;
const OTHER_DEVICE = `${P}catalog/devices/70/x.webp`;
const A = `${P}manual/a.jpg`;
const T = "2026-10-23T05:00:00+00:00";
const DB_ERROR = { message: "connection reset" };

const product = (id: string, images: string[], extra: Record<string, unknown> = {}) => ({
  id,
  images,
  source: "manual",
  locked_fields: [],
  updated_at: T,
  ...extra,
});

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("withDeviceImage", () => {
  it("puts the device photo first and removes every earlier photo of the same device", () => {
    expect(withDeviceImage([A, OLD, OLDER], NEW, 7)).toEqual([NEW, A]);
  });

  it("keeps other devices' photos and never lists a photo twice", () => {
    expect(withDeviceImage([A, NEW, OTHER_DEVICE], NEW, 7)).toEqual([NEW, A, OTHER_DEVICE]);
  });

  it("refuses to push out a full product's own photos", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `${P}manual/${i}.jpg`);
    expect(withDeviceImage(eight, NEW, 7)).toBeNull();
    expect(withDeviceImage([...eight.slice(0, 7), OLD], NEW, 7)).toEqual([NEW, ...eight.slice(0, 7)]);
  });
});

describe("applyImageToDeviceProducts", () => {
  it("updates every product of the device's variants and locks images on feed products", async () => {
    fake
      .respond("products", { data: [product("p1", [A]), product("p2", [OLD], { source: "feed", locked_fields: ["price"] })] })
      .respond("products", { data: [{ id: "p1" }] })
      .respond("products", { data: [{ id: "p2" }] });
    expect(await applyImageToDeviceProducts(7, NEW)).toEqual({ updated: 2, skippedFull: 0, failed: 0 });

    const [list, first, second] = fake.queriesFor("products");
    expect(callArgs(list, "select")?.[0]).toContain("variant:device_variants!inner(device_id)");
    expect(callArgs(list, "eq")).toEqual(["variant.device_id", 7]);
    expect(callArgs(first, "update")).toEqual([{ images: [NEW, A], locked_fields: [] }]);
    expect(allCalls(first, "eq")).toEqual([
      ["id", "p1"],
      ["updated_at", T],
    ]);
    expect(callArgs(second, "update")).toEqual([{ images: [NEW], locked_fields: ["price", "images"] }]);
  });

  it("skips products that already show the photo first, and full products", async () => {
    const eight = Array.from({ length: 8 }, (_, i) => `${P}manual/${i}.jpg`);
    fake.respond("products", { data: [product("p1", [NEW, A]), product("p2", eight)] });
    expect(await applyImageToDeviceProducts(7, NEW)).toEqual({ updated: 0, skippedFull: 1, failed: 0 });
    expect(fake.queriesFor("products")).toHaveLength(1);
  });

  it("counts a product changed meanwhile, or a failed update, as failed", async () => {
    fake
      .respond("products", { data: [product("p1", [A]), product("p2", [A])] })
      .respond("products", { data: [] })
      .respond("products", { error: DB_ERROR });
    expect(await applyImageToDeviceProducts(7, NEW)).toEqual({ updated: 0, skippedFull: 0, failed: 2 });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("reports a failed lookup as one failure", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await applyImageToDeviceProducts(7, NEW)).toEqual({ updated: 0, skippedFull: 0, failed: 1 });
    fake.respond("products", { data: [{ id: 1 }] });
    expect(await applyImageToDeviceProducts(7, NEW)).toEqual({ updated: 0, skippedFull: 0, failed: 1 });
  });
});

describe("isImageUsedByProducts", () => {
  it("checks whether any product lists the photo", async () => {
    fake.respond("products", { count: 2 });
    expect(await isImageUsedByProducts(OLD)).toBe(true);
    expect(callArgs(fake.queriesFor("products")[0], "contains")).toEqual(["images", [OLD]]);
    fake.respond("products", { count: 0 });
    expect(await isImageUsedByProducts(OLD)).toBe(false);
  });

  it("assumes the photo is in use when the check fails, so it is never deleted by mistake", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await isImageUsedByProducts(OLD)).toBe(true);
  });
});
