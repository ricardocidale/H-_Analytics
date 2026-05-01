import { describe, it, expect } from "vitest";
import { isBlockedHost, isBlockedHostResolved } from "../../server/routes/ssrf-guard";

describe("isBlockedHost (synchronous)", () => {
  it("blocks metadata.google.internal", () => {
    expect(isBlockedHost("metadata.google.internal")).toBe(true);
  });

  it("blocks localhost", () => {
    expect(isBlockedHost("localhost")).toBe(true);
  });

  it("blocks any .internal suffix", () => {
    expect(isBlockedHost("evil.internal")).toBe(true);
    expect(isBlockedHost("foo.bar.internal")).toBe(true);
  });

  it("blocks 127.0.0.1 (loopback)", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
  });

  it("blocks 127.x.x.x range", () => {
    expect(isBlockedHost("127.0.0.2")).toBe(true);
    expect(isBlockedHost("127.255.255.255")).toBe(true);
  });

  it("blocks 10.x.x.x (RFC 1918)", () => {
    expect(isBlockedHost("10.0.0.1")).toBe(true);
    expect(isBlockedHost("10.255.255.255")).toBe(true);
  });

  it("blocks 172.16-31.x.x (RFC 1918)", () => {
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });

  it("does not block 172.32.x.x (outside /12)", () => {
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });

  it("blocks 192.168.x.x (RFC 1918)", () => {
    expect(isBlockedHost("192.168.0.1")).toBe(true);
    expect(isBlockedHost("192.168.255.255")).toBe(true);
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("169.254.0.1")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("[::1]")).toBe(true);
  });

  it("blocks IPv6 unspecified ::", () => {
    expect(isBlockedHost("::")).toBe(true);
  });

  it("blocks IPv6 link-local (fe80:)", () => {
    expect(isBlockedHost("fe80::1")).toBe(true);
  });

  it("blocks IPv6 ULA (fc/fd)", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
    expect(isBlockedHost("fd12:3456::1")).toBe(true);
  });

  it("blocks IPv6-mapped IPv4 private addresses", () => {
    expect(isBlockedHost("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedHost("::ffff:192.168.1.1")).toBe(true);
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("93.184.216.34")).toBe(false);
  });

  it("allows public hostnames (synchronous check only)", () => {
    expect(isBlockedHost("example.com")).toBe(false);
  });
});

describe("isBlockedHostResolved (async with DNS)", () => {
  it("blocks direct private IPs", async () => {
    expect(await isBlockedHostResolved("10.0.0.1")).toBe(true);
    expect(await isBlockedHostResolved("192.168.1.1")).toBe(true);
    expect(await isBlockedHostResolved("127.0.0.1")).toBe(true);
  });

  it("blocks localhost by name", async () => {
    expect(await isBlockedHostResolved("localhost")).toBe(true);
  });

  it("allows public IPs", async () => {
    expect(await isBlockedHostResolved("8.8.8.8")).toBe(false);
  });
});
