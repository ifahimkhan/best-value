import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ razorpayConfig: vi.fn(), markStoreOrderPaid: vi.fn() }));
vi.mock("@/lib/store/payments", () => ({ razorpayConfig: mocks.razorpayConfig }));
vi.mock("@/lib/store/queries", () => ({ markStoreOrderPaid: mocks.markStoreOrderPaid }));

import { POST } from "./route";

const SECRET = "whsec";

function request(body: object, secret = SECRET): Request {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": signature },
  });
}

const captured = {
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_1", order_id: "order_rzp1", amount: 1180000, status: "captured" } } },
};

describe("Razorpay webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.razorpayConfig.mockReturnValue({ keyId: "k", keySecret: "s", webhookSecret: SECRET });
    mocks.markStoreOrderPaid.mockResolvedValue("paid");
  });

  it("marks the order paid for a captured payment", async () => {
    const response = await POST(request(captured));
    expect(response.status).toBe(200);
    expect(mocks.markStoreOrderPaid).toHaveBeenCalledWith("order_rzp1", "pay_1", 1180000);
  });

  it("also handles order.paid", async () => {
    await POST(request({ ...captured, event: "order.paid" }));
    expect(mocks.markStoreOrderPaid).toHaveBeenCalled();
  });

  it("ignores payments that are not captured or not in INR", async () => {
    const failed = { event: "payment.captured", payload: { payment: { entity: { ...captured.payload.payment.entity, status: "failed" } } } };
    const usd = { event: "payment.captured", payload: { payment: { entity: { ...captured.payload.payment.entity, currency: "USD" } } } };
    await POST(request(failed));
    await POST(request(usd));
    expect(mocks.markStoreOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies by byte length", async () => {
    const big = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body: "é".repeat(40 * 1024),
      headers: { "x-razorpay-signature": "00" },
    });
    expect((await POST(big)).status).toBe(413);
  });

  it("rejects a bad signature", async () => {
    const response = await POST(request(captured, "wrong"));
    expect(response.status).toBe(400);
    expect(mocks.markStoreOrderPaid).not.toHaveBeenCalled();
  });

  it("acknowledges events it does not handle", async () => {
    const response = await POST(request({ event: "refund.created", payload: {} }));
    expect(response.status).toBe(200);
    expect(mocks.markStoreOrderPaid).not.toHaveBeenCalled();
  });

  it("returns 503 when payments are not configured", async () => {
    mocks.razorpayConfig.mockReturnValue(null);
    expect((await POST(request(captured))).status).toBe(503);
  });

  it("asks Razorpay to retry when the database call fails", async () => {
    mocks.markStoreOrderPaid.mockResolvedValue("error");
    expect((await POST(request(captured))).status).toBe(500);
  });
});
