"use client";

import { refundStoreOrderAction, transitionStoreOrderAction } from "@/app/admin/orders/actions";
import { storeActions } from "@/lib/admin/transitions";
import type { OrderStatus, PaymentStatus } from "@/lib/store/schemas";
import { ActionForm, FIELD_CLASS } from "./ActionForm";

interface StoreOrderActionsProps {
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalLabel: string;
  canRefundOnline: boolean;
}

const LABELS: Partial<Record<OrderStatus, string>> = {
  packed: "Mark packed",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
};

function RefundForms({ orderNo, totalLabel, canRefundOnline }: { orderNo: string; totalLabel: string; canRefundOnline: boolean }) {
  return (
    <>
      {canRefundOnline && (
        <ActionForm action={refundStoreOrderAction} orderNo={orderNo} submitLabel={`Refund ${totalLabel} via Razorpay`} tone="danger">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" required />
            Send the full amount back to the customer&apos;s payment method
          </label>
        </ActionForm>
      )}
      <ActionForm action={transitionStoreOrderAction} orderNo={orderNo} submitLabel="Record refund made elsewhere" tone="plain" hidden={{ toStatus: "refunded" }}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Refund reference (Razorpay refund id or bank UTR)</span>
          <input name="refundRef" required maxLength={60} className={FIELD_CLASS} />
        </label>
      </ActionForm>
    </>
  );
}

export function StoreOrderActions({ orderNo, status, paymentStatus, totalLabel, canRefundOnline }: StoreOrderActionsProps) {
  const steps = storeActions(status, paymentStatus);
  return (
    <div className="space-y-4">
      {steps.length === 0 && <p className="text-sm text-muted">No further steps for this order.</p>}
      {steps.map((to) => {
        if (to === "refunded") return <RefundForms key={to} orderNo={orderNo} totalLabel={totalLabel} canRefundOnline={canRefundOnline} />;
        if (to === "cancelled") {
          return (
            <ActionForm key={to} action={transitionStoreOrderAction} orderNo={orderNo} submitLabel={status === "shipped" ? "Cancel order (parcel returned)" : "Cancel order"} tone="danger" hidden={{ toStatus: to }}>
              <p className="text-sm text-muted">
                Items go back into stock.{paymentStatus === "captured" && " The order will then need a refund."}
              </p>
            </ActionForm>
          );
        }
        return (
          <ActionForm key={to} action={transitionStoreOrderAction} orderNo={orderNo} submitLabel={LABELS[to] ?? to} hidden={{ toStatus: to }}>
            {to === "shipped" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Courier</span>
                  <input name="trackingCarrier" maxLength={60} placeholder="e.g. Delhivery" className={FIELD_CLASS} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Tracking number</span>
                  <input name="trackingNumber" required pattern="[A-Za-z0-9\-]{4,40}" className={FIELD_CLASS} />
                </label>
              </div>
            )}
          </ActionForm>
        );
      })}
    </div>
  );
}
