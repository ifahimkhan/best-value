import { describe, expect, it } from "vitest";
import { parsePricedProducts, parseProductDetail, parseProductSummaries, parseStoreOrderRow, parseStoreOrderRows } from "./schemas";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "SKU-A",
  title: "iPhone 14 128GB",
  slug: "iphone-14-128gb-good",
  description: "Checked and graded.",
  condition: "refurbished_good",
  mrp: "69900.00",
  price: "41999.00",
  gst_rate: "18.00",
  hsn_code: "8517",
  stock: 2,
  images: ["https://cdn.example.com/a.jpg", "javascript:alert(1)", "http://insecure.example.com/b.jpg"],
  category: { name: "Smartphones", slug: "phone" },
  brand: { name: "Apple", slug: "apple" },
};

describe("parseProductSummaries", () => {
  it("maps rows, coerces numbers and keeps only https images", () => {
    expect(parseProductSummaries([ROW, { id: 1 }])).toEqual([
      {
        id: ROW.id,
        title: "iPhone 14 128GB",
        slug: "iphone-14-128gb-good",
        condition: "refurbished_good",
        mrp: 69900,
        price: 41999,
        inStock: true,
        image: "https://cdn.example.com/a.jpg",
        brandName: "Apple",
      },
    ]);
  });

  it("drops MRP when it is not above the price", () => {
    expect(parseProductSummaries([{ ...ROW, mrp: "41999.00" }])[0].mrp).toBeNull();
  });
});

describe("parseProductDetail", () => {
  it("returns the full product", () => {
    expect(parseProductDetail(ROW)).toMatchObject({
      sku: "SKU-A",
      gstRate: 18,
      hsnCode: "8517",
      stock: 2,
      images: ["https://cdn.example.com/a.jpg"],
      categoryName: "Smartphones",
      categorySlug: "phone",
    });
    expect(parseProductDetail(null)).toBeNull();
  });
});

describe("parsePricedProducts", () => {
  it("maps rows used for pricing the cart", () => {
    expect(parsePricedProducts([ROW])).toEqual([
      {
        id: ROW.id,
        sku: "SKU-A",
        title: "iPhone 14 128GB",
        slug: "iphone-14-128gb-good",
        price: 41999,
        gstRate: 18,
        hsnCode: "8517",
        stock: 2,
        image: "https://cdn.example.com/a.jpg",
      },
    ]);
  });
});

const ORDER = {
  order_no: "BV-O-000001",
  status: "paid",
  payment_status: "captured",
  subtotal: "10000.00",
  gst_amount: "1800.00",
  shipping_fee: "0.00",
  total: "11800.00",
  created_at: "2026-10-22T06:00:00Z",
  items: [{ sku: "SKU-A", title: "iPhone 14", hsn_code: "8517", gst_rate: "18.00", unit_price: "11800.00", qty: 1 }],
};

describe("store order rows", () => {
  it("maps list rows", () => {
    expect(parseStoreOrderRows([ORDER])[0]).toMatchObject({ orderNo: "BV-O-000001", total: 11800, itemCount: 1 });
  });

  it("maps detail rows with address and GSTIN", () => {
    const detail = parseStoreOrderRow({
      ...ORDER,
      buyer_gstin: null,
      payment_ref: "pay_1",
      tracking_carrier: "Delhivery",
      tracking_number: "DL-12345",
      shipping_address: {
        fullName: "Asha",
        phone: "+919876543210",
        line1: "12 MG Road",
        line2: null,
        landmark: null,
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
      },
    });
    expect(detail).toMatchObject({ gstAmount: 1800, items: [{ unitPrice: 11800, gstRate: 18 }], address: { city: "Bengaluru" }, tracking: { carrier: "Delhivery", number: "DL-12345" } });
    expect(parseStoreOrderRow({ ...ORDER })).toBeNull();
  });
});
