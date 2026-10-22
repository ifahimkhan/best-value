"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

interface LoginFormProps {
  next: string;
}

const INITIAL_STATE: LoginState = { step: "identify", identifier: "" };

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const isVerify = state.step === "verify";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {isVerify ? (
        <>
          <input type="hidden" name="identifier" value={state.identifier} />
          <p className="text-sm text-muted">
            {state.info} <span className="font-medium text-foreground">{state.identifier}</span>
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Verification code</span>
            <input
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 tracking-[0.5em] outline-none focus:border-brand"
            />
          </label>
        </>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Mobile number or email</span>
          <input
            name="identifier"
            defaultValue={state.identifier}
            autoComplete="username"
            required
            autoFocus
            placeholder="98765 43210"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"
          />
        </label>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        name="intent"
        value={isVerify ? "verify" : "send"}
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Please wait…" : isVerify ? "Verify and continue" : "Send code"}
      </button>

      {isVerify && (
        <button
          type="submit"
          name="intent"
          value="restart"
          formNoValidate
          className="w-full text-sm text-muted underline"
        >
          Use a different number or email
        </button>
      )}
    </form>
  );
}
