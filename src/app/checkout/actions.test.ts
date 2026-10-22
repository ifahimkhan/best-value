import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  readCart: vi.fn(),
  writeCart: vi.fn(),
  razorpayConfig: vi.fn(),
  getPricedProducts: vi.fn(),
  createStoreOrder: vi.fn(),
  attachGatewayOrder: vi.fn(),
  cancelStoreOrder: vi.fn(),
  getMyPayableOrder: vi.fn(),
  markStoreOrderPaid: vi.fn(),
  createRazorpayOrder: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/store/cart-cookie", () => ({ readCart: mocks.readCart, writeCart: mocks.writeCart }));
vi.mock("@/lib/store/payments", () => ({ razorpayConfig: mocks.razorpayConfig }));
vi.mock("@/lib/store/queries", () => ({
  getPricedProducts: mocks.getPricedProducts,
  createStoreOrder: mocks.createStoreOrder,
  attachGatewayOrder: mocks.attachGatewayOrder,
  cancelStoreOrder: mocks.cancelStoreOrder,
  getMyPayableOrder: mocks.getMyPayableOrder,
  markStoreOrderPaid: mocks.markStoreOrderPaid,
}));
vi.mock("@/lib/store/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/razorpay")>()),
  createRazorpayOrder: mocks.createRazorpayOrder,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { confirmPayment, placeOrder } from "./actions";

const CONFIG = { keyId: "rzp_test", keySecret: "secret", webhookSecret: "whsec" };
const PRODUCT = { id: A, sku: "SKU-A", title: "Phone", slug: "phone", price: 11800, gstRate: 18, hsnCode: "8517", stock: 2, image: null };

function checkoutForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  Object.entries({
    fullName: "Asha Rao",
    phone: "9876543210",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    gstin: "",
    expectedTotal: "1180000",
    ...overrides,
  }).forEach(([k, v]) => data.set(k, v));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue({ id: "user-1", fullName: "Asha", email: "a@example.com", phone: null });
  mocks.razorpayConfig.mockReturnValue(CONFIG);
  mocks.readCart.mockResolvedValue([{ productId: A, qty: 1 }]);
  mocks.getPricedProducts.mockResolvedValue([PRODUCT]);
  mocks.createStoreOrder.mockResolvedValue({ ok: true, orderNo: "BV-O-000001" });
  mocks.createRazorpayOrder.mockResolvedValue({ ok: true, orderId: "order_rzp1" });
  mocks.attachGatewayOrder.mockResolvedValue(true);
});

describe("placeOrder", () => {
  it("is refused while online payment is not configured", async () => {
    mocks.razorpayConfig.mockReturnValue(null);
    expect((await placeOrder({}, checkoutForm())).error).toMatch(/not available/);
    expect(mocks.createStoreOrder).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    expect((await placeOrder({}, checkoutForm())).error).toMatch(/log in/);
  });

  it("returns field errors", async () => {
    const result = await placeOrder({}, checkoutForm({ pincode: "x" }));
    expect(result.fieldErrors?.pincode).toBeDefined();
  });

  it("creates the order and the Razorpay order, then sends the customer to pay", async () => {
    await expect(placeOrder({}, checkoutForm())).rejects.toThrow("REDIRECT:/checkout/pay/BV-O-000001");
    expect(mocks.createStoreOrder).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", total: 11800 }),
      [expect.objectContaining({ product_id: A, unit_price: 11800, qty: 1 })],
      expect.any(Object),
    );
    expect(mocks.createRazorpayOrder).toHaveBeenCalledWith({ amountPaise: 1180000, receipt: "BV-O-000001" }, CONFIG);
    expect(mocks.attachGatewayOrder).toHaveBeenCalledWith("BV-O-000001", "order_rzp1");
  });

  it("explains stock or price changes from the database", async () => {
    mocks.createStoreOrder.mockResolvedValue({ ok: false, reason: "stock_or_price_changed" });
    expect((await placeOrder({}, checkoutForm())).error).toMatch(/changed/);
  });

  it("releases the order when the gateway fails", async () => {
    mocks.createRazorpayOrder.mockResolvedValue({ ok: false, status: 500 });
    expect((await placeOrder({}, checkoutForm())).error).toBeDefined();
    expect(mocks.attachGatewayOrder).not.toHaveBeenCalled();
    expect(mocks.cancelStoreOrder).toHaveBeenCalledWith("BV-O-000001");
  });

  it("releases the order when linking the gateway order fails", async () => {
    mocks.attachGatewayOrder.mockResolvedValue(false);
    expect((await placeOrder({}, checkoutForm())).error).toBeDefined();
    expect(mocks.cancelStoreOrder).toHaveBeenCalledWith("BV-O-000001");
  });

  it("explains the hourly order limit", async () => {
    mocks.createStoreOrder.mockResolvedValue({ ok: false, reason: "rate_limited" });
    expect((await placeOrder({}, checkoutForm())).error).toMatch(/many orders/);
  });
});

describe("confirmPayment", () => {
  const signature = createHmac("sha256", CONFIG.keySecret).update("order_rzp1|pay_1").digest("hex");
  const proof = { orderNo: "BV-O-000001", razorpayOrderId: "order_rzp1", razorpayPaymentId: "pay_1", razorpaySignature: signature };

  beforeEach(() => {
    mocks.getMyPayableOrder.mockResolvedValue({
      orderNo: "BV-O-000001",
      total: 11800,
      status: "pending_payment",
      paymentStatus: "pending",
      gatewayOrderId: "order_rzp1",
    });
    mocks.markStoreOrderPaid.mockResolvedValue("paid");
  });

  it("marks the order paid, empties the cart and shows the order", async () => {
    await expect(confirmPayment(proof)).rejects.toThrow("REDIRECT:/account/orders/BV-O-000001?new=1");
    expect(mocks.markStoreOrderPaid).toHaveBeenCalledWith("order_rzp1", "pay_1", 1180000);
    expect(mocks.writeCart).toHaveBeenCalledWith([]);
  });

  it("keeps the cart and shows the refund notice when the item sold out", async () => {
    mocks.markStoreOrderPaid.mockResolvedValue("needs_refund");
    await expect(confirmPayment(proof)).rejects.toThrow("REDIRECT:/account/orders/BV-O-000001");
    expect(mocks.writeCart).not.toHaveBeenCalled();
  });

  it("does not confirm an amount mismatch", async () => {
    mocks.markStoreOrderPaid.mockResolvedValue("amount_mismatch");
    expect((await confirmPayment(proof)).error).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects a bad signature", async () => {
    expect((await confirmPayment({ ...proof, razorpaySignature: "00" })).error).toBeDefined();
    expect(mocks.markStoreOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects a gateway order that belongs to another order", async () => {
    expect((await confirmPayment({ ...proof, razorpayOrderId: "order_other" })).error).toBeDefined();
    expect(mocks.markStoreOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects orders the customer cannot see", async () => {
    mocks.getMyPayableOrder.mockResolvedValue(null);
    expect((await confirmPayment(proof)).error).toBeDefined();
  });

  it("rejects malformed input", async () => {
    expect((await confirmPayment({ ...proof, orderNo: "x" })).error).toBeDefined();
  });
});
