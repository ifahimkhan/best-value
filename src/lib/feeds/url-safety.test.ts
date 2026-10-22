import { describe, expect, it } from "vitest";
import { isPrivateAddress, validateFeedUrl } from "./url-safety";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
    "2002:7f00:1::1",
    "2001:0:4136:e378::1",
    "64:ff9b:1::a00:1",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "13.235.1.1", "2606:4700::1111", "2002:808:808::1"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it("treats garbage as private", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("validateFeedUrl", () => {
  it("accepts plain https URLs", () => {
    expect(validateFeedUrl("https://supplier.example.com/feed.csv?key=1")).toEqual({
      ok: true,
      url: new URL("https://supplier.example.com/feed.csv?key=1"),
    });
  });

  it.each([
    ["http://supplier.example.com/feed.csv", "https"],
    ["ftp://supplier.example.com/feed.csv", "https"],
    ["https://user:pass@supplier.example.com/feed", "credentials"],
    ["https://127.0.0.1/feed", "private"],
    ["https://[::1]/feed", "private"],
    ["https://localhost/feed", "private"],
    ["https://metadata.google.internal/feed", "private"],
    ["https://supplier.example.com:22/feed", "port"],
    ["not a url", "valid"],
  ])("rejects %s", (url, reason) => {
    const result = validateFeedUrl(url);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.toLowerCase()).toContain(reason);
  });
});
