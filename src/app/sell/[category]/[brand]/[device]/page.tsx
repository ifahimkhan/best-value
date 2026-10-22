import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { DeviceImage } from "@/components/catalog/DeviceImage";
import { VariantPicker } from "@/components/catalog/VariantPicker";
import { resolveDevice } from "@/lib/catalog/resolve";

const NEXT_STEPS = [
  "Answer a few questions about the condition",
  "See your final price and book a free pickup",
  "Get paid when our agent collects the device",
] as const;

interface DeviceContentProps {
  categorySlug: string;
  brandSlug: string;
  deviceSlug: string;
}

async function DeviceContent({ categorySlug, brandSlug, deviceSlug }: DeviceContentProps) {
  const resolved = await resolveDevice(categorySlug, brandSlug, deviceSlug);
  if (!resolved) notFound();
  const { category, brand, device } = resolved;
  const title = `${brand.name} ${device.name}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sell", href: "/sell" },
          { label: category.name, href: `/sell/${category.slug}` },
          { label: brand.name, href: `/sell/${category.slug}/${brand.slug}` },
          { label: device.name },
        ]}
      />
      <div className="grid gap-8 md:grid-cols-[18rem_1fr]">
        <DeviceImage src={device.imageUrl} alt={title} sizes="(min-width: 768px) 18rem, 90vw" priority />
        <div>
          <h1 className="text-3xl font-bold">Sell {title}</h1>
          <div className="mt-6">
            <VariantPicker variants={device.variants} />
          </div>
          <ol className="mt-10 space-y-2 text-sm text-muted">
            {NEXT_STEPS.map((step, i) => (
              <li key={step}>
                <span className="mr-2 font-semibold text-brand">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

export default function SellDevicePage({ params }: PageProps<"/sell/[category]/[brand]/[device]">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ category, brand, device }) => (
          <DeviceContent categorySlug={category} brandSlug={brand} deviceSlug={device} />
        ))}
      </Suspense>
    </section>
  );
}
