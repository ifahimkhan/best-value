"use client";

import { saveSellNotesAction, transitionSellOrderAction } from "@/app/admin/sell-orders/actions";
import { SELL_NEXT } from "@/lib/admin/transitions";
import type { SellStatus } from "@/lib/sell/schemas";
import { ActionForm, FIELD_CLASS } from "./ActionForm";

interface SellOrderActionsProps {
  orderNo: string;
  status: SellStatus;
  quotedPrice: number;
  finalPrice: number | null;
  staff: { id: string; name: string }[];
  assignedTo: string | null;
  staffNotes: string | null;
}

const LABELS: Partial<Record<SellStatus, string>> = {
  pickup_assigned: "Mark agent assigned",
  quoted: "Back to booked",
  picked_up: "Mark device collected",
  inspected: "Record inspection",
  paid: "Mark paid",
};

function PriceField({ value }: { value: number }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Final price after inspection (₹)</span>
      <input name="finalPrice" required inputMode="decimal" defaultValue={value} className={FIELD_CLASS} />
    </label>
  );
}

function StepForm({ orderNo, to, quotedPrice, finalPrice }: { orderNo: string; to: SellStatus; quotedPrice: number; finalPrice: number | null }) {
  if (to === "cancelled") {
    return (
      <ActionForm action={transitionSellOrderAction} orderNo={orderNo} submitLabel="Cancel order" tone="danger" hidden={{ toStatus: to }}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Reason (the customer may see this)</span>
          <input name="cancelReason" required minLength={3} maxLength={300} className={FIELD_CLASS} />
        </label>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={transitionSellOrderAction} orderNo={orderNo} submitLabel={LABELS[to] ?? to} tone={to === "quoted" ? "plain" : "primary"} hidden={{ toStatus: to }}>
      {to === "inspected" && <PriceField value={finalPrice ?? quotedPrice} />}
      {to === "paid" && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Payout reference (UTR, UPI ref or cash receipt no.)</span>
          <input name="payoutRef" required maxLength={60} className={FIELD_CLASS} />
        </label>
      )}
    </ActionForm>
  );
}

export function SellOrderActions({ orderNo, status, quotedPrice, finalPrice, staff, assignedTo, staffNotes }: SellOrderActionsProps) {
  const steps = SELL_NEXT[status];
  return (
    <div className="space-y-4">
      {steps.length === 0 && <p className="text-sm text-muted">This order is closed.</p>}
      {steps.map((to) => (
        <StepForm key={to} orderNo={orderNo} to={to} quotedPrice={quotedPrice} finalPrice={finalPrice} />
      ))}
      {status === "inspected" && (
        <ActionForm action={transitionSellOrderAction} orderNo={orderNo} submitLabel="Correct final price" tone="plain" hidden={{ toStatus: "inspected" }}>
          <PriceField value={finalPrice ?? quotedPrice} />
        </ActionForm>
      )}
      <ActionForm action={saveSellNotesAction} orderNo={orderNo} submitLabel="Save notes" tone="plain">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Pickup agent</span>
          <select name="assignedTo" defaultValue={assignedTo ?? ""} className={FIELD_CLASS}>
            <option value="">Not assigned</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Staff notes (never shown to the customer)</span>
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={staffNotes ?? ""} className={FIELD_CLASS} />
        </label>
      </ActionForm>
    </div>
  );
}
