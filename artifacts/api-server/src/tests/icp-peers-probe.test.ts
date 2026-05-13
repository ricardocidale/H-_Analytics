/**
 * Costantino — ICP peer-research freshness probe tests
 *
 * Phase B U7 of the ICP bracket-mix peer-derived rebuild plan. Covers AE6
 * (stale peer surfaced) + per-peer override + cold-start rule + duplicate-
 * finding-suppression contract.
 */
import { describe, it, expect } from "vitest";
import {
  probeIcpPeerResearchFreshness,
  __testing,
  type IcpPeersProbeDeps,
} from "../ai/costantino/icp-peers-probe";

const { MS_PER_DAY, FALLBACK_STALE_AFTER_DAYS } = __testing;

interface FakePeer {
  id: number;
  name: string;
  isActive: boolean;
  lastResearchedAt: Date | null;
  costantinoConfig: { staleAfterDays?: number } | null;
}

interface FakeFinding {
  targetKind: string;
  targetId: string;
  kind: string;
}

function makeDb(opts: {
  defaultThresholdDays?: number | null;
  peers: FakePeer[];
  openFindings?: FakeFinding[];
}): IcpPeersProbeDeps["db"] {
  return {
    select: (cols: Record<string, unknown>) => {
      const keys = Object.keys(cols);
      const isAdminResources = keys.includes("config");
      const isOpenFindingsLookup = keys.includes("targetId");
      const isPeerLookup = keys.includes("lastResearchedAt");
      return {
        from: () => ({
          where: () => {
            if (isAdminResources) {
              const v =
                opts.defaultThresholdDays === undefined
                  ? FALLBACK_STALE_AFTER_DAYS
                  : opts.defaultThresholdDays;
              return {
                limit: () =>
                  v === null
                    ? []
                    : [{ config: { peerFreshness: { staleAfterDays: v } } }],
              };
            }
            if (isPeerLookup) {
              return opts.peers.filter((p) => p.isActive);
            }
            if (isOpenFindingsLookup) {
              return (opts.openFindings ?? []).map((f) => ({ targetId: f.targetId }));
            }
            return [];
          },
        }),
      };
    },
  } as unknown as IcpPeersProbeDeps["db"];
}

const FIXED_NOW = new Date("2026-05-13T00:00:00.000Z");

function daysAgo(n: number): Date {
  return new Date(FIXED_NOW.getTime() - n * MS_PER_DAY);
}

describe("probeIcpPeerResearchFreshness — happy path (AE6)", () => {
  it("peer older than 90 days → surfaced as stale", async () => {
    const db = makeDb({
      peers: [
        { id: 1, name: "Stale Peer", isActive: true, lastResearchedAt: daysAgo(120), costantinoConfig: null },
        { id: 2, name: "Fresh Peer", isActive: true, lastResearchedAt: daysAgo(30), costantinoConfig: null },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.inspected).toBe(2);
    expect(result.stalePeers.map((p) => p.peerId)).toEqual([1]);
    expect(result.thresholdDefaultDays).toBe(FALLBACK_STALE_AFTER_DAYS);
  });

  it("peer with last_researched_at within threshold → not surfaced", async () => {
    const db = makeDb({
      peers: [
        { id: 1, name: "Fresh", isActive: true, lastResearchedAt: daysAgo(60), costantinoConfig: null },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.stalePeers).toHaveLength(0);
  });
});

describe("probeIcpPeerResearchFreshness — cold-start rule", () => {
  it("last_researched_at IS NULL → surfaced as stale (researched on next cycle)", async () => {
    const db = makeDb({
      peers: [
        { id: 7, name: "Cold Start", isActive: true, lastResearchedAt: null, costantinoConfig: null },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.stalePeers).toHaveLength(1);
    expect(result.stalePeers[0].peerId).toBe(7);
  });
});

describe("probeIcpPeerResearchFreshness — per-peer override (R13)", () => {
  it("per-peer costantino_config.staleAfterDays=30 overrides default 90", async () => {
    const db = makeDb({
      peers: [
        // 60 days old: fresh by default (90), STALE by per-peer override (30).
        { id: 1, name: "Override", isActive: true, lastResearchedAt: daysAgo(60), costantinoConfig: { staleAfterDays: 30 } },
        // 60 days old, no override: fresh by default.
        { id: 2, name: "No Override", isActive: true, lastResearchedAt: daysAgo(60), costantinoConfig: null },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.stalePeers.map((p) => p.peerId)).toEqual([1]);
    expect(result.stalePeers[0].staleAfterDays).toBe(30);
  });
});

describe("probeIcpPeerResearchFreshness — duplicate-finding suppression", () => {
  it("alreadyOpenPeerIds surfaces peers that already have an open finding so caller does not duplicate", async () => {
    const db = makeDb({
      peers: [
        { id: 1, name: "Stale 1", isActive: true, lastResearchedAt: daysAgo(120), costantinoConfig: null },
        { id: 2, name: "Stale 2", isActive: true, lastResearchedAt: daysAgo(130), costantinoConfig: null },
      ],
      openFindings: [
        { kind: "peer_research_stale", targetKind: "icp_peer", targetId: "1" },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.stalePeers.map((p) => p.peerId)).toEqual([1, 2]);
    expect(result.alreadyOpenPeerIds).toEqual([1]);
  });
});

describe("probeIcpPeerResearchFreshness — inactive peers excluded", () => {
  it("isActive=false rows are not inspected", async () => {
    const db = makeDb({
      peers: [
        { id: 1, name: "Inactive Stale", isActive: false, lastResearchedAt: daysAgo(365), costantinoConfig: null },
        { id: 2, name: "Active Fresh", isActive: true, lastResearchedAt: daysAgo(10), costantinoConfig: null },
      ],
    });
    const result = await probeIcpPeerResearchFreshness({ db, now: () => FIXED_NOW });
    expect(result.inspected).toBe(1);
    expect(result.stalePeers).toHaveLength(0);
  });
});
