"use client";

import { useActionState } from "react";
import { placeOrder, type CheckoutState } from "@/app/checkout/actions";

interface CheckoutFormProps {
  expectedTotalPaise: number;
  totalLabel: string;
  defaultName: string;
  defaultPhone: string;
}

const INITIAL_STATE: CheckoutState = {};
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand aria-[invalid=true]:border-danger";

interface FieldProps {
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "text";
  maxLength?: number;
  hint?: string;
}

function Field({ name, label, error, optional, hint, ...input }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </span>
      <input name={name} required={!optional} aria-invalid={Boolean(error)} className={INPUT_CLASS} {...input} />
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-danger">{error}</span>}
    </label>
  );
}

export function CheckoutForm({ expectedTotalPaise, totalLabel, defaultName, defaultPhone }: CheckoutFormProps) {
  const [state, formAction, pending] = useActionState(placeOrder, INITIAL_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="expectedTotal" value={expectedTotalPaise} />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Delivery address</legend>
        <Field name="fullName" label="Full name" autoComplete="name" defaultValue={defaultName} error={errors.fullName} />
        <Field name="phone" label="Mobile number" autoComplete="tel" inputMode="tel" defaultValue={defaultPhone} error={errors.phone} />
        <Field name="line1" label="House no. and street" autoComplete="address-line1" error={errors.line1} />
        <Field name="line2" label="Area" optional autoComplete="address-line2" error={errors.line2} />
        <Field name="landmark" label="Landmark" optional error={errors.landmark} />
        <Field name="city" label="City" autoComplete="address-level2" error={errors.city} />
        <Field name="state" label="State" autoComplete="address-level1" error={errors.state} />
        <Field name="pincode" label="Pincode" autoComplete="postal-code" inputMode="numeric" maxLength={6} error={errors.pincode} />
      </fieldset>
      <fieldset>
        <legend className="mb-3 font-semibold">Business purchase</legend>
        <div className="sm:max-w-sm">
          <Field
            name="gstin"
            label="GSTIN"
            optional
            maxLength={15}
            error={errors.gstin}
            hint="Add your GSTIN to claim input tax credit. It is printed on your invoice."
          />
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-6 py-3 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Starting payment…" : `Pay ${totalLabel}`}
      </button>
    </form>
  );
}
