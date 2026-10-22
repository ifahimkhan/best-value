import Link from "next/link";
import { BRAND } from "@/lib/brand";

const FOOTER_COLUMNS = [
  {
    title: "Sell",
    links: [
      { href: "/sell/phone", label: "Sell phone" },
      { href: "/sell/tablet", label: "Sell tablet" },
      { href: "/sell/smartwatch", label: "Sell smartwatch" },
      { href: "/sell/earbuds", label: "Sell earbuds" },
    ],
  },
  {
    title: "Shop",
    links: [
      { href: "/shop?category=phone", label: "Phones" },
      { href: "/shop?category=tablet", label: "Tablets" },
      { href: "/shop?category=smartwatch", label: "Smartwatches" },
      { href: "/shop", label: "All products" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy policy" },
      { href: "/terms", label: "Terms & conditions" },
      { href: "/refund-policy", label: "Returns & refunds" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-lg font-extrabold">{BRAND.name}</p>
          <p className="mt-2 text-sm text-muted">{BRAND.tagline}</p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 text-sm font-semibold">{col.title}</p>
            <ul className="space-y-2 text-sm text-muted">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-muted">
        © {BRAND.name}. Brand names and logos belong to their respective owners and are used only to identify devices.
      </p>
    </footer>
  );
}
