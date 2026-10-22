import { createHash } from "node:crypto";
import type { FeedItem } from "./mapping";
import { runPool } from "./pool";

export const IMAGE_BUCKET = "product-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_TRANSFERS_PER_RUN = 200;
// No SVG: it can carry script and would be served from our storage domain
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;

const CONCURRENCY = 6;

export interface ImageStore {
  publicUrl(path: string): string;
  exists(path: string): Promise<boolean>;
  upload(path: string, body: Buffer, contentType: string): Promise<void>;
}

export type ImageDownloader = (url: string) => Promise<{ body: Buffer; contentType: string }>;

/** Hosted public URL -> where to copy it from. */
export type ImageSources = ReadonlyMap<string, { path: string; sourceUrl: string }>;

export interface ImageNeed {
  sku: string;
  publicUrl: string;
}

export interface TransferResult {
  ready: Set<string>;
  transfers: number;
  failures: { sku: string; url: string; message: string }[];
}

/** Same supplier URL always lands on the same object, so re-runs never re-download unchanged images. */
export function imagePath(supplierId: number, sourceUrl: string): string {
  return `feeds/${supplierId}/${createHash("sha256").update(sourceUrl).digest("hex")}`;
}

/**
 * Points items at the URLs their images will have in our storage. No network:
 * the copy happens later, and only for products that actually take the images.
 * Hot-linking supplier URLs would let a supplier swap images after review and
 * leak our visitors' IPs to them.
 */
export function toHostedImages(
  items: readonly FeedItem[],
  supplierId: number,
  store: Pick<ImageStore, "publicUrl">,
): { items: FeedItem[]; sources: ImageSources } {
  const sources = new Map<string, { path: string; sourceUrl: string }>();
  const hosted = items.map((item) => ({
    ...item,
    images: item.images.map((sourceUrl) => {
      const path = imagePath(supplierId, sourceUrl);
      const publicUrl = store.publicUrl(path);
      sources.set(publicUrl, { path, sourceUrl });
      return publicUrl;
    }),
  }));
  return { items: hosted, sources };
}

export interface TransferContext {
  store: ImageStore;
  download: ImageDownloader;
  /** Maps download errors to text that is safe to show staff. */
  describeError: (error: unknown) => string;
  maxTransfers?: number;
}

/** Copies the needed images into storage, up to the per-run budget. Images beyond it are retried next run. */
export async function transferImages(needs: readonly ImageNeed[], sources: ImageSources, ctx: TransferContext): Promise<TransferResult> {
  const skusByUrl = new Map<string, string[]>();
  for (const { sku, publicUrl } of needs) skusByUrl.set(publicUrl, [...(skusByUrl.get(publicUrl) ?? []), sku]);
  const queue = [...skusByUrl.keys()].filter((url) => sources.has(url)).slice(0, ctx.maxTransfers ?? MAX_IMAGE_TRANSFERS_PER_RUN);
  const outcomes = await runPool(
    queue.map((publicUrl) => async () => {
      const { path, sourceUrl } = sources.get(publicUrl)!;
      try {
        if (!(await ctx.store.exists(path))) {
          const file = await ctx.download(sourceUrl);
          await ctx.store.upload(path, file.body, file.contentType);
        }
        return { publicUrl, sourceUrl, error: null };
      } catch (error) {
        return { publicUrl, sourceUrl, error: ctx.describeError(error) };
      }
    }),
    CONCURRENCY,
  );
  return {
    ready: new Set(outcomes.filter((o) => o.error === null).map((o) => o.publicUrl)),
    transfers: queue.length,
    failures: outcomes.flatMap((o) =>
      o.error === null ? [] : (skusByUrl.get(o.publicUrl) ?? []).map((sku) => ({ sku, url: o.sourceUrl, message: o.error })),
    ),
  };
}
