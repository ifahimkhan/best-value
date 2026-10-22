import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/session";

async function Dashboard() {
  await requireStaff();
  return (
    <p className="mt-2 text-muted">
      Sell orders, store orders, catalog and supplier feeds will be managed from here.
    </p>
  );
}

export default function AdminDashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Suspense fallback={<div className="mt-2 h-6 animate-pulse rounded bg-surface" />}>
        <Dashboard />
      </Suspense>
    </section>
  );
}
