import "server-only";
import { storeEnv } from "@/lib/env";
import type { RazorpayKeys } from "./razorpay";

export interface RazorpayConfig extends RazorpayKeys {
  webhookSecret: string;
}

/** Razorpay settings, or null while online payment is not configured. */
export function razorpayConfig(): RazorpayConfig | null {
  const env = storeEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return null;
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET };
}

export interface SellerDetails {
  legalName: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
}

export function sellerDetails(): SellerDetails {
  const env = storeEnv();
  return {
    legalName: env.SELLER_LEGAL_NAME ?? null,
    gstin: env.SELLER_GSTIN ?? null,
    address: env.SELLER_ADDRESS ?? null,
    state: env.SELLER_STATE ?? null,
  };
}
