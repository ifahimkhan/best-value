import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { DeviceImage } from "@/components/catalog/DeviceImage";
import { SellCalculator } from "@/components/sell/SellCalculator";
import { getSessionUser } from "@/lib/auth/session";
import { formatInr } from "@/lib/brand";
import { resolveDevice } from "@/lib/catalog/resolve";
import { isValidSlug } from "@/lib/catalog/slug";
import { getEvaluation } from "@/lib/sell/queries";
import { formatPickupDate, pickupDates } from "@/lib/sell/slots";

// Price calculator: condition questions, live estimate, then pickup booking.
// The estimate here is for display; bookPickup re-prices on the server.

interface VariantContentProps {
  categorySlug: string;
  brandSlug: string;
  deviceSlug: string;
  variantSlug: string;
}

async function VariantContent({ categorySlug, brandSlug, deviceSlug, variantSlug }: VariantContentProps) {
  if (!isValidSlug(variantSlug)) notFound();
  const resolved = await resolveDevice(categorySlug, brandSlug, deviceSlug);
  const variant = resolved?.device.variants.find((v) => v.slug === variantSlug);
  if (!resolved || !variant) notFound();

  const { category, brand, device } = resolved;
  const title = `${brand.name} ${device.name}`;
  const [questions, user] = await Promise.all([getEvaluation(category.id), getSessionUser()]);
  // Pickup dates depend on the current day, so render them at request time
  await connection();
  const dates = pickupDates(new Date()).map((value) => ({ value, label: formatPickupDate(value) }));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sell", href: "/sell" },
          { label: category.name, href: `/sell/${category.slug}` },
          { label: brand.name, href: `/sell/${category.slug}/${brand.slug}` },
          { label: device.name, href: device.href },
          { label: variant.label },
        ]}
      />
      <div className="mb-8 flex items-center gap-5 rounded-xl border border-border bg-surface p-5">
        <div className="w-20 shrink-0">
          <DeviceImage src={device.imageUrl} alt={title} sizes="5rem" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Sell your {title}</h1>
          <p className="text-muted">
            {variant.label} · get up to <span className="font-semibold text-brand">{formatInr(variant.price)}</span>{" "}
            <Link href={device.href} className="text-sm text-brand underline">
              Change
            </Link>
          </p>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="text-muted">We can&apos;t price this device online right now. Please try again later.</p>
      ) : (
        <SellCalculator
          variantId={variant.id}
          basePrice={variant.price}
          deviceTitle={title}
          variantLabel={variant.label}
          questions={questions}
          signedIn={user !== null}
          loginHref={`/login?next=${encodeURIComponent(variant.href)}`}
          dates={dates}
          defaultName={user?.fullName ?? ""}
          defaultPhone={user?.phone?.replace(/^\+91/, "") ?? ""}
        />
      )}
    </>
  );
}

export default function SellVariantPage({ params }: PageProps<"/sell/[category]/[brand]/[device]/[variant]">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ category, brand, device, variant }) => (
          <VariantContent categorySlug={category} brandSlug={brand} deviceSlug={device} variantSlug={variant} />
        ))}
      </Suspense>
    </section>
  );
}
