import { timingSafeEqual } from "node:crypto";
import { cronEnv } from "@/lib/env";
import { listScheduledSuppliers } from "@/lib/feeds/queries";
import { recordFailedRun, runImport } from "@/lib/feeds/run-import";
import { fetchFeed } from "@/lib/feeds/source";
import type { Supplier } from "@/lib/feeds/suppliers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily supplier feed import, triggered by Vercel Cron (see vercel.json).
export const maxDuration = 300;
// Stop starting new suppliers well before the platform kills the function
const START_BUDGET_MS = 200_000;

function authorised(header: string | null): boolean {
  let secret: string | undefined;
  try {
    secret = cronEnv().CRON_SECRET;
  } catch (error) {
    logger.error("CRON_SECRET is misconfigured", error);
    return false;
  }
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type SupplierResult = { supplierId: number; status: string };

async function importSupplier(db: ReturnType<typeof createAdminClient>, supplier: Supplier): Promise<SupplierResult> {
  if (!supplier.feedUrl || !supplier.mapping.fields.sku) return { supplierId: supplier.id, status: "skipped" };
  try {
    const feed = await fetchFeed(supplier.feedUrl, supplier.feedFormat);
    if (!feed.ok) {
      await recordFailedRun(db, supplier.id, feed.error, null);
      return { supplierId: supplier.id, status: "failed" };
    }
    const outcome = await runImport({ db, supplier, table: feed.table, startedBy: null });
    return { supplierId: supplier.id, status: outcome.ok ? outcome.totals.status : "skipped" };
  } catch (error) {
    logger.error("scheduled feed import failed", error, { supplierId: supplier.id });
    return { supplierId: supplier.id, status: "failed" };
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request.headers.get("authorization"))) {
    return Response.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }
  const startedAt = Date.now();
  const db = createAdminClient();
  try {
    const suppliers = await listScheduledSuppliers(db);
    const results: SupplierResult[] = [];
    // One at a time keeps memory and outbound traffic predictable
    for (const supplier of suppliers) {
      if (Date.now() - startedAt > START_BUDGET_MS) {
        results.push({ supplierId: supplier.id, status: "deferred" });
        continue;
      }
      results.push(await importSupplier(db, supplier));
    }
    return Response.json({ success: true, data: results });
  } catch (error) {
    logger.error("scheduled feed import failed", error);
    return Response.json({ success: false, error: "Import failed" }, { status: 500 });
  }
}
