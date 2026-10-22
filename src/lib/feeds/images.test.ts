import { describe, expect, it, vi } from "vitest";
import { imagePath, toHostedImages, transferImages, type ImageStore } from "./images";
import type { FeedItem } from "./mapping";

const item = (sku: string, images: string[]): FeedItem => ({
  supplierSku: sku,
  title: sku,
  price: 100,
  mrp: null,
  stock: 1,
  description: null,
  condition: "new",
  brandName: null,
  categoryName: null,
  gstRate: 18,
  hsnCode: null,
  images,
  isActive: true,
});

function fakeStore(existing: string[] = []): ImageStore & { uploads: string[] } {
  const uploads: string[] = [];
  return {
    uploads,
    publicUrl: (path) => `https://cdn.test/${path}`,
    exists: async (path) => existing.includes(path),
    upload: async (path) => {
      uploads.push(path);
    },
  };
}

const A = "https://supplier.test/a.jpg";
const B = "https://supplier.test/b.jpg";
const C = "https://supplier.test/c.jpg";
const hosted = (url: string) => `https://cdn.test/${imagePath(3, url)}`;
const okDownload = vi.fn(async () => ({ body: Buffer.from("img"), contentType: "image/jpeg" }));
const describeError = (error: unknown) => (error instanceof Error ? error.message : "failed");

describe("imagePath", () => {
  it("is stable per supplier and URL", () => {
    expect(imagePath(3, A)).toBe(imagePath(3, A));
    expect(imagePath(3, A)).not.toBe(imagePath(4, A));
    expect(imagePath(3, A)).toMatch(/^feeds\/3\/[0-9a-f]{64}$/);
  });
});

describe("toHostedImages", () => {
  it("rewrites item images to storage URLs without touching the network", () => {
    const { items, sources } = toHostedImages([item("X", [A, B])], 3, fakeStore());
    expect(items[0].images).toEqual([hosted(A), hosted(B)]);
    expect(sources.get(hosted(A))).toEqual({ path: imagePath(3, A), sourceUrl: A });
  });
});

describe("transferImages", () => {
  it("copies each needed image once", async () => {
    const store = fakeStore();
    const { sources } = toHostedImages([item("X", [A, B])], 3, store);
    const result = await transferImages(
      [
        { sku: "X", publicUrl: hosted(A) },
        { sku: "Y", publicUrl: hosted(A) },
        { sku: "X", publicUrl: hosted(B) },
      ],
      sources,
      { store, download: okDownload, describeError },
    );
    expect(store.uploads).toHaveLength(2);
    expect(result.ready).toEqual(new Set([hosted(A), hosted(B)]));
    expect(result.failures).toEqual([]);
  });

  it("does not download objects already in storage", async () => {
    const store = fakeStore([imagePath(3, A)]);
    const { sources } = toHostedImages([item("X", [A])], 3, store);
    okDownload.mockClear();
    const result = await transferImages([{ sku: "X", publicUrl: hosted(A) }], sources, { store, download: okDownload, describeError });
    expect(okDownload).not.toHaveBeenCalled();
    expect(result.ready.has(hosted(A))).toBe(true);
  });

  it("reports failures for every product using the image and respects the budget", async () => {
    const store = fakeStore();
    const { sources } = toHostedImages([item("X", [A, B, C])], 3, store);
    const download = vi.fn(async (url: string) => {
      if (url === A) throw new Error("Unexpected content type");
      return { body: Buffer.from("img"), contentType: "image/png" };
    });
    const result = await transferImages(
      [
        { sku: "X", publicUrl: hosted(A) },
        { sku: "Y", publicUrl: hosted(A) },
        { sku: "X", publicUrl: hosted(B) },
        { sku: "X", publicUrl: hosted(C) },
      ],
      sources,
      { store, download, describeError, maxTransfers: 2 },
    );
    expect(result.ready).toEqual(new Set([hosted(B)]));
    expect(result.transfers).toBe(2);
    expect(result.failures).toEqual([
      { sku: "X", url: A, message: "Unexpected content type" },
      { sku: "Y", url: A, message: "Unexpected content type" },
    ]);
  });
});
