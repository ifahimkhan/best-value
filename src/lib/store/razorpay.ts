import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay over plain REST (no SDK). Server-only callers pass the keys in.
// Signatures are compared in constant time.

const ORDERS_URL = "https://api.razorpay.com/v1/orders";

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]+$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export interface PaymentProof {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Checkout handler response: signature = HMAC(order_id|payment_id, key secret). */
export function verifyPaymentSignature(proof: PaymentProof, keySecret: string): boolean {
  return safeEqualHex(hmacHex(`${proof.orderId}|${proof.paymentId}`, keySecret), proof.signature);
}

/** Webhook: signature = HMAC(raw body, webhook secret). Use the raw body, never re-serialised JSON. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature) return false;
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}

export type CreateOrderResult = { ok: true; orderId: string } | { ok: false; status: number };

interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
}

export async function createRazorpayOrder(
  input: CreateOrderInput,
  keys: RazorpayKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateOrderResult> {
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  try {
    const response = await fetchImpl(ORDERS_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body: unknown = await response.json();
    const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
    return typeof id === "string" ? { ok: true, orderId: id } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
