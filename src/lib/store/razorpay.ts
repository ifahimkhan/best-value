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

export type RefundResult = { ok: true; refundId: string } | { ok: false; status: number };

interface RefundInput {
  paymentId: string;
  amountPaise: number;
  /** Our order number; lets staff match the refund in the Razorpay dashboard. */
  receipt: string;
}

function basicAuth(keys: RazorpayKeys): string {
  return `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`;
}

/** A pending or processed refund this order already made, e.g. when a retry is rejected. */
async function findEarlierRefund(input: RefundInput, keys: RazorpayKeys, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`https://api.razorpay.com/v1/payments/${input.paymentId}/refunds`, {
      headers: { Authorization: basicAuth(keys) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const items = typeof body === "object" && body !== null ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) return null;
    const match = items.find(
      (item): item is { id: string } =>
        typeof item === "object" &&
        item !== null &&
        item.receipt === input.receipt &&
        item.status !== "failed" &&
        typeof item.id === "string",
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Full or partial refund of a captured payment. The idempotency key and the
 * receipt lookup make a double click or retry return the first refund
 * instead of failing or refunding twice.
 */
export async function refundRazorpayPayment(input: RefundInput, keys: RazorpayKeys, fetchImpl: typeof fetch = fetch): Promise<RefundResult> {
  // payment_ref comes from our database, but it is placed in a URL path, so keep it strict
  if (!/^pay_[A-Za-z0-9]{1,40}$/.test(input.paymentId)) return { ok: false, status: 0 };
  try {
    const response = await fetchImpl(`https://api.razorpay.com/v1/payments/${input.paymentId}/refund`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(keys),
        "Content-Type": "application/json",
        "X-Refund-Idempotency": `refund-${input.receipt}`,
      },
      body: JSON.stringify({ amount: input.amountPaise, receipt: input.receipt }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const earlier = response.status === 400 ? await findEarlierRefund(input, keys, fetchImpl) : null;
      return earlier ? { ok: true, refundId: earlier } : { ok: false, status: response.status };
    }
    const body: unknown = await response.json();
    const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
    return typeof id === "string" ? { ok: true, refundId: id } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
