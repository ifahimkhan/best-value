"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { subscribeNewsletterAction, type NewsletterState } from "@/app/newsletter/actions";
import { Honeypot } from "./Honeypot";

export function NewsletterForm() {
  const [state, run, pending] = useActionState<NewsletterState, FormData>(subscribeNewsletterAction, {});
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  };
  return (
    <div aria-live="polite">
      {state.done ? <p className="text-sm">Thanks! You are on the list.</p> : <SignupForm state={state} pending={pending} onSubmit={onSubmit} />}
    </div>
  );
}

interface SignupFormProps {
  state: NewsletterState;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function SignupForm({ state, pending, onSubmit }: SignupFormProps) {
  return (
    <form onSubmit={onSubmit} className="relative space-y-2" noValidate>
      <label htmlFor="newsletter-email" className="block text-sm font-semibold">
        Price drops and new stock
      </label>
      <div className="flex gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "newsletter-error" : undefined}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "…" : "Subscribe"}
        </button>
      </div>
      <Honeypot />
      {state.error && (
        <p id="newsletter-error" role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      <p className="text-xs text-muted">Occasional emails only. We never share your address. To leave the list, contact us.</p>
    </form>
  );
}
