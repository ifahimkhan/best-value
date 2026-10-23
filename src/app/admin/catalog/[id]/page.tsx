import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeviceImageForm } from "@/components/admin/catalog/DeviceImageForm";
import { VariantPriceForm } from "@/components/admin/catalog/VariantPriceForm";
import { requireAdmin } from "@/lib/auth/session";
import { parseDeviceId } from "@/lib/catalog/admin-device-list";
import { getAdminDevice } from "@/lib/catalog/admin-device-write";

export const metadata = { title: "Edit device", robots: { index: false } };

interface Notices {
  created: boolean;
  photoFailed: boolean;
}

async function EditDevice({ rawId, notices }: { rawId: string; notices: Notices }) {
  await requireAdmin();
  const id = parseDeviceId(rawId);
  const device = id === null ? null : await getAdminDevice(id);
  if (!device) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/catalog" className="text-sm text-brand underline">
          Device catalog
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{device.name}</h1>
        <p className="text-sm text-muted">
          {device.brandName} · {device.categoryName}
          {device.releaseYear && ` · ${device.releaseYear}`}
          {device.isActive ? (
            <>
              {" · "}
              <Link href={device.sellHref} className="text-brand underline">
                View sell page
              </Link>
            </>
          ) : (
            " · hidden from the site"
          )}
        </p>
      </div>
      {notices.created && (
        <p role="status" className="rounded-lg bg-brand-soft p-3 text-sm">
          Device added.{notices.photoFailed && " The photo could not be used, so the placeholder is showing. Try another photo below."}
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold">Photo{device.hasPlaceholder && <span className="ml-2 text-xs font-normal text-muted">placeholder</span>}</h2>
        <DeviceImageForm deviceId={device.id} deviceName={device.name} imageUrl={device.imageUrl} />
      </div>
      <VariantPriceForm deviceId={device.id} variants={device.variants} />
    </div>
  );
}

export default function EditDevicePage({ params, searchParams }: PageProps<"/admin/catalog/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
      {Promise.all([params, searchParams]).then(([{ id }, query]) => (
        <EditDevice rawId={id} notices={{ created: query.created === "1", photoFailed: query.photo === "failed" }} />
      ))}
    </Suspense>
  );
}
