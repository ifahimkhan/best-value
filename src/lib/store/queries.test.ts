import { beforeEach, describe, expect, it, vi } from "vitest";
import { allCalls, callArgs } from "@/test/fake-supabase";
import type { StoreOrderItemRow, StoreOrderRow } from "./checkout";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const catalog = vi.hoisted(() => ({ getBrand: vi.fn(), getCategory: vi.fn() }));
const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
const cache = vi.hoisted(() => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cache);
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/lib/catalog/queries", () => catalog);
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));

const q = await import("./queries");

const PRODUCT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DB_ERROR = { code: "500", message: "boom" };

const SUMMARY_ROW = {
  id: PRODUCT_ID,
  title: "iPhone 13",
  slug: "iphone-13",
  condition: "refurbished_good",
  mrp: "59999.00",
  price: "41999.00",
  stock: 3,
  images: ["http://insecure.example/a.jpg", "https://cdn.example/b.jpg"],
  brand: { name: "Apple", slug: "apple" },
};

const DETAIL_ROW = {
  ...SUMMARY_ROW,
  sku: "IP13-128-BLK",
  description: "Good condition",
  gst_rate: "18",
  hsn_code: "8517",
  category: { name: "Phones", slug: "phones" },
};

const PRICED_ROW = {
  id: PRODUCT_ID,
  sku: "IP13-128-BLK",
  title: "iPhone 13",
  slug: "iphone-13",
  price: "41999.00",
  gst_rate: "18",
  hsn_code: "8517",
  stock: 2,
  images: ["https://cdn.example/b.jpg"],
};

const ITEM_ROW = { sku: "IP13-128-BLK", title: "iPhone 13", hsn_code: "8517", gst_rate: 18, unit_price: "41999", qty: 2 };
const ORDER_ROW = {
  order_no: "BV-O-000123",
  status: "paid",
  payment_status: "captured",
  subtotal: "83998",
  gst_amount: "12813.25",
  shipping_fee: "0",
  total: "83998",
  created_at: "2026-10-22T10:00:00Z",
  items: [ITEM_ROW],
};
const ADDRESS = {
  fullName: "Asha Rao",
  phone: "9876543210",
  line1: "12 MG Road",
  line2: null,
  landmark: null,
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};
const ORDER_DETAIL_ROW = {
  ...ORDER_ROW,
  buyer_gstin: null,
  payment_ref: "pay_123",
  tracking_carrier: "Delhivery",
  tracking_number: "DL123",
  shipping_address: ADDRESS,
};

const BASE_PARAMS = { category: null, brand: null, condition: null, sort: "featured", page: 1 } as const;

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("listProducts", () => {
  it("parses rows and returns the exact count", async () => {
    fake.respond("products", { data: [SUMMARY_ROW, { id: 1 }], count: 41 });
    const page = await q.listProducts(BASE_PARAMS);
    expect(page.total).toBe(41);
    expect(page.items).toEqual([
      {
        id: PRODUCT_ID,
        title: "iPhone 13",
        slug: "iphone-13",
        condition: "refurbished_good",
        mrp: 59999,
        price: 41999,
        inStock: true,
        image: "https://cdn.example/b.jpg",
        brandName: "Apple",
      },
    ]);
    expect(cache.cacheTag).toHaveBeenCalledWith(q.PRODUCTS_TAG);
    expect(cache.cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("uses featured ordering with a stable id tiebreak and the first page range", async () => {
    await q.listProducts(BASE_PARAMS);
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "select")).toEqual([expect.stringContaining("brand:brands(name, slug)"), { count: "exact" }]);
    expect(allCalls(query, "eq")).toEqual([]);
    expect(allCalls(query, "order")).toEqual([
      ["stock", { ascending: false }],
      ["created_at", { ascending: false }],
      ["id"],
    ]);
    expect(callArgs(query, "range")).toEqual([0, 23]);
  });

  it.each([
    ["price_asc", ["price", { ascending: true }]],
    ["price_desc", ["price", { ascending: false }]],
    ["newest", ["created_at", { ascending: false }]],
  ] as const)("orders by %s", async (sort, expected) => {
    await q.listProducts({ ...BASE_PARAMS, sort });
    expect(allCalls(fake.queriesFor("products")[0], "order")).toEqual([expected, ["id"]]);
  });

  it("resolves category and brand slugs to id filters and pages the range", async () => {
    catalog.getCategory.mockResolvedValue({ id: 4, name: "Phones", slug: "phones" });
    catalog.getBrand.mockResolvedValue({ id: 9, name: "Apple", slug: "apple" });
    await q.listProducts({ category: "phones", brand: "apple", condition: "new", sort: "featured", page: 3 });
    expect(catalog.getCategory).toHaveBeenCalledWith("phones");
    expect(catalog.getBrand).toHaveBeenCalledWith("apple");
    const [query] = fake.queriesFor("products");
    expect(allCalls(query, "eq")).toEqual([
      ["category_id", 4],
      ["brand_id", 9],
      ["condition", "new"],
    ]);
    expect(callArgs(query, "range")).toEqual([48, 71]);
  });

  it.each([
    ["category", { category: "nope" }],
    ["brand", { brand: "nope" }],
  ])("returns nothing without querying for an unknown %s", async (_label, filter) => {
    catalog.getCategory.mockResolvedValue(null);
    catalog.getBrand.mockResolvedValue(null);
    expect(await q.listProducts({ ...BASE_PARAMS, ...filter })).toEqual({ items: [], total: 0 });
    expect(fake.queriesFor("products")).toHaveLength(0);
  });

  it("falls back to an empty page, logs, and caches briefly on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await q.listProducts({ ...BASE_PARAMS, page: 2 })).toEqual({ items: [], total: 0 });
    expect(log.error).toHaveBeenCalledWith("Failed to list products", DB_ERROR, { categoryId: null, brandId: null, page: 2 });
    expect(cache.cacheLife).toHaveBeenCalledWith("seconds");
  });

  it("treats a missing count as zero", async () => {
    fake.respond("products", { data: [] });
    expect(await q.listProducts(BASE_PARAMS)).toEqual({ items: [], total: 0 });
  });
});

describe("getProduct", () => {
  it("rejects an invalid slug without querying", async () => {
    expect(await q.getProduct("Bad Slug!")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("parses the product detail by slug", async () => {
    fake.respond("products", { data: DETAIL_ROW });
    const product = await q.getProduct("iphone-13");
    expect(product).toMatchObject({
      sku: "IP13-128-BLK",
      gstRate: 18,
      stock: 3,
      images: ["https://cdn.example/b.jpg"],
      categoryName: "Phones",
      categorySlug: "phones",
      brandSlug: "apple",
    });
    const [query] = fake.queriesFor("products");
    expect(callArgs(query, "eq")).toEqual(["slug", "iphone-13"]);
    expect(callArgs(query, "maybeSingle")).toEqual([]);
    expect(cache.cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("returns null when no product matches", async () => {
    expect(await q.getProduct("iphone-13")).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await q.getProduct("iphone-13")).toBeNull();
    expect(log.error).toHaveBeenCalledWith("Failed to load product", DB_ERROR, { slug: "iphone-13" });
    expect(cache.cacheLife).toHaveBeenCalledWith("seconds");
  });
});

describe("getPricedProducts", () => {
  it("skips the query for an empty id list", async () => {
    expect(await q.getPricedProducts([])).toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });

  it("fetches by id and parses prices", async () => {
    fake.respond("products", { data: [PRICED_ROW] });
    const ids = [PRODUCT_ID];
    expect(await q.getPricedProducts(ids)).toEqual([
      {
        id: PRODUCT_ID,
        sku: "IP13-128-BLK",
        title: "iPhone 13",
        slug: "iphone-13",
        price: 41999,
        gstRate: 18,
        hsnCode: "8517",
        stock: 2,
        image: "https://cdn.example/b.jpg",
      },
    ]);
    expect(callArgs(fake.queriesFor("products")[0], "in")).toEqual(["id", ids]);
  });

  it("returns an empty list and logs on error", async () => {
    fake.respond("products", { error: DB_ERROR });
    expect(await q.getPricedProducts([PRODUCT_ID])).toEqual([]);
    expect(log.error).toHaveBeenCalledWith("Failed to price cart", DB_ERROR, { count: 1 });
  });
});

describe("createStoreOrder", () => {
  const order: StoreOrderRow = {
    user_id: "user-1",
    subtotal: 41999,
    gst_amount: 6406.63,
    shipping_fee: 0,
    total: 41999,
    shipping_address: ADDRESS,
    buyer_gstin: null,
  };
  const items: StoreOrderItemRow[] = [
    { product_id: PRODUCT_ID, sku: "IP13-128-BLK", title: "iPhone 13", hsn_code: "8517", gst_rate: 18, unit_price: 41999, qty: 1 },
  ];
  const limits = { maxPending: 3, maxPerHour: 5, expiryMinutes: 30 };

  it("passes order, items and limits to the rpc and returns the order number", async () => {
    fake.respond("rpc:create_store_order", { data: "BV-O-000124" });
    expect(await q.createStoreOrder(order, items, limits)).toEqual({ ok: true, orderNo: "BV-O-000124" });
    expect(callArgs(fake.queriesFor("rpc:create_store_order")[0], "rpc")).toEqual([
      { p_order: order, p_items: items, p_max_pending: 3, p_max_per_hour: 5, p_expiry_minutes: 30 },
    ]);
  });

  it.each(["rate_limited", "too_many_pending", "stock_or_price_changed"] as const)(
    "maps the %s exception to its reason without logging",
    async (code) => {
      fake.respond("rpc:create_store_order", { error: { code: "P0001", message: code } });
      expect(await q.createStoreOrder(order, items, limits)).toEqual({ ok: false, reason: code });
      expect(log.error).not.toHaveBeenCalled();
    },
  );

  it("reports and logs an unknown error", async () => {
    const error = { code: "P0001", message: "something_else" };
    fake.respond("rpc:create_store_order", { error });
    expect(await q.createStoreOrder(order, items, limits)).toEqual({ ok: false, reason: "error" });
    expect(log.error).toHaveBeenCalledWith("Failed to create store order", error, { userId: "user-1" });
  });

  it("does not treat a known message with another code as known", async () => {
    fake.respond("rpc:create_store_order", { error: { code: "42501", message: "rate_limited" } });
    expect(await q.createStoreOrder(order, items, limits)).toEqual({ ok: false, reason: "error" });
  });

  it("reports an error when the rpc returns a non-string", async () => {
    fake.respond("rpc:create_store_order", { data: null });
    expect(await q.createStoreOrder(order, items, limits)).toEqual({ ok: false, reason: "error" });
  });
});

describe("attachGatewayOrder", () => {
  it("fills only an empty gateway slot and succeeds for exactly one row", async () => {
    fake.respond("orders", { data: [{ order_no: "BV-O-000124" }] });
    expect(await q.attachGatewayOrder("BV-O-000124", "order_RZP1")).toBe(true);
    const [query] = fake.queriesFor("orders");
    expect(callArgs(query, "update")).toEqual([{ gateway_order_id: "order_RZP1" }]);
    expect(callArgs(query, "eq")).toEqual(["order_no", "BV-O-000124"]);
    expect(callArgs(query, "is")).toEqual(["gateway_order_id", null]);
  });

  it.each([
    ["no row updated", { data: [] }, null],
    ["null data", { data: null }, null],
    ["a database error", { error: DB_ERROR }, DB_ERROR],
  ])("fails and logs on %s", async (_label, response, logged) => {
    fake.respond("orders", response);
    expect(await q.attachGatewayOrder("BV-O-000124", "order_RZP1")).toBe(false);
    expect(log.error).toHaveBeenCalledWith("Failed to attach gateway order", logged, { orderNo: "BV-O-000124" });
  });
});

describe("cancelStoreOrder", () => {
  it("calls the cancel rpc", async () => {
    await q.cancelStoreOrder("BV-O-000124");
    expect(callArgs(fake.queriesFor("rpc:cancel_store_order")[0], "rpc")).toEqual([{ p_order_no: "BV-O-000124" }]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("logs a failure without throwing", async () => {
    fake.respond("rpc:cancel_store_order", { error: DB_ERROR });
    await expect(q.cancelStoreOrder("BV-O-000124")).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith("Failed to cancel store order", DB_ERROR, { orderNo: "BV-O-000124" });
  });
});

describe("markStoreOrderPaid", () => {
  it("sends the payment to the rpc and returns paid", async () => {
    fake.respond("rpc:mark_store_order_paid", { data: "paid" });
    expect(await q.markStoreOrderPaid("order_RZP1", "pay_1", 4199900)).toBe("paid");
    expect(callArgs(fake.queriesFor("rpc:mark_store_order_paid")[0], "rpc")).toEqual([
      { p_gateway_order_id: "order_RZP1", p_payment_id: "pay_1", p_amount_paise: 4199900 },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(["already_paid", "not_found"] as const)("passes %s through quietly", async (result) => {
    fake.respond("rpc:mark_store_order_paid", { data: result });
    expect(await q.markStoreOrderPaid("order_RZP1", "pay_1", 100)).toBe(result);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(["needs_refund", "amount_mismatch", "already_refunded"] as const)("flags %s for staff", async (result) => {
    fake.respond("rpc:mark_store_order_paid", { data: result });
    expect(await q.markStoreOrderPaid("order_RZP1", "pay_1", 100)).toBe(result);
    expect(log.warn).toHaveBeenCalledWith("Store payment needs staff attention", { gatewayOrderId: "order_RZP1", result });
  });

  it("returns error and logs when the rpc fails", async () => {
    fake.respond("rpc:mark_store_order_paid", { error: DB_ERROR });
    expect(await q.markStoreOrderPaid("order_RZP1", "pay_1", 100)).toBe("error");
    expect(log.error).toHaveBeenCalledWith("Failed to mark store order paid", DB_ERROR, { gatewayOrderId: "order_RZP1" });
  });

  it("returns error for an unexpected result", async () => {
    fake.respond("rpc:mark_store_order_paid", { data: "weird" });
    expect(await q.markStoreOrderPaid("order_RZP1", "pay_1", 100)).toBe("error");
    expect(log.error).toHaveBeenCalledWith("Unexpected mark-paid result", null, { gatewayOrderId: "order_RZP1" });
  });
});

describe("getMyPayableOrder", () => {
  it("rejects a malformed order number without querying", async () => {
    expect(await q.getMyPayableOrder("BV-O-12")).toBeNull();
    expect(await q.getMyPayableOrder("1 OR 1=1")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("maps the payable row", async () => {
    fake.respond("orders", {
      data: { order_no: "BV-O-000124", total: "41999.00", status: "pending_payment", payment_status: "pending", gateway_order_id: null },
    });
    expect(await q.getMyPayableOrder("BV-O-000124")).toEqual({
      orderNo: "BV-O-000124",
      total: 41999,
      status: "pending_payment",
      paymentStatus: "pending",
      gatewayOrderId: null,
    });
    expect(callArgs(fake.queriesFor("orders")[0], "eq")).toEqual(["order_no", "BV-O-000124"]);
  });

  it("returns null when not found", async () => {
    expect(await q.getMyPayableOrder("BV-O-000124")).toBeNull();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("returns null and logs on error", async () => {
    fake.respond("orders", { error: DB_ERROR });
    expect(await q.getMyPayableOrder("BV-O-000124")).toBeNull();
    expect(log.error).toHaveBeenCalledWith("Failed to load order for payment", DB_ERROR, { orderNo: "BV-O-000124" });
  });
});

describe("listMyStoreOrders", () => {
  it("returns the newest 50 orders parsed", async () => {
    fake.respond("orders", { data: [ORDER_ROW, { order_no: 5 }] });
    const orders = await q.listMyStoreOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderNo: "BV-O-000123", status: "paid", total: 83998, itemCount: 2 });
    const [query] = fake.queriesFor("orders");
    expect(callArgs(query, "order")).toEqual(["created_at", { ascending: false }]);
    expect(callArgs(query, "limit")).toEqual([50]);
  });

  it("returns an empty list and logs on error", async () => {
    fake.respond("orders", { error: DB_ERROR });
    expect(await q.listMyStoreOrders()).toEqual([]);
    expect(log.error).toHaveBeenCalledWith("Failed to list store orders", DB_ERROR);
  });
});

describe("getMyStoreOrder", () => {
  it("rejects a malformed order number without querying", async () => {
    expect(await q.getMyStoreOrder("BV-X-000123")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("parses the order detail with tracking", async () => {
    fake.respond("orders", { data: ORDER_DETAIL_ROW });
    expect(await q.getMyStoreOrder("BV-O-000123")).toMatchObject({
      orderNo: "BV-O-000123",
      paymentRef: "pay_123",
      address: ADDRESS,
      tracking: { carrier: "Delhivery", number: "DL123" },
    });
    expect(callArgs(fake.queriesFor("orders")[0], "eq")).toEqual(["order_no", "BV-O-000123"]);
  });

  it("returns null when not found", async () => {
    expect(await q.getMyStoreOrder("BV-O-000123")).toBeNull();
  });

  it("returns null and logs on error", async () => {
    fake.respond("orders", { error: DB_ERROR });
    expect(await q.getMyStoreOrder("BV-O-000123")).toBeNull();
    expect(log.error).toHaveBeenCalledWith("Failed to load store order", DB_ERROR, { orderNo: "BV-O-000123" });
  });
});
