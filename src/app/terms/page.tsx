import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content/ContentPage";
import { GrievanceContact } from "@/components/content/GrievanceContact";
import { BRAND } from "@/lib/brand";
import { POLICY_UPDATED } from "@/lib/content/policy";

export const metadata: Metadata = {
  title: `Terms & conditions | ${BRAND.name}`,
  description: `The terms for selling devices to and buying devices from ${BRAND.name}.`,
};

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms & conditions"
      updated={POLICY_UPDATED}
      intro={`These terms apply when you use the ${BRAND.name} website to sell a device to us or buy a device from us. By placing an order you agree to them.`}
    >
      <Section title="Your account">
        <p>
          You sign in with a one-time code sent to your mobile number or email. Keep the code private: actions taken after signing in are treated as
          yours. You must be at least 18 years old, or have a parent or guardian place the order for you.
        </p>
      </Section>

      <Section title="Selling a device to us">
        <ul>
          <li>You confirm that you own the device, or are allowed to sell it, and that it is not stolen, financed or blocked.</li>
          <li>The online price is an estimate based on your answers. Our agent checks the device at pickup and may revise the price if its condition differs. You can accept the revised price or keep your device.</li>
          <li>You will show a valid government photo ID at pickup. We may refuse a device if we cannot verify ownership.</li>
          <li>Remove screen locks and sign out of iCloud, Google and other accounts before pickup. A device that stays locked cannot be bought.</li>
          <li>Ownership passes to us when we pay you. We pay by the method you chose while booking.</li>
          <li>You or we can cancel a booking at any time before the device is collected.</li>
        </ul>
      </Section>

      <Section title="Buying from our store">
        <ul>
          <li>Prices are in Indian rupees and include GST. A GST invoice is issued for every order.</li>
          <li>Each listing shows the device grade. Superb, Good and Fair describe cosmetic condition; every grade is tested to work fully.</li>
          <li>An order is confirmed once payment succeeds. Unpaid orders are released after a short time so others can buy the stock.</li>
          <li>We may cancel an order if an item turns out to be unavailable or was listed at an obviously wrong price. Any amount paid is refunded in full.</li>
          <li>
            Returns and refunds follow our <Link href="/refund-policy">returns & refunds policy</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Acceptable use">
        <p>
          Do not misuse the site: no false information, fraudulent orders, attempts to break security, or automated scraping that harms the
          service. We may suspend accounts that do.
        </p>
      </Section>

      <Section title="Brands and content">
        <p>
          Device names and brand names belong to their owners and are used only to identify products. We are not affiliated with or endorsed by
          those brands. The text, design and software of this site belong to {BRAND.name}.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          We take care to keep the service accurate and available, but we cannot promise it will always be error-free. To the extent the law allows,
          our liability for any order is limited to the amount paid for it. Nothing in these terms limits your rights under the Consumer Protection
          Act, 2019.
        </p>
      </Section>

      <Section title="Law and disputes">
        <p>
          These terms are governed by the laws of India. Please contact us first so we can try to resolve any issue. If we cannot, disputes will be
          handled by the courts with jurisdiction over our registered office, without affecting your right to approach a consumer commission.
        </p>
      </Section>

      <Section title="Changes">
        <p>We may update these terms. The version that applies to an order is the one shown on the site when the order was placed.</p>
      </Section>

      <Section title="Contact and grievances">
        <GrievanceContact />
      </Section>
    </ContentPage>
  );
}
