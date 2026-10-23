import Link from "next/link";
import { Suspense } from "react";
import { NewDeviceForm } from "@/components/admin/catalog/NewDeviceForm";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminBrands, listAdminCategories } from "@/lib/catalog/admin-devices";

export const metadata = { title: "Add device", robots: { index: false } };

async function NewDevice() {
  await requireAdmin();
  const [categories, brands] = await Promise.all([listAdminCategories(), listAdminBrands()]);
  return <NewDeviceForm categories={categories} brands={brands} />;
}

export default function NewDevicePage() {
  return (
    <section className="space-y-6">
      <div>
        <Link href="/admin/catalog" className="text-sm text-brand underline">
          Device catalog
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Add device</h1>
        <p className="mt-1 text-sm text-muted">For newly released models. Customers can sell it as soon as it is saved, unless you untick “Show on the site now”.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        <NewDevice />
      </Suspense>
    </section>
  );
}
