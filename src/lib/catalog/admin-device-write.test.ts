import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewDeviceInput } from "./device-form";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { logger } = await import("@/lib/logger");
const { callArgs } = await import("@/test/fake-supabase");
const { createDevice, getAdminDevice, placeholderImageUrl, setVariantPrices } = await import("./admin-device-write");

const PREFIX = "https://db.example.com/storage/v1/object/public/product-images/";
const DB_ERROR = { message: "connection reset", code: "08006" };

const INPUT: NewDeviceInput = {
  category_slug: "phone",
  brand_slug: "samsung",
  name: "Galaxy S26",
  slug: "galaxy-s26",
  release_year: 2026,
  is_top_selling: false,
  is_active: true,
  variants: [{ label: "8 GB / 256 GB", slug: "8-gb-256-gb", ram_gb: 8, storage_gb: 256, base_buy_price: 45000 }],
};

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("placeholderImageUrl", () => {
  it("points at the category's generic photo", () => {
    expect(placeholderImageUrl("tv")).toBe(`${PREFIX}catalog/placeholders/tv.png`);
  });
});

describe("createDevice", () => {
  it("sends the device with its placeholder photo and variants to the database function", async () => {
    fake.respond("rpc:admin_create_device", { data: 1501 });
    expect(await createDevice(INPUT)).toEqual({ ok: true, id: 1501 });
    expect(callArgs(fake.queriesFor("rpc:admin_create_device")[0], "rpc")).toEqual([
      {
        p_device: {
          category_slug: "phone",
          brand_slug: "samsung",
          name: "Galaxy S26",
          slug: "galaxy-s26",
          release_year: 2026,
          is_top_selling: false,
          is_active: true,
          image_url: `${PREFIX}catalog/placeholders/phone.png`,
        },
        p_variants: INPUT.variants,
      },
    ]);
  });

  it("reports a device that already exists", async () => {
    fake.respond("rpc:admin_create_device", { error: { message: "duplicate key", code: "23505" } });
    expect(await createDevice(INPUT)).toEqual({ ok: false, error: "duplicate" });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports other failures and a missing id", async () => {
    fake.respond("rpc:admin_create_device", { error: DB_ERROR });
    expect(await createDevice(INPUT)).toEqual({ ok: false, error: "error" });
    fake.respond("rpc:admin_create_device", { data: null });
    expect(await createDevice(INPUT)).toEqual({ ok: false, error: "error" });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("getAdminDevice", () => {
  const ROW = {
    id: 7,
    name: "Galaxy S23",
    slug: "galaxy-s23",
    image_url: `${PREFIX}catalog/placeholders/phone.png`,
    is_active: true,
    release_year: 2023,
    brand: { name: "Samsung", slug: "samsung" },
    category: { name: "Phones", slug: "phone" },
    variants: [
      { id: 12, label: "8 GB / 256 GB", base_buy_price: "30000.00", is_active: true, products: [{ count: 1 }] },
      { id: 11, label: "8 GB / 128 GB", base_buy_price: "26000.00", is_active: false, products: [{ count: 2 }] },
    ],
  };

  it("maps the device with variants cheapest first", async () => {
    fake.respond("devices", { data: ROW });
    expect(await getAdminDevice(7)).toEqual({
      id: 7,
      name: "Galaxy S23",
      imageUrl: ROW.image_url,
      hasPlaceholder: true,
      isActive: true,
      releaseYear: 2023,
      brandName: "Samsung",
      categoryName: "Phones",
      sellHref: "/sell/phone/samsung/galaxy-s23",
      productCount: 3,
      variants: [
        { id: 11, label: "8 GB / 128 GB", price: 26000, isActive: false },
        { id: 12, label: "8 GB / 256 GB", price: 30000, isActive: true },
      ],
    });
    expect(callArgs(fake.queriesFor("devices")[0], "eq")).toEqual(["id", 7]);
  });

  it("returns null when missing, on error or for a malformed row", async () => {
    fake.respond("devices", { data: null });
    expect(await getAdminDevice(7)).toBeNull();
    fake.respond("devices", { error: DB_ERROR });
    expect(await getAdminDevice(7)).toBeNull();
    fake.respond("devices", { data: { ...ROW, brand: null } });
    expect(await getAdminDevice(7)).toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("setVariantPrices", () => {
  it("sends only prices for the device", async () => {
    fake.respond("rpc:admin_set_variant_prices", { data: 2 });
    const prices = [
      { variant_id: 11, price: 27000 },
      { variant_id: 12, price: 31000 },
    ];
    expect(await setVariantPrices(7, prices)).toEqual({ ok: true, updated: 2 });
    expect(callArgs(fake.queriesFor("rpc:admin_set_variant_prices")[0], "rpc")).toEqual([{ p_device_id: 7, p_prices: prices }]);
  });

  it("reports failures", async () => {
    fake.respond("rpc:admin_set_variant_prices", { error: DB_ERROR });
    expect(await setVariantPrices(7, [])).toEqual({ ok: false });
    fake.respond("rpc:admin_set_variant_prices", { data: "x" });
    expect(await setVariantPrices(7, [])).toEqual({ ok: false });
  });
});
