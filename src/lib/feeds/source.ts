import "server-only";
import { parseTextFeed, type ParseResult } from "./parse";
import { parseXlsxFeed } from "./parse-xlsx";
import { safeFetch, SafeFetchError } from "./safe-fetch";
import type { FeedFormat } from "./suppliers";

export const MAX_FEED_BYTES = 10 * 1024 * 1024;

/** Parses raw feed bytes in the supplier's format. */
export async function parseFeedBytes(bytes: Buffer, format: FeedFormat): Promise<ParseResult> {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_FEED_BYTES) return { ok: false, error: "The file is larger than 10 MB." };
  if (format === "xlsx") return parseXlsxFeed(bytes);
  return parseTextFeed(new TextDecoder("utf-8").decode(bytes), format);
}

/** Downloads a supplier's feed URL and parses it. */
export async function fetchFeed(url: string, format: FeedFormat): Promise<ParseResult> {
  try {
    const file = await safeFetch(url, { maxBytes: MAX_FEED_BYTES, timeoutMs: 30_000 });
    return parseFeedBytes(file.body, format);
  } catch (error) {
    // SafeFetchError messages are written for staff; anything else may hold internals
    const message = error instanceof SafeFetchError ? error.message : "The feed could not be downloaded.";
    return { ok: false, error: message };
  }
}
