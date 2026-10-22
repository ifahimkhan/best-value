"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import type { AdminActionState } from "@/app/admin/sell-orders/actions";

type Action = (prev: AdminActionState, form: FormData) => Promise<AdminActionState>;

interface ActionFormProps {
  action: Action;
  orderNo: string;
  submitLabel: string;
  tone?: "primary" | "danger" | "plain";
  hidden?: Record<string, string>;
  children?: ReactNode;
}

const TONES = {
  primary: "bg-brand text-brand-contrast",
  danger: "border border-danger text-danger",
  plain: "border border-brand text-brand",
} as const;

export const FIELD_CLASS = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand";

/**
 * One staff action on an order. Submits by hand so typed values survive a
 * server-side error (React resets forms that use a form action).
 */
export function ActionForm({ action, orderNo, submitLabel, tone = "primary", hidden = {}, children }: ActionFormProps) {
  const [state, run, pending] = useActionState(action, {});
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  };
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="orderNo" value={orderNo} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${TONES[tone]}`}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <p role="status" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.done && <span>{state.done}</span>}
        </p>
      </div>
    </form>
  );
}
