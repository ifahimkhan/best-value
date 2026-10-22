"use client";

import Script from "next/script";
import { useState, useTransition } from "react";
import { confirmPayment } from "@/app/checkout/actions";
import { BRAND } from "@/lib/brand";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: () => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

interface RazorpayPayButtonProps {
  keyId: string;
  orderNo: string;
  gatewayOrderId: string;
  amountPaise: number;
  amountLabel: string;
  prefill: { name: string; email: string; contact: string };
}

const PAID_PENDING =
  "Payment received. We're confirming your order, which can take a minute. Check My account shortly.";

export function RazorpayPayButton({ keyId, orderNo, gatewayOrderId, amountPaise, amountLabel, prefill }: RazorpayPayButtonProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();

  function handleSuccess(response: RazorpayResponse) {
    startConfirm(async () => {
      try {
        // On success confirmPayment redirects; it only returns on failure
        const result = await confirmPayment({
          orderNo,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        if (result?.error) setError(result.error);
      } catch {
        // The payment went through; the webhook will confirm the order
        setError(PAID_PENDING);
      }
    });
  }

  function openCheckout() {
    if (!window.Razorpay) {
      setError("The payment window could not load. Please check your connection and try again.");
      return;
    }
    setError(null);
    const checkout = new window.Razorpay({
      key: keyId,
      order_id: gatewayOrderId,
      amount: amountPaise,
      currency: "INR",
      name: BRAND.name,
      description: `Order ${orderNo}`,
      prefill,
      theme: { color: "#0f7a4d" },
      handler: handleSuccess,
    });
    checkout.on("payment.failed", () => setError("The payment did not go through. You have not been charged; please try again."));
    checkout.open();
  }

  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <button
        type="button"
        onClick={openCheckout}
        disabled={!ready || confirming}
        className="rounded-lg bg-brand px-8 py-3 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60"
      >
        {confirming ? "Confirming payment…" : `Pay ${amountLabel}`}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
