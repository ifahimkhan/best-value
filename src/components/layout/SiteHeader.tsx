import Link from "next/link";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { AuthSlot } from "./AuthSlot";
import { CartSlot } from "./CartSlot";

const NAV_LINKS = [
  { href: "/sell", label: "Sell" },
  { href: "/shop", label: "Shop" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm text-brand-contrast">BV</span>
          {BRAND.name}
        </Link>

        <form action="/search" className="hidden flex-1 md:block">
          <input
            name="q"
            type="search"
            placeholder="Search phones, tablets, watches…"
            className="w-full max-w-md rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-brand"
          />
        </form>

        <nav className="ml-auto hidden items-center gap-5 text-sm font-medium sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand">
              {link.label}
            </Link>
          ))}
        </nav>

        <Suspense fallback={<span className="text-sm font-medium">Cart</span>}>
          <CartSlot />
        </Suspense>

        <Suspense fallback={<div className="h-9 w-20" />}>
          <AuthSlot />
        </Suspense>
      </div>
    </header>
  );
}
