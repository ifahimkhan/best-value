import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { requireUser } from "@/lib/auth/session";
import { phonePromptUrl } from "@/lib/auth/phone-prompt";
import { safeNextPath } from "@/lib/validation/auth";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = { title: `Add your mobile number | ${BRAND.name}`, robots: { index: false } };

async function PhoneContent({ searchParams }: PageProps<"/auth/phone">) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(typeof next === "string" ? next : null);
  const user = await requireUser(phonePromptUrl(safeNext));
  return (
    <>
      <h1 className="text-2xl font-bold">{user.fullName ? `Welcome, ${user.fullName}` : "Welcome"}</h1>
      <p className="mt-2 mb-8 text-muted">
        Add your mobile number so we can reach you about your orders. This is optional — you can skip it.
      </p>
      <PhoneForm next={safeNext} />
    </>
  );
}

export default function PhonePage(props: PageProps<"/auth/phone">) {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-16">
      <Suspense fallback={<div className="h-40" />}>
        <PhoneContent {...props} />
      </Suspense>
    </section>
  );
}
