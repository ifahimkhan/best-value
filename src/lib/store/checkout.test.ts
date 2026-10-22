import { describe, expect, it } from "vitest";
import { buildStoreOrder, parseCheckoutForm, priceCart, type PricedProduct } from "./checkout";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const PRODUCTS: PricedProduct[] = [
  { id: A, sku: "SKU-A", title: "iPhone 14 128GB", slug: "iphone-14", price: 11800, gstRate: 18, hsnCode: "8517", stock: 3, image: null },
  { id: B, sku: "SKU-B", title: "Case", slug: "case", price: 99.99, gstRate: 18, hsnCode: null, stock: 0, image: null },
];

const ADDRESS = {
  fullName: "Asha Rao",
  phone: "+919876543210",
  line1: "12 MG Road",
  line2: null,
  landmark: null,
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

describe("priceCart", () => {
  it("prices available lines and flags problems", () => {
    const priced = priceCart(
      [
        { productId: A, qty: 2 },
        { productId: B, qty: 1 },
        { productId: "33333333-3333-4333-8333-333333333333", qty: 1 },
      ],
      PRODUCTS,
    );
    expect(priced.lines.map((l) => [l.product?.sku ?? null, l.problem])).toEqual([
      ["SKU-A", null],
      ["SKU-B", "out_of_stock"],
      [null, "unavailable"],
    ]);
    expect(priced.totals).toEqual({ taxable: 2000000, tax: 360000, total: 2360000 });
    expect(priced.canCheckout).toBe(false);
  });

  it("flags quantities above stock", () => {
    const priced = priceCart([{ productId: A, qty: 4 }], PRODUCTS);
    expect(priced.lines[0].problem).toBe("low_stock");
    expect(priced.canCheckout).toBe(false);
  });

  it("allows checkout when every line is fine", () => {
    expect(priceCart([{ productId: A, qty: 1 }], PRODUCTS).canCheckout).toBe(true);
    expect(priceCart([], PRODUCTS).canCheckout).toBe(false);
  });
});

describe("parseCheckoutForm", () => {
  const valid = {
    fullName: "Asha Rao",
    phone: "9876543210",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    gstin: "",
    expectedTotal: "1180000",
  };

  it("parses address, optional GSTIN and expected total", () => {
    const result = parseCheckoutForm(valid);
    expect(result).toMatchObject({ success: true, data: { gstin: null, expectedTotalPaise: 1180000 } });
    const withGstin = parseCheckoutForm({ ...valid, gstin: "29abcde1234f1z5" });
    expect(withGstin.success && withGstin.data.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("rejects a malformed GSTIN", () => {
    const result = parseCheckoutForm({ ...valid, gstin: "12345" });
    expect(!result.success && result.fieldErrors.gstin).toBeTruthy();
  });
});

describe("buildStoreOrder", () => {
  const checkout = { address: ADDRESS, gstin: null, expectedTotalPaise: 1180000 };

  it("builds the order and item snapshots from server prices", () => {
    const result = buildStoreOrder({ userId: "u1", cart: [{ productId: A, qty: 1 }], products: PRODUCTS, checkout });
    expect(result).toEqual({
      ok: true,
      order: {
        user_id: "u1",
        subtotal: 10000,
        gst_amount: 1800,
        shipping_fee: 0,
        total: 11800,
        shipping_address: ADDRESS,
        buyer_gstin: null,
      },
      items: [{ product_id: A, sku: "SKU-A", title: "iPhone 14 128GB", hsn_code: "8517", gst_rate: 18, unit_price: 11800, qty: 1 }],
      totalPaise: 1180000,
    });
  });

  it("rejects carts with problems", () => {
    const result = buildStoreOrder({ userId: "u1", cart: [{ productId: B, qty: 1 }], products: PRODUCTS, checkout });
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects an empty cart", () => {
    expect(buildStoreOrder({ userId: "u1", cart: [], products: PRODUCTS, checkout })).toMatchObject({ ok: false });
  });

  it("rejects when the total changed since the customer reviewed it", () => {
    const result = buildStoreOrder({
      userId: "u1",
      cart: [{ productId: A, qty: 1 }],
      products: [{ ...PRODUCTS[0], price: 12000 }],
      checkout,
    });
    expect(!result.ok && result.error).toMatch(/total has changed to ₹12,000/);
  });
});
