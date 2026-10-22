import { Suspense } from "react";
import { SellOrderList } from "@/components/sell/SellOrderList";
import { StoreOrderList } from "@/components/store/StoreOrderList";
import { requireUser } from "@/lib/auth/session";
import { listMySellOrders } from "@/lib/sell/queries";
import { listMyStoreOrders } from "@/lib/store/queries";

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

async function SellOrders() {
  await requireUser("/account");
  const orders = await listMySellOrders();
  return <SellOrderList orders={orders} />;
}

async function StoreOrders() {
  await requireUser("/account");
  const orders = await listMyStoreOrders();
  return <StoreOrderList orders={orders} />;
}

export default function AccountPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">My account</h1>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
        <AccountDetails />
      </Suspense>
      <h2 className="mb-3 mt-10 text-lg font-semibold">My sell requests</h2>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-surface" />}>
        <SellOrders />
      </Suspense>
      <h2 className="mb-3 mt-10 text-lg font-semibold">My orders</h2>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-surface" />}>
        <StoreOrders />
      </Suspense>
    </section>
  );
}
