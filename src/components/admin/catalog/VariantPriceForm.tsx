"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { saveVariantPricesAction, type PriceFormState } from "@/app/admin/catalog/actions";
import { INPUT_CLASS } from "@/components/admin/feeds/SupplierForm";
import type { AdminDeviceVariant } from "@/lib/catalog/admin-device-write";

interface VariantPriceFormProps {
  deviceId: number;
  variants: AdminDeviceVariant[];
}

/** Edits the base buy price of each variant. Nothing else about the device changes. */
export function VariantPriceForm({ deviceId, variants }: VariantPriceFormProps) {
  const [state, run, pending] = useActionState<PriceFormState, FormData>(saveVariantPricesAction, {});
  const errors = state.fieldErrors ?? {};

  // Submitting by hand keeps the typed prices when the server reports errors
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <input type="hidden" name="deviceId" value={deviceId} />
      <div>
        <h2 className="font-semibold">Buy prices</h2>
        <p className="text-xs text-muted">The price paid for each variant in perfect condition. Condition answers are deducted from it.</p>
      </div>
      <ul className="divide-y divide-border">
        {variants.map((v) => (
          <li key={v.id} className="py-2">
            <label className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-40 flex-1 font-medium">
                {v.label}
                {!v.isActive && <span className="ml-2 text-xs text-muted">hidden</span>}
              </span>
              <span className="flex items-center gap-1">
                ₹
                <input
                  name={`price-${v.id}`}
                  inputMode="decimal"
                  required
                  defaultValue={v.price}
                  aria-invalid={Boolean(errors[v.id])}
                  aria-label={`Buy price for ${v.label}`}
                  className={`${INPUT_CLASS} w-36`}
                />
              </span>
            </label>
            {errors[v.id] && <p className="mt-1 text-sm text-danger">{errors[v.id]}</p>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Saving…" : "Save prices"}
        </button>
        <p role="status" className="text-sm">
          {state.error ? <span className="text-danger">{state.error}</span> : state.done}
        </p>
      </div>
    </form>
  );
}
