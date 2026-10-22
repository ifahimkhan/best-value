import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/content/ContactForm";
import { BRAND } from "@/lib/brand";
import { companyDetails } from "@/lib/content/company";

export const metadata: Metadata = {
  title: `Contact us | ${BRAND.name}`,
  description: `Questions about selling a device or a store order? Write to the ${BRAND.name} team.`,
};

function CompanyCard() {
  const company = companyDetails();
  return (
    <aside className="space-y-5 text-sm">
      <div>
        <h2 className="font-semibold">Email</h2>
        <a href={`mailto:${company.supportEmail}`} className="text-brand underline">
          {company.supportEmail}
        </a>
      </div>
      {company.supportPhone && (
        <div>
          <h2 className="font-semibold">Phone</h2>
          <a href={`tel:${company.supportPhone.replace(/[\s-]/g, "")}`} className="text-brand underline">
            {company.supportPhone}
          </a>
        </div>
      )}
      {company.address && (
        <div>
          <h2 className="font-semibold">Registered office</h2>
          <p className="text-muted">
            {company.legalName}
            <br />
            {company.address}
          </p>
        </div>
      )}
      <div>
        <h2 className="font-semibold">Before you write</h2>
        <p className="text-muted">
          Many answers are already in our <Link href="/faq" className="text-brand underline">FAQ</Link>. Order status and invoices are in{" "}
          <Link href="/account" className="text-brand underline">your account</Link>.
        </p>
      </div>
    </aside>
  );
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Contact us</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Tell us what you need and we will get back to you by email. If it is about an order, add the order number so we can find it quickly.
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_18rem]">
        <ContactForm />
        <CompanyCard />
      </div>
    </div>
  );
}
