import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductInput } from "./form";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" }) }));

const { fake, storage } = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  const { vi: hoistedVi } = await import("vitest");
  return {
    fake: createFakeSupabase(),
    storage: {
      from: hoistedVi.fn(),
      upload: hoistedVi.fn(),
      remove: hoistedVi.fn(),
      getPublicUrl: hoistedVi.fn(),
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: storage.from } }),
}));

const { logger } = await import("@/lib/logger");
const { allCalls, callArgs } = await import("@/test/fake-supabase");
const {
  UUID_PATTERN,
  deleteProduct,
  getAdminProduct,
  imagePrefix,
  insertProduct,
  listAdminProducts,
  listProductOptions,
  removeUploadedImages,
  updateProduct,
  uploadProductImages,
} = await import("./queries");

const ID = "3f1c2a8e-5b7d-4c1e-9a2f-0d4e6b8c1a3f";
const PREFIX = "https://db.example.com/storage/v1/object/public/product-images/";
const DB_ERROR = { message: "connection reset" };

const LIST_ROW = {
  id: ID,
  sku: "IP15-128",
  title: "iPhone 15 128 GB",
  price: "54999.00",
  stock: 3,
  is_active: true,
  source: "manual",
  images: [`${PREFIX}manual/a.webp`],
  supplier: null,
};

const DETAIL_ROW = {
  id: ID,
  sku: "IP15-128",
  slug: "iphone-15-128gb",
  title: "iPhone 15 128 GB",
  description: null,
  category_id: 10,
  brand_id: 1,
  condition: "refurbished_good",
  mrp: "69900",
  price: "54999.00",
  gst_rate: "18",
  hsn_code: "8517",
  stock: 3,
  images: [],
  is_active: true,
  source: "feed",
  supplier_sku: "SUP-1",
  locked_fields: ["stock", "unknown", "price"],
  updated_at: "2026-10-22T10:00:00Z",
  supplier: { id: 4, name: "Acme" },
};

const INPUT: ProductInput = {
  title: "iPhone 15 128 GB",
  sku: "IP15-128",
  slug: "iphone-15-128gb",
  description: null,
  category_id: 10,
  brand_id: 1,
  condition: "new",
  mrp: null,
  price: 54999,
  gst_rate: 18,
  hsn_code: null,
  stock: 3,
  is_active: true,
  images: [],
  locked_fields: [],
};

const PARAMS = { q: null, source: "all", status: "all", page: 1 } as const;

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  storage.from.mockReturnValue({ upload: storage.upload, remove: storage.remove, getPublicUrl: storage.getPublicUrl });
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `${PREFIX}${path}` } }));
});

describe("imagePrefix and UUID_PATTERN", () => {
  it("builds the public bucket prefix from the Supabase URL", () => {
    expect(imagePrefix()).toBe(PREFIX);
  });

  it("matches only UUIDs", () => {
    expect(UUID_PATTERN.test(ID)).toBe(true);
    expect(UUID_PATTERN.test("not-a-uuid")).toBe(false);
  });
});

describe("listAdminProducts", () => {
  it("maps rows and returns the exact count for the first page", async () => {
    fake.respond("products", { data: [LIST_ROW, { ...LIST_ROW, images: [], supplier: { name: "Acme" } }], count: 42 });
    const result = await listAdminProducts(PARAMS);
    expect(result).toEqual({
      total: 42,
      items: [
        {
          id: ID,
          sku: "IP15-128",
          title: "iPhone 15 128 GB",
          price: 54999,
          stock: 3,
          isActive: true,
          source: "manual",
          image: `${PREFIX}manual/a.webp`,
          supplierName: null,
        },
        expect.objectContaining({ image: null, supplierName: "Acme" }),
      ],
    });
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "select")?.[1]).toEqual({ count: "exact" });
    expect(allCalls(query, "eq")).toEqual([]);
    expect(allCalls(query, "or")).toEqual([]);
    expect(callArgs(query, "order")).toEqual(["updated_at", { ascending: false }]);
    expect(callArgs(query, "range")).toEqual([0, 29]);
  });

  it("applies search, source, status and page filters", async () => {
    await listAdminProducts({ q: "iphone", source: "feed", status: "active", page: 3 });
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "or")).toEqual(["title.ilike.%iphone%,sku.ilike.%iphone%"]);
    expect(allCalls(query, "eq")).toEqual([
      ["source", "feed"],
      ["is_active", true],
    ]);
    expect(callArgs(query, "range")).toEqual([60, 89]);
  });

  it.each([
    ["inactive", ["is_active", false]],
    ["out_of_stock", ["stock", 0]],
  ] as const)("filters the %s status", async (status, filter) => {
    await listAdminProducts({ ...PARAMS, status });
    expect(allCalls(fake.queriesFor("products")[0], "eq")).toEqual([filter]);
  });

  it("returns an empty page and logs on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await listAdminProducts(PARAMS)).toEqual({ items: [], total: 0 });
    expect(logger.error).toHaveBeenCalledWith("listAdminProducts failed", DB_ERROR);
  });

  it("returns an empty page when rows are malformed", async () => {
    fake.respond("products", { data: [{ id: 1 }], count: 1 });
    expect(await listAdminProducts(PARAMS)).toEqual({ items: [], total: 0 });
  });

  it("treats a missing count as zero", async () => {
    fake.respond("products", { data: [] });
    expect(await listAdminProducts(PARAMS)).toEqual({ items: [], total: 0 });
  });
});

describe("getAdminProduct", () => {
  it("rejects a non-UUID id without querying", async () => {
    expect(await getAdminProduct("123")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("parses the product and keeps only known locked fields in canonical order", async () => {
    fake.respond("products", { data: DETAIL_ROW });
    const product = await getAdminProduct(ID);
    expect(product).toMatchObject({ id: ID, mrp: 69900, price: 54999, gst_rate: 18, supplier: { id: 4, name: "Acme" } });
    expect(product?.locked_fields).toEqual(["price", "stock"]);
    expect(callArgs(fake.queriesFor("products")[0], "eq")).toEqual(["id", ID]);
  });

  it("returns null when missing or malformed", async () => {
    fake.respond("products", { data: null }).respond("products", { data: { ...DETAIL_ROW, condition: "broken" } });
    expect(await getAdminProduct(ID)).toBeNull();
    expect(await getAdminProduct(ID)).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await getAdminProduct(ID)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("getAdminProduct failed", DB_ERROR, { id: ID });
  });
});

describe("listProductOptions", () => {
  it("returns brands and categories ordered by name", async () => {
    fake.respond("brands", { data: [{ id: 1, name: "Apple" }] });
    fake.respond("categories", { data: [{ id: 10, name: "Mobile Phones" }] });
    expect(await listProductOptions()).toEqual({
      brands: [{ id: 1, name: "Apple" }],
      categories: [{ id: 10, name: "Mobile Phones" }],
    });
    expect(callArgs(fake.queriesFor("brands")[0], "order")).toEqual(["name"]);
    expect(callArgs(fake.queriesFor("categories")[0], "order")).toEqual(["name"]);
  });

  it("falls back to empty lists and logs when a query fails", async () => {
    fake.respond("brands", { data: [{ id: 1, name: "Apple" }] });
    fake.respond("categories", { error: DB_ERROR });
    expect(await listProductOptions()).toEqual({ brands: [{ id: 1, name: "Apple" }], categories: [] });
    expect(logger.error).toHaveBeenCalledWith("listProductOptions failed", DB_ERROR);
  });
});

describe("insertProduct", () => {
  it("inserts a manual product and returns its id", async () => {
    fake.respond("products", { data: { id: ID } });
    expect(await insertProduct(INPUT)).toEqual({ ok: true, id: ID });
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "insert")).toEqual([{ ...INPUT, source: "manual" }]);
    expect(callArgs(query, "select")).toEqual(["id"]);
  });

  it.each([
    ["products_sku_key", "duplicate_sku"],
    ["products_slug_key", "duplicate_slug"],
    ["products_pkey", "error"],
  ])("maps a unique violation on %s to %s", async (constraint, expected) => {
    fake.respond("products", { error: { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` } });
    expect(await insertProduct(INPUT)).toEqual({ ok: false, error: expected });
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps other errors to a generic failure", async () => {
    fake.respond("products", { error: { code: "42501", message: "products_sku_key" } });
    expect(await insertProduct(INPUT)).toEqual({ ok: false, error: "error" });
  });
});

describe("updateProduct", () => {
  const loadedAt = "2026-10-22T10:00:00Z";

  it("updates only if the row is unchanged since it was loaded", async () => {
    fake.respond("products", { data: { id: ID } });
    expect(await updateProduct(ID, INPUT, loadedAt)).toEqual({ ok: true, id: ID });
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "update")).toEqual([INPUT]);
    expect(allCalls(query, "eq")).toEqual([
      ["id", ID],
      ["updated_at", loadedAt],
    ]);
  });

  it("reports stale when no row matched", async () => {
    fake.respond("products", { data: null });
    expect(await updateProduct(ID, INPUT, loadedAt)).toEqual({ ok: false, error: "stale" });
  });

  it("maps write errors and logs", async () => {
    const error = { code: "23505", message: "products_slug_key" };
    fake.respond("products", { error });
    expect(await updateProduct(ID, INPUT, loadedAt)).toEqual({ ok: false, error: "duplicate_slug" });
    expect(logger.error).toHaveBeenCalledWith("updateProduct failed", error, { id: ID });
  });
});

describe("deleteProduct", () => {
  it("returns the deleted product's images", async () => {
    fake.respond("products", { data: { images: ["a.webp", "b.webp"] } });
    expect(await deleteProduct(ID)).toEqual(["a.webp", "b.webp"]);
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "delete")).toEqual([]);
    expect(callArgs(query, "eq")).toEqual(["id", ID]);
  });

  it("returns [] when the images column is malformed", async () => {
    fake.respond("products", { data: { images: null } });
    expect(await deleteProduct(ID)).toEqual([]);
  });

  it("returns null when nothing was deleted", async () => {
    fake.respond("products", { data: null });
    expect(await deleteProduct(ID)).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns null and logs on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await deleteProduct(ID)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("deleteProduct failed", DB_ERROR, { id: ID });
  });
});

describe("uploadProductImages", () => {
  const file = { body: Buffer.from("img"), contentType: "image/webp", extension: "webp" };

  it("uploads each file under manual/ and returns public URLs", async () => {
    const urls = await uploadProductImages([file, file]);
    expect(storage.from).toHaveBeenCalledWith("product-images");
    expect(urls).toHaveLength(2);
    for (const url of urls) expect(url).toMatch(new RegExp(`^${PREFIX}manual/[0-9a-f-]{36}\\.webp$`));
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^manual\/.+\.webp$/), file.body, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  });

  it("removes already uploaded files and throws when an upload fails", async () => {
    storage.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "quota" } });
    await expect(uploadProductImages([file, file])).rejects.toThrow("Image upload failed");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    const [paths] = storage.remove.mock.calls[0] as [string[]];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^manual\/.+\.webp$/);
  });
});

describe("removeUploadedImages", () => {
  it("removes only manual uploads from this project's bucket", async () => {
    await removeUploadedImages([`${PREFIX}manual/a.webp`, `${PREFIX}feed/b.webp`, "https://other.example.com/manual/c.webp"]);
    expect(storage.remove).toHaveBeenCalledWith(["manual/a.webp"]);
  });

  it("does nothing when there is nothing to remove", async () => {
    await removeUploadedImages([`${PREFIX}feed/b.webp`]);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("logs but does not throw when removal fails", async () => {
    storage.remove.mockResolvedValueOnce({ error: DB_ERROR });
    await expect(removeUploadedImages([`${PREFIX}manual/a.webp`])).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("removeUploadedImages failed", DB_ERROR);
  });
});
