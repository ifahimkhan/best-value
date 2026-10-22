import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content/ContentPage";
import { GrievanceContact } from "@/components/content/GrievanceContact";
import { BRAND } from "@/lib/brand";
import { POLICY_UPDATED } from "@/lib/content/policy";

export const metadata: Metadata = {
  title: `Privacy policy | ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses and protects your personal data.`,
};

export default function PrivacyPolicyPage() {
  return (
    <ContentPage
      title="Privacy policy"
      updated={POLICY_UPDATED}
      intro={`This policy explains what personal data ${BRAND.name} collects when you sell a device, shop with us or contact us, why we need it and the choices you have.`}
    >
      <Section title="Data we collect">
        <ul>
          <li>
            <strong>Account details:</strong> your mobile number or email address, used to sign you in with a one-time code, and your name if you add
            it.
          </li>
          <li>
            <strong>Selling a device:</strong> the device model, your answers about its condition, the pickup address and time slot, and the payout
            method you choose (UPI ID or bank account details).
          </li>
          <li>
            <strong>Store orders:</strong> delivery address, items bought, your GSTIN if you add one, and payment references. Card, UPI and bank
            details you enter at checkout go directly to our payment partner; we never see or store them.
          </li>
          <li>
            <strong>Messages:</strong> what you write to us through the contact form, plus the name, email and phone number you give.
          </li>
          <li>
            <strong>Newsletter:</strong> your email address, only if you subscribe.
          </li>
          <li>
            <strong>Technical data:</strong> cookies that keep you signed in and remember your cart, and standard server logs used to keep the site
            secure.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To give you a price, arrange the pickup and pay you for your device.</li>
          <li>To process, ship and invoice store orders, and to handle returns and refunds.</li>
          <li>To reply to your messages and send updates about your orders.</li>
          <li>To send the newsletter if you asked for it.</li>
          <li>To prevent fraud, keep the service secure and meet tax and legal record-keeping duties.</li>
        </ul>
        <p>We process your data with your consent, to perform our contract with you, or where the law requires it. We do not sell your personal data.</p>
      </Section>

      <Section title="Who we share it with">
        <p>We share only what each partner needs to do its job:</p>
        <ul>
          <li>our payment partner, to take payments and send refunds;</li>
          <li>courier and pickup partners, who need your name, phone number and address;</li>
          <li>hosting and database providers that store the data on our behalf under contract;</li>
          <li>government authorities, when the law requires it.</li>
        </ul>
      </Section>

      <Section title="Your devices and your data">
        <p>
          Please back up and erase your device and sign out of all accounts before pickup. We factory-reset every device we receive before it is
          inspected or resold, and we do not access or keep any personal content left on it.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep order and invoice records for as long as tax law requires. Other data is kept while your account is active and deleted or
          anonymised when it is no longer needed. Newsletter addresses are kept until you ask us to remove them.
        </p>
      </Section>

      <Section title="Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023 you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and how we use it;</li>
          <li>correct or update data that is wrong or incomplete;</li>
          <li>erase your data, unless we must keep it by law;</li>
          <li>withdraw consent, for example to leave the newsletter list;</li>
          <li>nominate someone to act for you.</li>
        </ul>
        <p>
          To use these rights, <Link href="/contact">contact us</Link> or write to the Grievance Officer below.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit, access is limited to staff who need it, and payment details are handled by a PCI-DSS certified payment
          partner. No system is perfectly secure, so please keep your sign-in codes private.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>When we change this policy we update the date at the top. Significant changes will be highlighted on the site.</p>
      </Section>

      <Section title="Contact and grievances">
        <GrievanceContact />
      </Section>
    </ContentPage>
  );
}
