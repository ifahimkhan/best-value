import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FeedPanel } from "@/components/admin/feeds/FeedPanel";
import { RunHistory } from "@/components/admin/feeds/RunHistory";
import { SupplierForm } from "@/components/admin/feeds/SupplierForm";
import { requireStaff } from "@/lib/auth/session";
import { FEED_FILE_ACCEPT } from "@/lib/feeds/constants";
import { getSupplier, listRecentRuns } from "@/lib/feeds/queries";

export const metadata = { title: "Supplier feed", robots: { index: false } };
// Imports run inside this page's server actions and can take minutes
export const maxDuration = 300;

async function SupplierContent({ rawId }: { rawId: string }) {
  await requireStaff();
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  const runs = await listRecentRuns(supplier.id);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/suppliers" className="text-sm text-brand underline">
          All suppliers
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{supplier.name}</h1>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <SupplierForm supplier={supplier} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Preview and import</h2>
        <FeedPanel supplierId={supplier.id} feedUrl={supplier.feedUrl} accept={FEED_FILE_ACCEPT[supplier.feedFormat]} mapping={supplier.mapping} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <RunHistory runs={runs} />
      </section>
    </div>
  );
}

export default function SupplierPage({ params }: PageProps<"/admin/suppliers/[id]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
      {params.then(({ id }) => (
        <SupplierContent rawId={id} />
      ))}
    </Suspense>
  );
}
