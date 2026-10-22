"use client";

import { useActionState, useState } from "react";
import { bookPickup, type BookingState } from "@/app/sell/actions";
import { PICKUP_SLOTS } from "@/lib/sell/slots";

export interface PickupDateOption {
  value: string;
  label: string;
}

interface PickupFormProps {
  variantId: number;
  answersJson: string;
  expectedPrice: number;
  dates: readonly PickupDateOption[];
  defaultName: string;
  defaultPhone: string;
}

const INITIAL_STATE: BookingState = {};
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand aria-[invalid=true]:border-danger";

interface FieldProps {
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "text" | "email";
  maxLength?: number;
}

function Field({ name, label, error, optional, ...input }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </span>
      <input name={name} required={!optional} aria-invalid={Boolean(error)} className={INPUT_CLASS} {...input} />
      {error && <span className="mt-1 block text-sm text-danger">{error}</span>}
    </label>
  );
}

export function PickupForm({ variantId, answersJson, expectedPrice, dates, defaultName, defaultPhone }: PickupFormProps) {
  const [state, formAction, pending] = useActionState(bookPickup, INITIAL_STATE);
  const [payoutMethod, setPayoutMethod] = useState<"upi" | "bank" | "cash">("upi");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="answers" value={answersJson} />
      <input type="hidden" name="expectedPrice" value={expectedPrice} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Pickup address</legend>
        <Field name="fullName" label="Full name" autoComplete="name" defaultValue={defaultName} error={errors.fullName} />
        <Field name="phone" label="Mobile number" autoComplete="tel" inputMode="tel" defaultValue={defaultPhone} error={errors.phone} />
        <Field name="line1" label="House no. and street" autoComplete="address-line1" error={errors.line1} />
        <Field name="line2" label="Area" optional autoComplete="address-line2" error={errors.line2} />
        <Field name="landmark" label="Landmark" optional error={errors.landmark} />
        <Field name="city" label="City" autoComplete="address-level2" error={errors.city} />
        <Field name="state" label="State" autoComplete="address-level1" error={errors.state} />
        <Field name="pincode" label="Pincode" autoComplete="postal-code" inputMode="numeric" maxLength={6} error={errors.pincode} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">Pickup time</legend>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <select name="pickupDate" required className={INPUT_CLASS} aria-invalid={Boolean(errors.pickupDate)}>
            {dates.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Time slot</span>
          <select name="pickupSlot" required className={INPUT_CLASS} aria-invalid={Boolean(errors.pickupSlot)}>
            {PICKUP_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot.replace("-", " to ")}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-semibold">How should we pay you?</legend>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {(["upi", "bank", "cash"] as const).map((method) => (
            <label
              key={method}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                payoutMethod === method ? "border-brand bg-brand-soft" : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="payoutMethod"
                value={method}
                checked={payoutMethod === method}
                onChange={() => setPayoutMethod(method)}
                className="sr-only"
              />
              {method === "upi" ? "UPI" : method === "bank" ? "Bank transfer" : "Cash"}
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {payoutMethod === "upi" && <Field name="upiId" label="UPI ID" error={errors.upiId} />}
          {payoutMethod === "bank" && (
            <>
              <Field name="accountName" label="Account holder name" error={errors.accountName} />
              <Field name="accountNumber" label="Account number" inputMode="numeric" error={errors.accountNumber} />
              <Field name="ifsc" label="IFSC code" maxLength={11} error={errors.ifsc} />
            </>
          )}
          {payoutMethod === "cash" && <p className="text-sm text-muted">Our agent pays you in cash after checking the device.</p>}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {errors.answers && <p className="text-sm text-danger">{errors.answers}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-6 py-3 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Booking…" : "Book free pickup"}
      </button>
    </form>
  );
}
