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
const { allCalls, callArgs } = await import("@/test/fake-supabase");
const {
  CATALOG_TAG,
  getBrand,
  getCategory,
  getDeviceDetail,
  listAllBrands,
  listBrandsForCategory,
  listDevices,
  listTopSelling,
  searchDevices,
} = await import("./queries");

const APPLE = { id: 1, name: "Apple", slug: "apple", logo_url: "https://cdn.example.com/apple.png" };
const SAMSUNG = { id: 2, name: "Samsung", slug: "samsung", logo_url: null };
const CATEGORY_ROW = {
  id: 10,
  name: "Mobile Phones",
  slug: "mobile-phones",
  icon_url: null,
  can_sell: true,
  can_buy: true,
  coming_soon: false,
};
const DEVICE_ROW = {
  id: 100,
  name: "iPhone 15",
  slug: "iphone-15",
  image_url: null,
  brand: { name: "Apple", slug: "apple" },
  category: { slug: "mobile-phones" },
  variants: [{ base_buy_price: "42000.00" }, { base_buy_price: 51000 }],
};
const DETAIL_ROW = {
  id: 100,
  name: "iPhone 15",
  slug: "iphone-15",
  image_url: "https://cdn.example.com/iphone-15.png",
  brand: { name: "Apple", slug: "apple" },
  category: { name: "Mobile Phones", slug: "mobile-phones" },
  variants: [
    { id: 2, label: "256 GB", slug: "256gb", base_buy_price: "51000" },
    { id: 1, label: "128 GB", slug: "128gb", base_buy_price: 42000 },
  ],
};
const DB_ERROR = { message: "connection reset" };

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("getCategory", () => {
  it("rejects an invalid slug without querying", async () => {
    expect(await getCategory("Bad Slug!")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("finds the category by slug", async () => {
    fake.respond("categories", { data: [CATEGORY_ROW] });
    expect(await getCategory("mobile-phones")).toMatchObject({ id: 10, slug: "mobile-phones", canSell: true });
  });

  it("returns null for an unknown slug", async () => {
    fake.respond("categories", { data: [CATEGORY_ROW] });
    expect(await getCategory("laptops")).toBeNull();
  });
});

describe("listAllBrands", () => {
  it("parses brand rows ordered by sort_order", async () => {
    fake.respond("brands", { data: [APPLE, SAMSUNG, { id: "bad" }] });
    expect(await listAllBrands()).toEqual([
      { id: 1, name: "Apple", slug: "apple", logoUrl: "https://cdn.example.com/apple.png" },
      { id: 2, name: "Samsung", slug: "samsung", logoUrl: null },
    ]);
    const [query] = fake.queriesFor("brands");
    expect(callArgs(query, "select")).toEqual(["id, name, slug, logo_url"]);
    expect(callArgs(query, "order")).toEqual(["sort_order"]);
    expect(cacheTag).toHaveBeenCalledWith(CATALOG_TAG);
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("returns [] and caches briefly on error", async () => {
    fake.respond("brands", { error: DB_ERROR });
    expect(await listAllBrands()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load brands", DB_ERROR);
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});

describe("getBrand", () => {
  it("rejects an invalid slug without querying", async () => {
    expect(await getBrand("../apple")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("finds the brand by slug or returns null", async () => {
    fake.respond("brands", { data: [APPLE] }).respond("brands", { data: [APPLE] });
    expect(await getBrand("apple")).toMatchObject({ id: 1 });
    expect(await getBrand("nokia")).toBeNull();
  });
});

describe("listBrandsForCategory", () => {
  it("filters brands by their devices' category", async () => {
    fake.respond("brands", { data: [{ ...APPLE, devices: [{ id: 100 }] }] });
    expect(await listBrandsForCategory(10)).toEqual([
      { id: 1, name: "Apple", slug: "apple", logoUrl: "https://cdn.example.com/apple.png" },
    ]);
    const [query] = fake.queriesFor("brands");
    expect(callArgs(query, "select")).toEqual(["id, name, slug, logo_url, devices!inner(id)"]);
    expect(callArgs(query, "eq")).toEqual(["devices.category_id", 10]);
  });

  it("returns [] and logs on error", async () => {
    fake.respond("brands", { error: DB_ERROR });
    expect(await listBrandsForCategory(10)).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load brands for category", DB_ERROR, { categoryId: 10 });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});

describe("listDevices", () => {
  it("parses devices with the best variant price and builds hrefs", async () => {
    fake.respond("devices", { data: [DEVICE_ROW, { ...DEVICE_ROW, id: 101, slug: "iphone-14", variants: [] }] });
    const devices = await listDevices(10, 1);
    expect(devices).toEqual([
      {
        id: 100,
        name: "iPhone 15",
        slug: "iphone-15",
        imageUrl: null,
        brandName: "Apple",
        brandSlug: "apple",
        categorySlug: "mobile-phones",
        href: "/sell/mobile-phones/apple/iphone-15",
        maxPrice: 51000,
      },
      expect.objectContaining({ id: 101, maxPrice: null }),
    ]);
    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq")).toEqual([
      ["category_id", 10],
      ["brand_id", 1],
    ]);
    expect(allCalls(query, "order")).toEqual([["release_year", { ascending: false, nullsFirst: false }], ["name"]]);
  });

  it("returns [] and logs on error", async () => {
    fake.respond("devices", { error: DB_ERROR });
    expect(await listDevices(10, 1)).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load devices", DB_ERROR, { categoryId: 10, brandId: 1 });
  });
});

describe("listTopSelling", () => {
  it("queries top sellers in the category with a limit", async () => {
    fake.respond("devices", { data: [DEVICE_ROW] });
    expect(await listTopSelling(10)).toHaveLength(1);
    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq")).toEqual([
      ["category_id", 10],
      ["is_top_selling", true],
    ]);
    expect(callArgs(query, "limit")).toEqual([12]);
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("returns [] and logs on error", async () => {
    fake.respond("devices", { error: DB_ERROR });
    expect(await listTopSelling(10)).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Failed to load top selling devices", DB_ERROR, { categoryId: 10 });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});

describe("getDeviceDetail", () => {
  it("rejects an invalid device slug without querying", async () => {
    expect(await getDeviceDetail(10, 1, "iPhone 15")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("parses the device with variants sorted by price", async () => {
    fake.respond("devices", { data: DETAIL_ROW });
    const device = await getDeviceDetail(10, 1, "iphone-15");
    expect(device).toMatchObject({ id: 100, categoryName: "Mobile Phones", href: "/sell/mobile-phones/apple/iphone-15" });
    expect(device?.variants).toEqual([
      { id: 1, label: "128 GB", slug: "128gb", price: 42000, href: "/sell/mobile-phones/apple/iphone-15/128gb" },
      { id: 2, label: "256 GB", slug: "256gb", price: 51000, href: "/sell/mobile-phones/apple/iphone-15/256gb" },
    ]);
    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq")).toEqual([
      ["category_id", 10],
      ["brand_id", 1],
      ["slug", "iphone-15"],
    ]);
    expect(callArgs(query, "maybeSingle")).toEqual([]);
  });

  it("returns null when the device is missing or malformed", async () => {
    fake.respond("devices", { data: null }).respond("devices", { data: { id: 100 } });
    expect(await getDeviceDetail(10, 1, "iphone-15")).toBeNull();
    expect(await getDeviceDetail(10, 1, "iphone-15")).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("devices", { error: DB_ERROR });
    expect(await getDeviceDetail(10, 1, "iphone-15")).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Failed to load device", DB_ERROR, {
      categoryId: 10,
      brandId: 1,
      deviceSlug: "iphone-15",
    });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});

describe("searchDevices", () => {
  it("ignores empty or too-short queries without querying", async () => {
    expect(await searchDevices(null)).toEqual([]);
    expect(await searchDevices(" a ")).toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });

  it("splits the brand out of the query and filters by the remaining text", async () => {
    fake.respond("brands", { data: [APPLE, SAMSUNG] });
    fake.respond("devices", { data: [DEVICE_ROW] });
    expect(await searchDevices("Apple iphone 100%")).toHaveLength(1);

    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq")).toEqual([
      ["category.can_sell", true],
      ["category.coming_soon", false],
      ["brand_id", 1],
    ]);
    // "%" is stripped by normalizeQuery, so only the plain text reaches ilike
    expect(callArgs(query, "ilike")).toEqual(["name", "%iphone 100%"]);
    expect(callArgs(query, "limit")).toEqual([24]);
    expect(allCalls(query, "order")).toEqual([["is_top_selling", { ascending: false }], ["name"]]);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("strips LIKE wildcards from user input before filtering", async () => {
    fake.respond("brands", { data: [] });
    await searchDevices("galaxy_s24");
    // "_" is not a letter or digit, so normalizeQuery turns it into a space
    expect(callArgs(fake.queriesFor("devices")[0], "ilike")).toEqual(["name", "%galaxy s24%"]);
  });

  it("searches by brand alone without a name filter", async () => {
    fake.respond("brands", { data: [APPLE] });
    await searchDevices("apple");
    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq")).toContainEqual(["brand_id", 1]);
    expect(allCalls(query, "ilike")).toEqual([]);
  });

  it("searches by text alone when no brand matches", async () => {
    fake.respond("brands", { data: [APPLE] });
    await searchDevices("pixel 8");
    const [query] = fake.queriesFor("devices");
    expect(allCalls(query, "eq").map(([column]) => column)).not.toContain("brand_id");
    expect(callArgs(query, "ilike")).toEqual(["name", "%pixel 8%"]);
  });

  it("returns [] and logs on error", async () => {
    fake.respond("brands", { data: [APPLE] });
    fake.respond("devices", { error: DB_ERROR });
    expect(await searchDevices("pixel 8")).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("Device search failed", DB_ERROR, { query: "pixel 8" });
    expect(cacheLife).toHaveBeenCalledWith("seconds");
  });
});
