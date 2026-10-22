import Link from "next/link";
import { Suspense } from "react";
import { SupplierForm } from "@/components/admin/feeds/SupplierForm";
import { requireStaff } from "@/lib/auth/session";
import { listSuppliers } from "@/lib/feeds/queries";

export const metadata = { title: "Supplier feeds", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function SupplierList() {
  await requireStaff();
  const suppliers = await listSuppliers();
  if (suppliers.length === 0) return <p className="text-sm text-muted">No suppliers yet. Add one below.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {suppliers.map((supplier) => (
        <li key={supplier.id}>
          <Link href={`/admin/suppliers/${supplier.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-brand-soft">
            <span className="font-medium">
              {supplier.name} {!supplier.isActive && <span className="text-sm font-normal text-muted">(inactive)</span>}
            </span>
            <span className="text-sm text-muted">
              {supplier.feedFormat.toUpperCase()}
              {supplier.scheduled && " · daily"}
              {" · "}
              {supplier.lastRunAt ? `last run ${dateFormat.format(new Date(supplier.lastRunAt))}` : "never run"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SuppliersPage() {
  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Supplier feeds</h1>
        <p className="mt-1 text-muted">Import store products from supplier files in CSV, Excel, JSON or XML.</p>
      </div>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface" />}>
        <SupplierList />
      </Suspense>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Add a supplier</h2>
        <SupplierForm />
      </div>
    </section>
  );
}
