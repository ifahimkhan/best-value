import Link from "next/link";
import { formatInr } from "@/lib/brand";
import type { DeviceSummary } from "@/lib/catalog/schemas";
import { DeviceImage } from "./DeviceImage";

interface DeviceGridProps {
  devices: readonly DeviceSummary[];
  showBrand?: boolean;
  emptyMessage?: string;
}

export function DeviceGrid({ devices, showBrand = false, emptyMessage = "No models found." }: DeviceGridProps) {
  if (devices.length === 0) return <p className="text-muted">{emptyMessage}</p>;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {devices.map((device) => {
        const title = showBrand ? `${device.brandName} ${device.name}` : device.name;
        return (
          <li key={device.id}>
            <Link
              href={device.href}
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition hover:border-brand hover:shadow-sm"
            >
              <DeviceImage src={device.imageUrl} alt={title} sizes="(min-width: 1024px) 20vw, 45vw" />
              <p className="text-sm font-semibold">{title}</p>
              {device.maxPrice !== null && (
                <p className="mt-auto text-xs text-muted">
                  Get up to <span className="font-semibold text-brand">{formatInr(device.maxPrice)}</span>
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
