import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" }) }));

const { fake, storage } = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  const { vi: hoistedVi } = await import("vitest");
  return {
    fake: createFakeSupabase(),
    storage: { from: hoistedVi.fn(), upload: hoistedVi.fn(), remove: hoistedVi.fn(), getPublicUrl: hoistedVi.fn() },
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: storage.from } }) }));

const { logger } = await import("@/lib/logger");
const { allCalls, callArgs } = await import("@/test/fake-supabase");
const { isPlaceholderImage, listAdminBrands, listAdminCategories, listAdminDevices, removeDeviceImage, setDeviceImage, uploadDeviceImage } = await import("./admin-devices");

const PREFIX = "https://db.example.com/storage/v1/object/public/product-images/";
const PLACEHOLDER = `${PREFIX}catalog/placeholders/phone.png`;
const UPLOADED = `${PREFIX}catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp`;
const DB_ERROR = { message: "connection reset" };

const ROW = {
  id: 7,
  name: "Galaxy S23",
  image_url: PLACEHOLDER,
  is_active: true,
  brand: { name: "Samsung" },
  category: { name: "Phones" },
};

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  storage.from.mockReturnValue(storage);
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `${PREFIX}${path}` } }));
});

describe("isPlaceholderImage", () => {
  it("treats missing and shared placeholder images as placeholders", () => {
    expect(isPlaceholderImage(null)).toBe(true);
    expect(isPlaceholderImage(PLACEHOLDER)).toBe(true);
    expect(isPlaceholderImage(UPLOADED)).toBe(false);
    expect(isPlaceholderImage(`${PREFIX}catalog/icecat/samsung/s23.jpg`)).toBe(false);
  });
});

describe("listAdminDevices", () => {
  it("maps rows and filters to placeholder images by default", async () => {
    fake.respond("devices", { data: [ROW], count: 41 });
    const result = await listAdminDevices({ q: null, brand: null, category: null, image: "placeholder", page: 2 });
    expect(result).toEqual({
      total: 41,
      items: [{ id: 7, name: "Galaxy S23", brandName: "Samsung", categoryName: "Phones", imageUrl: PLACEHOLDER, isActive: true, hasPlaceholder: true }],
    });
    const query = fake.queriesFor("devices")[0];
    expect(callArgs(query, "or")).toEqual(["image_url.is.null,image_url.like.*/catalog/placeholders/*"]);
    expect(callArgs(query, "range")).toEqual([30, 59]);
    expect(callArgs(query, "ilike")).toBeUndefined();
    expect(callArgs(query, "eq")).toBeUndefined();
  });

  it("filters by brand slug through the joined brand", async () => {
    fake.respond("devices", { data: [], count: 0 });
    await listAdminDevices({ q: null, brand: "samsung", category: null, image: "all", page: 1 });
    expect(callArgs(fake.queriesFor("devices")[0], "eq")).toEqual(["brand.slug", "samsung"]);
  });

  it("filters by category slug, combined with brand", async () => {
    fake.respond("devices", { data: [], count: 0 });
    await listAdminDevices({ q: null, brand: "apple", category: "tablet", image: "all", page: 1 });
    expect(allCalls(fake.queriesFor("devices")[0], "eq")).toEqual([
      ["category.slug", "tablet"],
      ["brand.slug", "apple"],
    ]);
  });

  it("searches by name with LIKE wildcards escaped", async () => {
    fake.respond("devices", { data: [], count: 0 });
    await listAdminDevices({ q: "100%_pro", brand: null, category: null, image: "all", page: 1 });
    const query = fake.queriesFor("devices")[0];
    expect(callArgs(query, "ilike")).toEqual(["name", "%100\\%\\_pro%"]);
    expect(callArgs(query, "or")).toBeUndefined();
    expect(callArgs(query, "like")).toBeUndefined();
  });

  it("filters to uploaded photos", async () => {
    fake.respond("devices", { data: [{ ...ROW, image_url: UPLOADED }], count: 1 });
    const result = await listAdminDevices({ q: null, brand: null, category: null, image: "custom", page: 1 });
    expect(callArgs(fake.queriesFor("devices")[0], "like")).toEqual(["image_url", "%/catalog/devices/%"]);
    expect(result.items[0].hasPlaceholder).toBe(false);
  });

  it("returns an empty page on a database error or bad rows", async () => {
    fake.respond("devices", { error: DB_ERROR });
    expect(await listAdminDevices({ q: null, brand: null, category: null, image: "all", page: 1 })).toEqual({ items: [], total: 0 });
    fake.respond("devices", { data: [{ id: "x" }] });
    expect(await listAdminDevices({ q: null, brand: null, category: null, image: "all", page: 1 })).toEqual({ items: [], total: 0 });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("listAdminBrands", () => {
  it("lists every brand by name, hidden ones included", async () => {
    fake.respond("brands", { data: [{ name: "Apple", slug: "apple" }, { name: "Samsung", slug: "samsung" }] });
    expect(await listAdminBrands()).toEqual([
      { name: "Apple", slug: "apple" },
      { name: "Samsung", slug: "samsung" },
    ]);
    const query = fake.queriesFor("brands")[0];
    expect(callArgs(query, "select")).toEqual(["name, slug"]);
    expect(callArgs(query, "order")).toEqual(["name"]);
    expect(callArgs(query, "eq")).toBeUndefined();
  });

  it("returns no brands on a database error or bad rows", async () => {
    fake.respond("brands", { error: DB_ERROR });
    expect(await listAdminBrands()).toEqual([]);
    fake.respond("brands", { data: [{ name: 1 }] });
    expect(await listAdminBrands()).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("listAdminCategories", () => {
  it("lists every category in display order", async () => {
    fake.respond("categories", { data: [{ name: "Phones", slug: "phone" }] });
    expect(await listAdminCategories()).toEqual([{ name: "Phones", slug: "phone" }]);
    const query = fake.queriesFor("categories")[0];
    expect(callArgs(query, "select")).toEqual(["name, slug"]);
    expect(callArgs(query, "order")).toEqual(["sort_order"]);
  });

  it("returns no categories on a database error", async () => {
    fake.respond("categories", { error: DB_ERROR });
    expect(await listAdminCategories()).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("uploadDeviceImage", () => {
  it("uploads a WebP under a fresh path for the device", async () => {
    const url = await uploadDeviceImage(7, Buffer.from("webp"));
    const [path, body, options] = storage.upload.mock.calls[0];
    expect(path).toMatch(/^catalog\/devices\/7\/[0-9a-f-]{36}\.webp$/);
    expect(body).toEqual(Buffer.from("webp"));
    expect(options).toEqual({ contentType: "image/webp", cacheControl: "31536000", upsert: false });
    expect(url).toBe(`${PREFIX}${path}`);
  });

  it("throws when storage rejects the upload", async () => {
    storage.upload.mockResolvedValue({ error: { message: "quota" } });
    await expect(uploadDeviceImage(7, Buffer.from("x"))).rejects.toThrow("Device image upload failed");
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("setDeviceImage", () => {
  it("updates the device and returns the image it replaced", async () => {
    fake.respond("devices", { data: { image_url: PLACEHOLDER } }).respond("devices", { data: [{ id: 7 }] });
    expect(await setDeviceImage(7, UPLOADED)).toEqual({ ok: true, previous: PLACEHOLDER });
    const update = fake.queriesFor("devices")[1];
    expect((callArgs(update, "update")?.[0] as { image_url: string }).image_url).toBe(UPLOADED);
    expect(allCalls(update, "eq")).toEqual([["id", 7]]);
  });

  it("reports a missing device", async () => {
    fake.respond("devices", { data: null });
    expect(await setDeviceImage(7, UPLOADED)).toEqual({ ok: false, error: "not_found" });
    expect(fake.queriesFor("devices")).toHaveLength(1);
  });

  it("reports an update that RLS filtered out as not found", async () => {
    fake.respond("devices", { data: { image_url: null } }).respond("devices", { data: [] });
    expect(await setDeviceImage(7, UPLOADED)).toEqual({ ok: false, error: "not_found" });
  });

  it("reports database errors on lookup and update", async () => {
    fake.respond("devices", { error: DB_ERROR });
    expect(await setDeviceImage(7, UPLOADED)).toEqual({ ok: false, error: "error" });
    fake.respond("devices", { data: { image_url: null } }).respond("devices", { error: DB_ERROR });
    expect(await setDeviceImage(7, UPLOADED)).toEqual({ ok: false, error: "error" });
  });
});

describe("removeDeviceImage", () => {
  it("deletes photos uploaded through the admin", async () => {
    await removeDeviceImage(7, UPLOADED);
    expect(storage.remove).toHaveBeenCalledWith(["catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp"]);
  });

  it.each([
    null,
    PLACEHOLDER,
    `${PREFIX}catalog/icecat/a.jpg`,
    "https://evil.example/catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp",
    `${PREFIX}catalog/devices/8/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp`,
    `${PREFIX}catalog/devices/7/../../placeholders/phone.png`,
    `${PREFIX}catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b.webp.png`,
    `${PREFIX}catalog/devices/7/0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5bxwebp`,
  ])(
    "never deletes %s",
    async (url) => {
      await removeDeviceImage(7, url);
      expect(storage.remove).not.toHaveBeenCalled();
    },
  );

  it("logs a failed delete without throwing", async () => {
    storage.remove.mockResolvedValue({ error: { message: "nope" } });
    await removeDeviceImage(7, UPLOADED);
    expect(logger.error).toHaveBeenCalled();
  });
});
