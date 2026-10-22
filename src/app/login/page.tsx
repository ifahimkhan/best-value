import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { safeNextPath } from "@/lib/validation/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: `Log in | ${BRAND.name}` };

async function LoginContent({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-brand-soft px-3 py-2 text-sm">
          That sign-in link has expired or was already used. Open it in the same browser you asked for it in, or
          request a new one below.
        </p>
      )}
      <LoginForm next={safeNextPath(typeof next === "string" ? next : null)} />
    </>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">Log in or sign up</h1>
      <p className="mt-2 mb-8 text-muted">We&apos;ll send you a one-time code. No password needed.</p>
      <Suspense fallback={<div className="h-40" />}>
        <LoginContent {...props} />
      </Suspense>
    </section>
  );
}
