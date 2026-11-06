"use client";

import { useActionState } from "react";
import { savePhone, skipPhone, type PhoneState } from "./actions";

interface PhoneFormProps {
  next: string;
}

const INITIAL_STATE: PhoneState = {};

export function PhoneForm({ next }: PhoneFormProps) {
  const [state, formAction, pending] = useActionState(savePhone, INITIAL_STATE);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Mobile number (optional)</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            placeholder="98765 43210"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"
          />
        </label>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>

      <form action={skipPhone}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="w-full text-sm text-muted underline">
          Skip for now
        </button>
      </form>
    </div>
  );
}
