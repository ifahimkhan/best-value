import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

async function AccountDetails() {
  const user = await requireUser("/account");
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-[8rem_1fr]">
      <dt className="text-muted">Name</dt>
      <dd>{user.fullName ?? "Not set"}</dd>
      <dt className="text-muted">Mobile</dt>
      <dd>{user.phone ?? "Not set"}</dd>
      <dt className="text-muted">Email</dt>
      <dd>{user.email ?? "Not set"}</dd>
    </dl>
  );
}

export default function AccountPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">My account</h1>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
        <AccountDetails />
      </Suspense>
      <p className="mt-6 text-sm text-muted">Your sell requests and store orders will show here.</p>
    </section>
  );
}
