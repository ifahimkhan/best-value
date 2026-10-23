import { normalizeQuery } from "./search";

export const DEVICE_PAGE_SIZE = 30;
// Server actions accept 4.4 MB bodies (next.config.ts); this leaves room for the form fields
export const DEVICE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const DEVICE_UPLOAD_TOO_BIG = "Pick an image of 4 MB or less.";
export const IMAGE_FILTERS = ["placeholder", "custom", "all"] as const;

export interface DeviceListParams {
  q: string | null;
  image: (typeof IMAGE_FILTERS)[number];
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

/** Defaults to devices still showing a placeholder, since those are the ones that need a photo. */
export function parseDeviceListParams(raw: RawParams): DeviceListParams {
  const page = Number(single(raw.page));
  return {
    q: normalizeQuery(single(raw.q)),
    image: IMAGE_FILTERS.find((option) => option === single(raw.image)) ?? IMAGE_FILTERS[0],
    page: Number.isInteger(page) && page > 1 && page <= 10_000 ? page : 1,
  };
}

export function deviceListHref(current: DeviceListParams, changes: Partial<DeviceListParams> = {}): string {
  const next = { ...current, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.image !== IMAGE_FILTERS[0]) params.set("image", next.image);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/catalog?${query}` : "/admin/catalog";
}

/** Device ids are bigint serials; anything else from a form is rejected. */
export function parseDeviceId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,14}$/.test(value)) return null;
  return Number(value);
}
