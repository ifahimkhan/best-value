import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content/ContentPage";
import { GrievanceContact } from "@/components/content/GrievanceContact";
import { BRAND } from "@/lib/brand";
import { POLICY_UPDATED, REFUND_PROCESSING_DAYS, RETURN_WINDOW_DAYS } from "@/lib/content/policy";

export const metadata: Metadata = {
  title: `Returns & refunds | ${BRAND.name}`,
  description: `When you can return a device bought from ${BRAND.name} and how refunds are paid.`,
};

export default function RefundPolicyPage() {
  return (
    <ContentPage
      title="Returns & refunds"
      updated={POLICY_UPDATED}
      intro="What to do if something is wrong with a store order, and how and when you get your money back."
    >
      <Section title="Cancelling an order">
        <ul>
          <li>If payment is not completed, the order is never confirmed and the items are released for others to buy.</li>
          <li>
            To cancel a paid order before it ships, <Link href="/contact">contact us</Link> with the order number. We refund the full amount.
          </li>
          <li>Once an order has shipped it can no longer be cancelled, but you can refuse delivery or use the return process below.</li>
        </ul>
      </Section>

      <Section title="Returns">
        <p>You can ask for a return within {RETURN_WINDOW_DAYS} days of delivery if:</p>
        <ul>
          <li>the device does not work as described, or develops a fault not caused by damage or misuse;</li>
          <li>you received the wrong item, or its grade is clearly worse than listed;</li>
          <li>the parcel arrived damaged. Please photograph the box before opening it.</li>
        </ul>
        <p>
          To start a return, <Link href="/contact">contact us</Link> with your order number and a short description, with photos if you can. We
          arrange the collection. Send the device back with its accessories and with your accounts signed out.
        </p>
        <p>We cannot accept returns for physical or liquid damage after delivery, or for devices that have been opened or repaired by someone else.</p>
      </Section>

      <Section title="Refunds">
        <ul>
          <li>Once the returned device passes our check, we send the refund within {REFUND_PROCESSING_DAYS} working days.</li>
          <li>Refunds go back to the original payment method. Your bank may take a few more working days to show the credit.</li>
          <li>We refund the full amount paid, including GST. If an order is cancelled before shipping, no fees are deducted.</li>
          <li>If we cannot fulfil an order after you paid, we cancel it and refund you in full.</li>
        </ul>
      </Section>

      <Section title="Selling a device to us">
        <p>
          Sales to {BRAND.name} are final once we have paid you, because the device is wiped and prepared for resale. You can cancel at any time
          before the pickup, or decline a revised price at the doorstep and keep your device.
        </p>
      </Section>

      <Section title="Contact and grievances">
        <GrievanceContact />
      </Section>
    </ContentPage>
  );
}
