import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content/ContentPage";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `About us | ${BRAND.name}`,
  description: `${BRAND.name} buys used phones and gadgets at fair prices and sells checked, refurbished devices for less.`,
};

const STEPS = [
  { title: "Get a price in minutes", body: "Pick your device, answer a few honest questions about its condition and see your offer straight away." },
  { title: "Free pickup at your door", body: "Choose a day and time slot. Our agent comes to you, so there is nothing to pack or post." },
  { title: "Paid on the spot", body: "After a quick check we pay by UPI, bank transfer or cash, whichever you picked." },
] as const;

export default function AboutPage() {
  return (
    <ContentPage
      title={`About ${BRAND.name}`}
      intro="A simpler way to sell the phone in your drawer and buy your next one without paying for a new box."
    >
      <Section title="Why we started">
        <p>
          Many homes have an old phone or tablet that still works but sits unused. Selling it usually means haggling with strangers, guessing a
          fair price or accepting a low exchange value. Buying second-hand has the opposite problem: it is hard to know what you are getting.
        </p>
        <p>
          {BRAND.name} sits in the middle. We give a clear price up front for the devices people want to sell, and we sell checked devices with a
          GST invoice to people who want good value.
        </p>
      </Section>

      <Section title="How selling works">
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="list-none rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-semibold text-brand">Step {i + 1}</span>
              <p className="mt-1 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <p>
          The price only changes if the device does not match your answers, and the agent shows you why before you decide. You can say no and keep
          your device.
        </p>
      </Section>

      <Section title="What we sell">
        <p>
          Our store lists refurbished and pre-owned devices graded Superb, Good or Fair so you know how they look before you order. Every device is
          tested before it is listed, and every order comes with a GST invoice you can download from your account.
        </p>
      </Section>

      <Section title="What we care about">
        <ul>
          <li>Clear prices, and no fee for pickup.</li>
          <li>Honest grading that describes wear plainly.</li>
          <li>Keeping working devices in use for longer instead of in a drawer or a landfill.</li>
          <li>Treating your data with care: we wipe every device we receive.</li>
        </ul>
      </Section>

      <Section title="Get started">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sell/phone" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold !text-brand-contrast !no-underline">
            Sell your phone
          </Link>
          <Link href="/shop" className="rounded-lg border border-brand px-5 py-2.5 text-sm font-semibold !no-underline">
            Browse the store
          </Link>
          <Link href="/contact" className="text-sm">
            Questions? Contact us
          </Link>
        </div>
      </Section>
    </ContentPage>
  );
}
