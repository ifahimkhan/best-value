import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDashboardCounts } from "@/lib/admin/dashboard";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { title: "Admin dashboard", robots: { index: false } };

interface Tile {
  label: string;
  value: number | null;
  href: string;
  urgent?: boolean;
}

async function Dashboard() {
  await requireStaff();
  await connection();
  const c = await getDashboardCounts(new Date());
  const tiles: Tile[] = [
    { label: "Pickups due today", value: c.pickupsToday, href: "/admin/sell-orders?status=open" },
    { label: "Open buyback orders", value: c.openSellOrders, href: "/admin/sell-orders?status=open" },
    { label: "Inspected, awaiting payout", value: c.awaitingPayout, href: "/admin/sell-orders?status=inspected", urgent: (c.awaitingPayout ?? 0) > 0 },
    { label: "Store orders to pack or ship", value: c.ordersToShip, href: "/admin/orders?status=to_ship" },
    { label: "Payments to refund", value: c.needsRefund, href: "/admin/orders?status=needs_refund", urgent: (c.needsRefund ?? 0) > 0 },
    { label: "Products with 2 or fewer in stock", value: c.lowStock, href: "/admin/products?status=active" },
    { label: "Failed feed imports (7 days)", value: c.failedImports, href: "/admin/suppliers", urgent: (c.failedImports ?? 0) > 0 },
  ];
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <li key={tile.label}>
          <Link
            href={tile.href}
            className={`block rounded-xl border bg-surface p-5 hover:bg-brand-soft ${tile.urgent ? "border-danger" : "border-border"}`}
          >
            <span className={`block text-3xl font-bold ${tile.urgent ? "text-danger" : ""}`}>{tile.value === null ? "–" : tile.value.toLocaleString("en-IN")}</span>
            <span className="text-sm text-muted">
              {tile.label}
              {tile.value === null && " (could not load)"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-xl bg-surface" />}>
        <Dashboard />
      </Suspense>
    </section>
  );
}
