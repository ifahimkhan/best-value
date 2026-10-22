"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { sendContactMessageAction, type ContactState } from "@/app/contact/actions";
import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS } from "@/lib/content/forms";
import { Honeypot } from "./Honeypot";

const FIELD_ORDER = ["name", "email", "phone", "topic", "orderNo", "message"] as const;

const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand";

interface FieldProps {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}

function Field({ name, label, hint, error, children }: FieldProps) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(describedBy)}
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ContactForm() {
  const [state, run, pending] = useActionState<ContactState, FormData>(sendContactMessageAction, {});
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  // Move focus to the first problem, or to the confirmation, after each reply
  useEffect(() => {
    if (state.sent) {
      successRef.current?.focus();
      return;
    }
    const first = FIELD_ORDER.find((name) => state.errors?.[name]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }, [state]);
  // Submit by hand so typed values survive a validation error
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  };

  if (state.sent) {
    return (
      <div ref={successRef} tabIndex={-1} className="rounded-xl border border-border bg-surface p-6 outline-none">
        <p className="font-semibold">Thanks, your message is with us.</p>
        <p className="mt-1 text-sm text-muted">We will reply by email as soon as we can.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="relative space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Your name" error={errors.name}>
          {(d) => <input id="name" name="name" required maxLength={80} autoComplete="name" aria-describedby={d} aria-invalid={errors.name ? true : undefined} className={INPUT} />}
        </Field>
        <Field name="email" label="Email" error={errors.email}>
          {(d) => <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" aria-describedby={d} aria-invalid={errors.email ? true : undefined} className={INPUT} />}
        </Field>
        <Field name="phone" label="Mobile (optional)" error={errors.phone}>
          {(d) => <input id="phone" name="phone" type="tel" inputMode="tel" maxLength={16} autoComplete="tel" aria-describedby={d} aria-invalid={errors.phone ? true : undefined} className={INPUT} />}
        </Field>
        <Field name="topic" label="About" error={errors.topic}>
          {(d) => (
            <select id="topic" name="topic" required defaultValue="" aria-describedby={d} aria-invalid={errors.topic ? true : undefined} className={INPUT}>
              <option value="" disabled>
                Choose a topic
              </option>
              {CONTACT_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {CONTACT_TOPIC_LABELS[topic]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field name="orderNo" label="Order number (optional)" hint="Find it in your account, e.g. BV-O-000123" error={errors.orderNo}>
        {(d) => <input id="orderNo" name="orderNo" maxLength={24} aria-describedby={d} aria-invalid={errors.orderNo ? true : undefined} className={INPUT} />}
      </Field>
      <Field name="message" label="Message" error={errors.message}>
        {(d) => <textarea id="message" name="message" required rows={6} maxLength={2000} aria-describedby={d} aria-invalid={errors.message ? true : undefined} className={INPUT} />}
      </Field>
      <Honeypot />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Sending…" : "Send message"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <p className="text-xs text-muted">
        We use these details only to answer you. See our <Link href="/privacy-policy" className="underline">privacy policy</Link>.
      </p>
    </form>
  );
}
