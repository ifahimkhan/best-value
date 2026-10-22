import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { isPrivateAddress, validateFeedUrl } from "./url-safety";

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Rejects the response unless its content-type starts with one of these. */
  acceptTypes?: readonly string[];
}

export interface FetchedFile {
  body: Buffer;
  contentType: string;
  finalUrl: string;
}

export class SafeFetchError extends Error {}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_REDIRECTS = 3;

/** Remote headers end up in staff-visible error text, so keep them short and printable. */
const printable = (value: string): string => value.replace(/[^ -~]/g, "").slice(0, 60);

/**
 * Resolves the host and refuses private addresses. Because node:https uses this
 * resolver for the actual connection, a DNS answer cannot change between the
 * check and the connect (no DNS-rebinding window).
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0);
    const blocked = addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address));
    if (blocked) return callback(new SafeFetchError("The address resolves to a private network."), "", 0);
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

function fetchOnce(url: URL, options: SafeFetchOptions): Promise<FetchedFile | { redirect: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    // The socket timeout only covers idle gaps; this caps servers that drip bytes slowly
    const deadline = setTimeout(() => req.destroy(new SafeFetchError("The server took too long to respond.")), timeoutMs * 2);
    const settle = <T,>(fn: (value: T) => void) => (value: T) => {
      clearTimeout(deadline);
      fn(value);
    };
    resolve = settle(resolve);
    reject = settle(reject);
    const req = request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: { "user-agent": "BestValueFeedImporter/1.0", accept: "*/*" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ redirect: new URL(res.headers.location, url).toString() });
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new SafeFetchError(`The server answered with status ${status}.`));
          return;
        }
        const contentType = (res.headers["content-type"] ?? "").toLowerCase();
        if (options.acceptTypes && !options.acceptTypes.some((type) => contentType.startsWith(type))) {
          res.resume();
          reject(new SafeFetchError(`Unexpected content type "${printable(contentType) || "none"}".`));
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > options.maxBytes) {
          res.destroy();
          reject(new SafeFetchError("The file is too large."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            res.destroy();
            reject(new SafeFetchError("The file is too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ body: Buffer.concat(chunks), contentType, finalUrl: url.toString() }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("The server took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

/** Downloads an https URL with SSRF guards, a size cap, a timeout and re-validated redirects. */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<FetchedFile> {
  let current = rawUrl;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = validateFeedUrl(current);
    if (!check.ok) throw new SafeFetchError(check.error);
    const result = await fetchOnce(check.url, options);
    if (!("redirect" in result)) return result;
    current = result.redirect;
  }
  throw new SafeFetchError("Too many redirects.");
}
