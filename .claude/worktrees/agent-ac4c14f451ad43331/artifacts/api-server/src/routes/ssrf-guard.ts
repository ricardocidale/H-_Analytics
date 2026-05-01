import { isIP } from "net";
import { resolve4, resolve6 } from "dns/promises";

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "localhost",
]);

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isInCIDR(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const mask = (~0 << (32 - Number(bits))) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

const PRIVATE_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "0.0.0.0/8",
];

function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_CIDRS.some((cidr) => isInCIDR(ip, cidr));
}

function isBlockedIPv6(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "");
  if (clean === "::1" || clean === "::") return true;
  if (clean.startsWith("fe80:")) return true;
  if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
  if (clean.startsWith("::ffff:")) {
    const v4 = clean.slice(7);
    if (isIP(v4) === 4) return isPrivateIPv4(v4);
  }
  return false;
}

function isBlockedIP(ip: string): boolean {
  const stripped = ip.replace(/^\[|\]$/g, "");
  if (isIP(stripped) === 4) return isPrivateIPv4(stripped);
  if (isIP(stripped) === 6) return isBlockedIPv6(stripped);
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".internal")) return true;
  return isBlockedIP(hostname);
}

async function safeResolve4(hostname: string): Promise<string[]> {
  try {
    return await resolve4(hostname);
  } catch {
    return [];
  }
}

async function safeResolve6(hostname: string): Promise<string[]> {
  try {
    return await resolve6(hostname);
  } catch {
    return [];
  }
}

export async function isBlockedHostResolved(hostname: string): Promise<boolean> {
  if (isBlockedHost(hostname)) return true;

  if (isIP(hostname) !== 0) return false;

  const v4Addrs = await safeResolve4(hostname);
  for (const addr of v4Addrs) {
    if (isPrivateIPv4(addr)) return true;
  }

  const v6Addrs = await safeResolve6(hostname);
  for (const addr of v6Addrs) {
    if (isBlockedIPv6(addr)) return true;
  }

  return false;
}
