"use client";

import { useActionState } from "react";
import { loginAction, signInWithGoogle, type LoginState } from "./actions";

interface LoginFormProps {
  next: string;
}

const INITIAL_STATE: LoginState = { step: "identify", identifier: "" };

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const isVerify = state.step === "verify";

  return (
    <>
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

    {!isVerify && (
      <>
        <div className="my-6 flex items-center gap-3 text-xs uppercase text-muted">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 font-semibold hover:bg-brand-soft"
          >
            <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
              <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
        </form>
      </>
    )}
    </>
  );
}
