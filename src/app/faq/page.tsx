import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content/ContentPage";
import { BRAND } from "@/lib/brand";
import { groupFaqs, listFaqs, type Faq } from "@/lib/content/faqs";

export const metadata: Metadata = {
  title: `FAQ | ${BRAND.name}`,
  description: `Answers about selling your device, pickups, payouts and buying from the ${BRAND.name} store.`,
};

/** schema.org FAQPage data; "<" is escaped so answer text can never close the script tag. */
function faqJsonLd(faqs: readonly Faq[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function FaqPage() {
  const faqs = await listFaqs();
  const groups = groupFaqs(faqs);
  return (
    <ContentPage title="Frequently asked questions" intro="Quick answers about selling, buying and getting paid.">
      {groups.length === 0 && <p className="text-muted">Our FAQ is not available right now. Please try again shortly.</p>}
      {groups.map((group) => (
        <Section key={group.topic} id={group.topic} title={group.label}>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {group.items.map((faq) => (
              <details key={faq.id} className="group p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {faq.question}
                  <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      ))}
      <Section title="Still need help?">
        <p>
          <Link href="/contact">Send us a message</Link> and we will reply by email.
        </p>
      </Section>
      {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(faqs) }} />}
    </ContentPage>
  );
}
