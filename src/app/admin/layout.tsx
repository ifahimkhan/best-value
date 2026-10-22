import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/session";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/sell-orders", label: "Sell orders" },
  { href: "/admin/orders", label: "Store orders" },
  { href: "/admin/catalog", label: "Device catalog" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/suppliers", label: "Supplier feeds" },
  { href: "/admin/pricing", label: "Price questions" },
  { href: "/admin/messages", label: "Messages" },
] as const;

// UI gate only. Layouts don't re-run on client navigation and server actions /
// route handlers bypass them, so EVERY admin page, server action and route
// handler must also call requireStaff() itself before touching data.
async function StaffGate({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="space-y-1 text-sm">
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 hover:bg-surface">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-surface" />}>
          <StaffGate>{children}</StaffGate>
        </Suspense>
      </div>
    </div>
  );
}
