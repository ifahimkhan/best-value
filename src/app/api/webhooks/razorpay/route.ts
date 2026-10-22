import { z } from "zod";
import { razorpayConfig } from "@/lib/store/payments";
import { markStoreOrderPaid } from "@/lib/store/queries";
import { verifyWebhookSignature } from "@/lib/store/razorpay";

// Razorpay webhook: the source of truth for payments, in case the customer
// closes the tab before the checkout callback reaches us. Configure it in
// the Razorpay dashboard for the payment.captured and order.paid events.

const MAX_BODY_BYTES = 64 * 1024;
const HANDLED_EVENTS = new Set(["payment.captured", "order.paid"]);

const eventSchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string(),
            order_id: z.string(),
            amount: z.number().int().nonnegative(),
            status: z.string().optional(),
            currency: z.string().optional(),
          }),
        })
        .optional(),
    })
    .optional(),
});

const json = (body: object, status: number) => Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
  const config = razorpayConfig();
  if (!config) return json({ error: "payments not configured" }, 503);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), config.webhookSecret)) {
    return json({ error: "invalid signature" }, 400);
  }

  let parsed: z.infer<typeof eventSchema>;
  try {
    const result = eventSchema.safeParse(JSON.parse(raw));
    if (!result.success) return json({ ok: true, ignored: true }, 200);
    parsed = result.data;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const payment = parsed.payload?.payment?.entity;
  const isCapturedInr =
    payment && (payment.status ?? "captured") === "captured" && (payment.currency ?? "INR") === "INR";
  if (!HANDLED_EVENTS.has(parsed.event) || !payment || !isCapturedInr) return json({ ok: true, ignored: true }, 200);

  const result = await markStoreOrderPaid(payment.order_id, payment.id, payment.amount);
  // A 5xx makes Razorpay retry later; everything else is final
  if (result === "error") return json({ error: "retry" }, 500);
  return json({ ok: true, result }, 200);
}
