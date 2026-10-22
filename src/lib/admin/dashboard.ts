import "server-only";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const LOW_STOCK = 2;

export interface DashboardCounts {
  pickupsToday: number;
  openSellOrders: number;
  awaitingPayout: number;
  ordersToShip: number;
  needsRefund: number;
  lowStock: number;
  failedImports: number;
}

/** Indian calendar date (YYYY-MM-DD) for "today" counts. */
export function todayInIndia(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export async function getDashboardCounts(now: Date): Promise<DashboardCounts> {
  const db = await createClient();
  const count = { count: "exact", head: true } as const;
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const results = await Promise.all([
    db.from("sell_orders").select("id", count).eq("pickup_date", todayInIndia(now)).in("status", ["quoted", "pickup_assigned"]),
    db.from("sell_orders").select("id", count).in("status", ["quoted", "pickup_assigned", "picked_up", "inspected"]),
    db.from("sell_orders").select("id", count).eq("status", "inspected"),
    db.from("orders").select("id", count).in("status", ["paid", "packed"]),
    db.from("orders").select("id", count).eq("status", "cancelled").eq("payment_status", "captured"),
    db.from("products").select("id", count).eq("is_active", true).lte("stock", LOW_STOCK),
    db.from("import_runs").select("id", count).eq("status", "failed").gte("started_at", since),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) logger.error("getDashboardCounts failed", failed.error);
  const [pickupsToday, openSellOrders, awaitingPayout, ordersToShip, needsRefund, lowStock, failedImports] = results.map((r) => r.count ?? 0);
  return { pickupsToday, openSellOrders, awaitingPayout, ordersToShip, needsRefund, lowStock, failedImports };
}
