import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRazorpayOrder, refundRazorpayPayment, verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";

const SECRET = "test_secret";
const sign = (payload: string, secret = SECRET) => createHmac("sha256", secret).update(payload).digest("hex");

describe("verifyPaymentSignature", () => {
  it("accepts a signature over order_id|payment_id", () => {
    const signature = sign("order_1|pay_1");
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature }, SECRET)).toBe(true);
  });

  it("rejects wrong, swapped or malformed signatures", () => {
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature: sign("order_1|pay_1") }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: sign("order_1|pay_1", "other") }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "zz" }, SECRET)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("checks the raw body", () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
  });
});

describe("createRazorpayOrder", () => {
  const keys = { keyId: "rzp_test_x", keySecret: SECRET };

  it("posts amount in paise with basic auth and returns the order id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order_9", amount: 1999 }), { status: 200 }));
    const result = await createRazorpayOrder({ amountPaise: 1999, receipt: "BV-O-000001" }, keys, fetchMock);
    expect(result).toEqual({ ok: true, orderId: "order_9" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`rzp_test_x:${SECRET}`).toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ amount: 1999, currency: "INR", receipt: "BV-O-000001" });
  });

  it("reports gateway errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await createRazorpayOrder({ amountPaise: 1, receipt: "r" }, keys, fetchMock)).toEqual({ ok: false, status: 401 });
  });

  it("reports network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await createRazorpayOrder({ amountPaise: 1, receipt: "r" }, keys, fetchMock)).toEqual({ ok: false, status: 0 });
  });
});

describe("refundRazorpayPayment", () => {
  const keys = { keyId: "rzp_test_x", keySecret: SECRET };

  it("refunds the amount in paise with an idempotency receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "rfnd_7", status: "processed" }), { status: 200 }));
    const result = await refundRazorpayPayment({ paymentId: "pay_ABC123", amountPaise: 11800, receipt: "BV-O-000001" }, keys, fetchMock);
    expect(result).toEqual({ ok: true, refundId: "rfnd_7" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/payments/pay_ABC123/refund");
    expect(JSON.parse(init.body)).toEqual({ amount: 11800, receipt: "BV-O-000001" });
  });

  it("refuses malformed payment ids without calling the gateway", async () => {
    const fetchMock = vi.fn();
    expect(await refundRazorpayPayment({ paymentId: "../orders", amountPaise: 1, receipt: "r" }, keys, fetchMock)).toEqual({ ok: false, status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports gateway errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    expect(await refundRazorpayPayment({ paymentId: "pay_X1", amountPaise: 1, receipt: "r" }, keys, fetchMock)).toEqual({ ok: false, status: 400 });
  });
});
