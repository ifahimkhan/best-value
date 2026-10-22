import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fake = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return createFakeSupabase();
});
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));

const { allCalls } = await import("@/test/fake-supabase");
const { resolveDevice } = await import("./resolve");

const CATEGORY = {
  id: 10,
  name: "Mobile Phones",
  slug: "mobile-phones",
  icon_url: null,
  can_sell: true,
  can_buy: true,
  coming_soon: false,
};
const BRAND = { id: 1, name: "Apple", slug: "apple", logo_url: null };
const DEVICE = {
  id: 100,
  name: "iPhone 15",
  slug: "iphone-15",
  image_url: null,
  brand: { name: "Apple", slug: "apple" },
  category: { name: "Mobile Phones", slug: "mobile-phones" },
  variants: [{ id: 1, label: "128 GB", slug: "128gb", base_buy_price: 42000 }],
};

function catalog(category: Partial<typeof CATEGORY> = {}) {
  fake.respond("categories", { data: [{ ...CATEGORY, ...category }] });
  fake.respond("brands", { data: [BRAND] });
}

beforeEach(() => {
  fake.reset();
});

describe("resolveDevice", () => {
  it("resolves category, brand and device slugs", async () => {
    catalog();
    fake.respond("devices", { data: DEVICE });
    const resolved = await resolveDevice("mobile-phones", "apple", "iphone-15");
    expect(resolved?.category).toMatchObject({ id: 10, slug: "mobile-phones" });
    expect(resolved?.brand).toMatchObject({ id: 1, slug: "apple" });
    expect(resolved?.device).toMatchObject({ id: 100, href: "/sell/mobile-phones/apple/iphone-15" });
    expect(allCalls(fake.queriesFor("devices")[0], "eq")).toEqual([
      ["category_id", 10],
      ["brand_id", 1],
      ["slug", "iphone-15"],
    ]);
  });

  it("returns null for an unknown category or brand without loading the device", async () => {
    catalog();
    expect(await resolveDevice("laptops", "apple", "iphone-15")).toBeNull();
    catalog();
    expect(await resolveDevice("mobile-phones", "nokia", "iphone-15")).toBeNull();
    expect(fake.queriesFor("devices")).toHaveLength(0);
  });

  it("returns null for categories that cannot be sold or are coming soon", async () => {
    catalog({ can_sell: false });
    expect(await resolveDevice("mobile-phones", "apple", "iphone-15")).toBeNull();
    catalog({ coming_soon: true });
    expect(await resolveDevice("mobile-phones", "apple", "iphone-15")).toBeNull();
    expect(fake.queriesFor("devices")).toHaveLength(0);
  });

  it("returns null when the device does not exist", async () => {
    catalog();
    fake.respond("devices", { data: null });
    expect(await resolveDevice("mobile-phones", "apple", "iphone-99")).toBeNull();
  });
});
