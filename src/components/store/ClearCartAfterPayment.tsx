"use client";

import { useEffect } from "react";
import { clearCartAfterPayment } from "@/app/checkout/actions";

/** Shown on a paid order: empties the cart even if the webhook confirmed it. */
export function ClearCartAfterPayment({ orderNo }: { orderNo: string }) {
  useEffect(() => {
    clearCartAfterPayment(orderNo).catch(() => {
      // Not critical: the customer can empty the cart themselves
    });
  }, [orderNo]);
  return null;
}
