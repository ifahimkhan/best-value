import { normalizeQuery } from "@/lib/catalog/search";

export const ADMIN_PAGE_SIZE = 30;
export const SOURCE_FILTERS = ["all", "manual", "feed"] as const;
export const STATUS_FILTERS = ["all", "active", "inactive", "out_of_stock"] as const;

export interface AdminListParams {
  q: string | null;
  source: (typeof SOURCE_FILTERS)[number];
  status: (typeof STATUS_FILTERS)[number];
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

function pick<T extends string>(options: readonly T[], value: string | undefined): T {
  return options.find((option) => option === value) ?? options[0];
}

export function parseAdminListParams(raw: RawParams): AdminListParams {
  const page = Number(single(raw.page));
  return {
    q: normalizeQuery(single(raw.q)),
    source: pick(SOURCE_FILTERS, single(raw.source)),
    status: pick(STATUS_FILTERS, single(raw.status)),
    page: Number.isInteger(page) && page > 1 && page <= 10_000 ? page : 1,
  };
}

export function adminListHref(current: AdminListParams, changes: Partial<AdminListParams> = {}): string {
  const next = { ...current, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.source !== "all") params.set("source", next.source);
  if (next.status !== "all") params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/products?${query}` : "/admin/products";
}
