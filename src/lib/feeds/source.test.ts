import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedFile, SafeFetchOptions } from "./safe-fetch";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn<(url: string, options: SafeFetchOptions) => Promise<FetchedFile>>(),
  parseXlsxFeed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./parse-xlsx", () => ({ parseXlsxFeed: mocks.parseXlsxFeed }));
vi.mock("./safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./safe-fetch")>()),
  safeFetch: mocks.safeFetch,
}));

const { fetchFeed, MAX_FEED_BYTES, parseFeedBytes } = await import("./source");
const { SafeFetchError } = await import("./safe-fetch");

const CSV = "sku,price\nA1,199\n";
const fetched = (body: string): FetchedFile => ({ body: Buffer.from(body), contentType: "text/csv", finalUrl: "https://feeds.example.com/a.csv" });

beforeEach(() => {
  mocks.safeFetch.mockReset();
  mocks.parseXlsxFeed.mockReset();
});

describe("parseFeedBytes", () => {
  it("parses text formats as UTF-8", async () => {
    await expect(parseFeedBytes(Buffer.from("sku,title\nA1,Café\n"), "csv")).resolves.toEqual({
      ok: true,
      table: { columns: ["sku", "title"], rows: [{ sku: "A1", title: "Café" }] },
    });
    await expect(parseFeedBytes(Buffer.from('[{"sku":"A1"}]'), "json")).resolves.toMatchObject({ ok: true, table: { rows: [{ sku: "A1" }] } });
  });

  it("hands xlsx bytes to the workbook parser", async () => {
    const bytes = Buffer.from("PK");
    mocks.parseXlsxFeed.mockResolvedValue({ ok: true, table: { columns: ["sku"], rows: [{ sku: "A1" }] } });

    await expect(parseFeedBytes(bytes, "xlsx")).resolves.toMatchObject({ ok: true });
    expect(mocks.parseXlsxFeed).toHaveBeenCalledWith(bytes);
  });

  it("rejects empty and oversized files before parsing", async () => {
    await expect(parseFeedBytes(Buffer.alloc(0), "xlsx")).resolves.toEqual({ ok: false, error: "The file is empty." });
    await expect(parseFeedBytes(Buffer.alloc(MAX_FEED_BYTES + 1), "xlsx")).resolves.toEqual({ ok: false, error: "The file is larger than 10 MB." });
    expect(mocks.parseXlsxFeed).not.toHaveBeenCalled();
  });

  it("accepts a file exactly at the size limit", async () => {
    mocks.parseXlsxFeed.mockResolvedValue({ ok: false, error: "x" });

    await parseFeedBytes(Buffer.alloc(MAX_FEED_BYTES), "xlsx");

    expect(mocks.parseXlsxFeed).toHaveBeenCalledOnce();
  });
});

describe("fetchFeed", () => {
  it("downloads with the feed size cap and timeout, then parses", async () => {
    mocks.safeFetch.mockResolvedValue(fetched(CSV));

    const result = await fetchFeed("https://feeds.example.com/a.csv", "csv");

    expect(mocks.safeFetch).toHaveBeenCalledWith("https://feeds.example.com/a.csv", { maxBytes: MAX_FEED_BYTES, timeoutMs: 30_000 });
    expect(result).toEqual({ ok: true, table: { columns: ["sku", "price"], rows: [{ sku: "A1", price: "199" }] } });
  });

  it("returns parse errors for a downloaded file", async () => {
    mocks.safeFetch.mockResolvedValue(fetched(""));

    await expect(fetchFeed("https://feeds.example.com/a.csv", "csv")).resolves.toEqual({ ok: false, error: "The file is empty." });
  });

  it("shows SafeFetchError messages to staff", async () => {
    mocks.safeFetch.mockRejectedValue(new SafeFetchError("The address resolves to a private network."));

    await expect(fetchFeed("https://feeds.example.com/a.csv", "csv")).resolves.toEqual({ ok: false, error: "The address resolves to a private network." });
  });

  it("hides raw network errors", async () => {
    mocks.safeFetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal-db.corp"));

    await expect(fetchFeed("https://feeds.example.com/a.csv", "csv")).resolves.toEqual({ ok: false, error: "The feed could not be downloaded." });
  });
});
