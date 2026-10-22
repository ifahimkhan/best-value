import { isIP } from "node:net";

type Range = readonly [base: number, bits: number];

// Loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, test nets, multicast, reserved
const BLOCKED_V4: readonly Range[] = [
  [ipv4ToInt("0.0.0.0"), 8],
  [ipv4ToInt("10.0.0.0"), 8],
  [ipv4ToInt("100.64.0.0"), 10],
  [ipv4ToInt("127.0.0.0"), 8],
  [ipv4ToInt("169.254.0.0"), 16],
  [ipv4ToInt("172.16.0.0"), 12],
  [ipv4ToInt("192.0.0.0"), 24],
  [ipv4ToInt("192.0.2.0"), 24],
  [ipv4ToInt("192.168.0.0"), 16],
  [ipv4ToInt("198.18.0.0"), 15],
  [ipv4ToInt("198.51.100.0"), 24],
  [ipv4ToInt("203.0.113.0"), 24],
  [ipv4ToInt("224.0.0.0"), 4],
  [ipv4ToInt("240.0.0.0"), 4],
];

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

function inRange(value: number, [base, bits]: Range): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(base / size);
}

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some((range) => inRange(value, range));
}

/** Expands an IPv6 address to eight 16-bit groups, handling "::" and a dotted IPv4 tail. */
function ipv6Groups(ip: string): number[] {
  let text = ip.toLowerCase().split("%")[0];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[1]);
    text = `${text.slice(0, -dotted[1].length)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((group) => parseInt(group, 16));
}

function groupsToV4(high: number, low: number): string {
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function isPrivateV6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (g.length !== 8 || g.some((n) => Number.isNaN(n))) return true;
  const zeroPrefix = (count: number): boolean => g.slice(0, count).every((n) => n === 0);
  if (zeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (zeroPrefix(5) && g[5] === 0xffff) return isPrivateV4(groupsToV4(g[6], g[7])); // IPv4-mapped
  if (zeroPrefix(6)) return true; // deprecated IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] !== 0 || isPrivateV4(groupsToV4(g[6], g[7])); // NAT64 (incl. local-use 64:ff9b:1::/48)
  if (g[0] === 0x2002) return isPrivateV4(groupsToV4(g[1], g[2])); // 6to4 embeds an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo tunnels
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0; // discard-only 100::/64
}

/** True for any address a server-side fetch must never reach. Unparseable input counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip.split("%")[0]);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Static checks on a supplier feed or image URL. DNS results are checked again at fetch time. */
export function validateFeedUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The URL must use https." };
  if (url.username || url.password) return { ok: false, error: "URLs with credentials are not allowed; use a token in the query string." };
  if (url.port !== "" && url.port !== "443") return { ok: false, error: "Only the standard https port is allowed." };
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blockedName = host === "localhost" || !host.includes(".") || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (blockedName || (isIP(host) !== 0 && isPrivateAddress(host))) {
    return { ok: false, error: "The URL points to a private or internal address." };
  }
  return { ok: true, url };
}
