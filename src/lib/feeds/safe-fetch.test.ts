import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// node:https and node:dns are replaced by an in-memory network, so these tests
// never open a socket. The fake request calls the `lookup` option the way
// node:https does, which exercises the guarded resolver inside safe-fetch.

interface DnsEntry {
  address: string;
  family: number;
}

interface Route {
  status?: number;
  headers?: Record<string, string>;
  chunks?: string[];
  /** respond (default), idle = socket timeout event, hang = never answers, broken = stream error, cut = closes before the end, throws = request() throws */
  behaviour?: "respond" | "idle" | "hang" | "broken" | "cut" | "throws";
  /** Ask the resolver for every address, as Node does with autoSelectFamily. */
  lookupAll?: boolean;
}

type LookupCallback = (error: Error | null, address: string | DnsEntry[], family?: number) => void;
type Lookup = (hostname: string, options: { all?: boolean }, callback: LookupCallback) => void;

const net = vi.hoisted(() => ({
  dns: new Map<string, DnsEntry[] | Error>(),
  routes: new Map<string, Route>(),
  requests: [] as { url: string; options: Record<string, unknown> }[],
  responses: [] as { resumed: boolean; destroyed: boolean }[],
  resolved: [] as { hostname: string; address: string | DnsEntry[]; family?: number }[],
}));

vi.mock("server-only", () => ({}));

vi.mock("node:dns", () => ({
  lookup: (hostname: string, _options: unknown, callback: (error: Error | null, addresses: DnsEntry[]) => void) => {
    const answer = net.dns.get(hostname) ?? new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    queueMicrotask(() => (answer instanceof Error ? callback(answer, []) : callback(null, answer)));
  },
}));

vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");

  class FakeResponse extends EventEmitter {
    resumed = false;
    destroyed = false;
    constructor(
      readonly statusCode: number,
      readonly headers: Record<string, string>,
    ) {
      super();
    }
    resume(): this {
      this.resumed = true;
      return this;
    }
    destroy(): this {
      this.destroyed = true;
      return this;
    }
  }

  class FakeRequest extends EventEmitter {
    destroyed = false;
    constructor(
      private readonly url: URL,
      private readonly lookup: Lookup,
      private readonly onResponse: (res: FakeResponse) => void,
    ) {
      super();
    }

    destroy(error?: Error): this {
      if (this.destroyed) return this;
      this.destroyed = true;
      if (error) queueMicrotask(() => this.emit("error", error));
      return this;
    }

    end(): void {
      const route = net.routes.get(this.url.toString()) ?? { status: 404 };
      this.lookup(this.url.hostname, { all: route.lookupAll ?? false }, (error, address, family) => {
        if (error) {
          this.emit("error", error);
          return;
        }
        net.resolved.push({ hostname: this.url.hostname, address, family });
        void this.answer(route);
      });
    }

    private async answer(route: Route): Promise<void> {
      const behaviour = route.behaviour ?? "respond";
      if (behaviour === "hang") return;
      if (behaviour === "idle") {
        this.emit("timeout");
        return;
      }
      const res = new FakeResponse(route.status ?? 200, route.headers ?? {});
      net.responses.push(res);
      this.onResponse(res);
      if (behaviour === "broken") {
        res.emit("error", new Error("socket hang up"));
        return;
      }
      if (behaviour === "cut") {
        res.emit("data", Buffer.from("partial"));
        res.emit("close");
        return;
      }
      for (const chunk of route.chunks ?? []) {
        await Promise.resolve();
        if (res.destroyed) return;
        res.emit("data", Buffer.from(chunk));
      }
      await Promise.resolve();
      if (!res.destroyed) {
        res.emit("end");
        res.emit("close");
      }
    }
  }

  return {
    request: (url: URL, options: Record<string, unknown> & { lookup: Lookup }, onResponse: (res: FakeResponse) => void) => {
      net.requests.push({ url: url.toString(), options });
      if (net.routes.get(url.toString())?.behaviour === "throws") throw new TypeError("Invalid header value");
      return new FakeRequest(url, options.lookup, onResponse);
    },
  };
});

const { safeFetch, SafeFetchError } = await import("./safe-fetch");

const PUBLIC_V4: DnsEntry[] = [{ address: "93.184.216.34", family: 4 }];
const LIMITS = { maxBytes: 1024 };

function host(name: string, entries: DnsEntry[] | Error = PUBLIC_V4): void {
  net.dns.set(name, entries);
}

function route(url: string, value: Route): void {
  net.routes.set(url, value);
}

beforeEach(() => {
  net.dns.clear();
  net.routes.clear();
  net.requests.length = 0;
  net.responses.length = 0;
  net.resolved.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("safeFetch: successful downloads", () => {
  it("returns the body, lower-cased content type and final URL", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/feed.csv", { headers: { "content-type": "Text/CSV; charset=utf-8" }, chunks: ["sku,price\n", "A,1\n"] });

    const file = await safeFetch("https://feeds.example.com/feed.csv", LIMITS);

    expect(file).toEqual({ body: Buffer.from("sku,price\nA,1\n"), contentType: "text/csv; charset=utf-8", finalUrl: "https://feeds.example.com/feed.csv" });
  });

  it("sends a GET with the guarded resolver, default timeout and importer user agent", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { chunks: ["x"] });

    await safeFetch("https://feeds.example.com/a", LIMITS);

    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].options).toMatchObject({
      method: "GET",
      timeout: 20_000,
      lookup: expect.any(Function),
      headers: { "user-agent": "BestValueFeedImporter/1.0", accept: "*/*" },
    });
  });

  it("passes the caller's timeout to the socket", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { chunks: ["x"] });

    await safeFetch("https://feeds.example.com/a", { ...LIMITS, timeoutMs: 1234 });

    expect(net.requests[0].options.timeout).toBe(1234);
  });

  it("connects to the address the guarded resolver approved", async () => {
    host("feeds.example.com", [{ address: "2606:2800:220:1::1", family: 6 }]);
    route("https://feeds.example.com/a", { chunks: ["x"] });

    await safeFetch("https://feeds.example.com/a", LIMITS);

    expect(net.resolved).toEqual([{ hostname: "feeds.example.com", address: "2606:2800:220:1::1", family: 6 }]);
  });

  it("returns every address when the connection asks for all of them", async () => {
    const entries = [...PUBLIC_V4, { address: "2606:2800:220:1::1", family: 6 }];
    host("feeds.example.com", entries);
    route("https://feeds.example.com/a", { chunks: ["x"], lookupAll: true });

    await safeFetch("https://feeds.example.com/a", LIMITS);

    expect(net.resolved).toEqual([{ hostname: "feeds.example.com", address: entries, family: undefined }]);
  });

  it("clears the overall deadline once the download finishes", async () => {
    vi.useFakeTimers();
    host("feeds.example.com");
    route("https://feeds.example.com/a", { chunks: ["x"] });

    await safeFetch("https://feeds.example.com/a", LIMITS);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("safeFetch: URL and scheme checks", () => {
  it.each([
    ["http://feeds.example.com/feed.csv", "https"],
    ["file:///etc/passwd", "https"],
    ["ftp://feeds.example.com/feed.csv", "https"],
    ["gopher://feeds.example.com/", "https"],
    ["not a url", "valid URL"],
    ["https://user:pass@feeds.example.com/", "credentials"],
    ["https://feeds.example.com:8443/", "standard https port"],
    ["https://localhost/feed", "private"],
    ["https://127.0.0.1/feed", "private"],
    ["https://169.254.169.254/latest/meta-data", "private"],
    ["https://[::1]/feed", "private"],
    ["https://printer.local/feed", "private"],
  ])("refuses %s without connecting", async (url, message) => {
    await expect(safeFetch(url, LIMITS)).rejects.toThrow(message);
    await expect(safeFetch(url, LIMITS)).rejects.toBeInstanceOf(SafeFetchError);
    expect(net.requests).toHaveLength(0);
  });
});

describe("safeFetch: DNS resolution guard", () => {
  it.each([
    ["loopback", "127.0.0.1", 4],
    ["private 10/8", "10.1.2.3", 4],
    ["private 172.16/12", "172.20.0.5", 4],
    ["private 192.168/16", "192.168.1.10", 4],
    ["link-local cloud metadata", "169.254.169.254", 4],
    ["CGNAT", "100.64.0.1", 4],
    ["unspecified", "0.0.0.0", 4],
    ["IPv6 loopback", "::1", 6],
    ["IPv6 link-local", "fe80::1", 6],
    ["IPv6 unique local", "fd00::1", 6],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1", 6],
  ])("blocks a public name that resolves to %s (%s)", async (_label, address, family) => {
    host("rebind.example.com", [{ address, family }]);
    route("https://rebind.example.com/feed", { chunks: ["secret"] });

    await expect(safeFetch("https://rebind.example.com/feed", LIMITS)).rejects.toThrow("private network");
    expect(net.responses).toHaveLength(0);
  });

  it("blocks a name when any one of its addresses is private", async () => {
    host("mixed.example.com", [...PUBLIC_V4, { address: "10.0.0.1", family: 4 }]);
    route("https://mixed.example.com/feed", { chunks: ["x"], lookupAll: true });

    await expect(safeFetch("https://mixed.example.com/feed", LIMITS)).rejects.toThrow("private network");
    expect(net.resolved).toHaveLength(0);
  });

  it("blocks a name that resolves to no addresses", async () => {
    host("empty.example.com", []);
    route("https://empty.example.com/feed", { chunks: ["x"] });

    await expect(safeFetch("https://empty.example.com/feed", LIMITS)).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("passes resolver failures through as non-SafeFetch errors", async () => {
    route("https://missing.example.com/feed", { chunks: ["x"] });

    const error = await safeFetch("https://missing.example.com/feed", LIMITS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SafeFetchError);
    expect((error as Error).message).toContain("ENOTFOUND");
  });
});

describe("safeFetch: redirects", () => {
  it("follows a relative redirect and reports the final URL", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/old", { status: 301, headers: { location: "/new.csv" } });
    route("https://feeds.example.com/new.csv", { chunks: ["ok"] });

    const file = await safeFetch("https://feeds.example.com/old", LIMITS);

    expect(file.finalUrl).toBe("https://feeds.example.com/new.csv");
    expect(file.body.toString()).toBe("ok");
    expect(net.responses[0].resumed).toBe(true);
  });

  it("re-validates the scheme of every hop", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/old", { status: 302, headers: { location: "http://feeds.example.com/plain" } });

    await expect(safeFetch("https://feeds.example.com/old", LIMITS)).rejects.toThrow("https");
    expect(net.requests).toHaveLength(1);
  });

  it("refuses a redirect to a private IP literal", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/old", { status: 307, headers: { location: "https://169.254.169.254/latest/meta-data/" } });

    await expect(safeFetch("https://feeds.example.com/old", LIMITS)).rejects.toThrow("private or internal");
    expect(net.requests).toHaveLength(1);
  });

  it("re-resolves the redirect host and refuses a private answer", async () => {
    host("feeds.example.com");
    host("internal.example.net", [{ address: "192.168.0.1", family: 4 }]);
    route("https://feeds.example.com/old", { status: 302, headers: { location: "https://internal.example.net/admin" } });
    route("https://internal.example.net/admin", { chunks: ["secret"] });

    await expect(safeFetch("https://feeds.example.com/old", LIMITS)).rejects.toThrow("private network");
    expect(net.requests.map((r) => r.url)).toEqual(["https://feeds.example.com/old", "https://internal.example.net/admin"]);
  });

  it("stops after the redirect limit", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { status: 302, headers: { location: "/b" } });
    route("https://feeds.example.com/b", { status: 302, headers: { location: "/a" } });

    await expect(safeFetch("https://feeds.example.com/a", { ...LIMITS, maxRedirects: 2 })).rejects.toThrow("Too many redirects");
    expect(net.requests).toHaveLength(3);
  });

  it("allows three redirects by default", async () => {
    host("feeds.example.com");
    ["1", "2", "3"].forEach((n, i) => route(`https://feeds.example.com/${n}`, { status: 302, headers: { location: `/${i + 2}` } }));
    route("https://feeds.example.com/4", { chunks: ["done"] });

    await expect(safeFetch("https://feeds.example.com/1", LIMITS)).resolves.toMatchObject({ finalUrl: "https://feeds.example.com/4" });
  });

  it("rejects a malformed location instead of throwing out of the response handler", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { status: 302, headers: { location: "https://[bad" } });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("invalid redirect");
    expect(net.requests).toHaveLength(1);
  });

  it("treats a 3xx without a location as a failed status", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { status: 302 });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("status 302");
  });
});

describe("safeFetch: response checks", () => {
  it("rejects non-200 statuses and drains the body", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { status: 500, chunks: ["boom"] });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("status 500");
    expect(net.responses[0].resumed).toBe(true);
  });

  it("rejects a declared content-length over the cap without reading", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { headers: { "content-length": "1025" }, chunks: ["x"] });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("too large");
    expect(net.responses[0].destroyed).toBe(true);
  });

  it("aborts a streamed body that grows past the cap", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { chunks: ["a".repeat(600), "b".repeat(600), "c".repeat(600)] });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("too large");
    expect(net.responses[0].destroyed).toBe(true);
  });

  it("accepts a body exactly at the cap", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { chunks: ["a".repeat(512), "b".repeat(512)] });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).resolves.toMatchObject({ body: expect.any(Buffer) });
  });

  it("accepts listed content types, ignoring parameters and case", async () => {
    host("img.example.com");
    route("https://img.example.com/a.png", { headers: { "content-type": "IMAGE/PNG; q=1" }, chunks: ["png"] });

    await expect(safeFetch("https://img.example.com/a.png", { ...LIMITS, acceptTypes: ["image/png"] })).resolves.toMatchObject({ contentType: "image/png; q=1" });
  });

  it("rejects an unlisted content type and drains the body", async () => {
    host("img.example.com");
    route("https://img.example.com/a.svg", { headers: { "content-type": "image/svg+xml" }, chunks: ["<svg/>"] });

    await expect(safeFetch("https://img.example.com/a.svg", { ...LIMITS, acceptTypes: ["image/png"] })).rejects.toThrow('Unexpected content type "image/svg+xml"');
    expect(net.responses[0].resumed).toBe(true);
  });

  it("reports a missing content type as none", async () => {
    host("img.example.com");
    route("https://img.example.com/a", { chunks: ["x"] });

    await expect(safeFetch("https://img.example.com/a", { ...LIMITS, acceptTypes: ["image/png"] })).rejects.toThrow('"none"');
  });

  it("strips unprintable characters and truncates remote content types in errors", async () => {
    host("img.example.com");
    route("https://img.example.com/a", { headers: { "content-type": `text/html\u0007‮${"x".repeat(100)}` }, chunks: ["x"] });

    await expect(safeFetch("https://img.example.com/a", { ...LIMITS, acceptTypes: ["image/png"] })).rejects.toMatchObject({
      message: `Unexpected content type "text/html${"x".repeat(51)}".`,
    });
  });

  it("propagates a stream error", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { behaviour: "broken" });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("socket hang up");
  });
});

describe("safeFetch: early close", () => {
  it("rejects when request() throws and leaves no deadline timer behind", async () => {
    vi.useFakeTimers();
    host("feeds.example.com");
    route("https://feeds.example.com/a", { behaviour: "throws" });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("Invalid header value");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects at once when the body closes before it ends", async () => {
    host("feeds.example.com");
    route("https://feeds.example.com/a", { behaviour: "cut" });

    await expect(safeFetch("https://feeds.example.com/a", LIMITS)).rejects.toThrow("closed before");
  });
});

describe("safeFetch: timeouts", () => {
  it("fails when the socket goes idle", async () => {
    host("slow.example.com");
    route("https://slow.example.com/a", { behaviour: "idle" });

    await expect(safeFetch("https://slow.example.com/a", LIMITS)).rejects.toThrow("took too long");
  });

  it("fails a server that never finishes once the overall deadline passes", async () => {
    vi.useFakeTimers();
    host("slow.example.com");
    route("https://slow.example.com/a", { behaviour: "hang" });

    const result = safeFetch("https://slow.example.com/a", { ...LIMITS, timeoutMs: 1000 });
    const assertion = expect(result).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(1999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
});
