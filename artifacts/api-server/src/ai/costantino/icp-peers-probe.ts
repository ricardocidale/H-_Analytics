/**
 * Costantino — ICP peer-research freshness probe
 *
 * Phase B U7 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Pure, no-LLM probe that iterates active `icp_peer_companies` rows and
 * returns the peer ids whose `last_researched_at` is older than their
 * effective freshness threshold. The caller (Costantino's agent or a
 * scheduled worker) is responsible for opening
 * `costantino_findings` rows tagged `kind='peer_research_stale'` for the
 * surfaced peers and for queueing the re-research fan-out into Tiago via
 * `runForPeer`.
 *
 * Resolution order for the staleness threshold (R13):
 *   1. Per-peer override: `icp_peer_companies.costantino_config.staleAfterDays`
 *   2. admin_resources fallback: `admin_resources.config.peerFreshness.staleAfterDays`
 *      (kind='table', slug='icp-peer-companies')
 *   3. Hard fallback if both DB rows are missing: 90 days (matches
 *      admin-resources-014 seed value).
 *
 * Cold start (last_researched_at IS NULL) → always considered stale so
 * brand-new peers get researched on the next cycle.
 */
import { eq, and } from "drizzle-orm";

import { db as defaultDb } from "../../db";
import { adminResources, icpPeerCompanies, costantinoFindings } from "@workspace/db";

const PEER_FRESHNESS_ADMIN_RESOURCE_SLUG = "icp-peer-companies";
const PEER_FRESHNESS_ADMIN_RESOURCE_KIND = "table";
const FINDING_KIND_PEER_RESEARCH_STALE = "peer_research_stale";
const FALLBACK_STALE_AFTER_DAYS = 90; // mirrors admin-resources-014 seed
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PeerStatus {
  peerId: number;
  peerName: string;
  staleAfterDays: number;
  lastResearchedAt: Date | null;
  isStale: boolean;
}

export interface IcpPeersProbeResult {
  thresholdDefaultDays: number;
  inspected: number;
  stalePeers: PeerStatus[];
  /** Peer ids that already have an open peer_research_stale finding — caller MUST NOT open duplicates. */
  alreadyOpenPeerIds: number[];
}

export interface IcpPeersProbeDeps {
  db: typeof defaultDb;
  now: () => Date;
}

function defaultDeps(): IcpPeersProbeDeps {
  return { db: defaultDb, now: () => new Date() };
}

/**
 * Run the probe and return the staleness report. Does NOT open findings —
 * the caller (Costantino agent or scheduled worker) reads this and decides
 * which to open / which to skip (because they already have an open one).
 */
export async function probeIcpPeerResearchFreshness(
  deps: IcpPeersProbeDeps = defaultDeps(),
): Promise<IcpPeersProbeResult> {
  const thresholdDefaultDays = await resolveDefaultThreshold(deps.db);

  const peers = await deps.db
    .select({
      id: icpPeerCompanies.id,
      name: icpPeerCompanies.name,
      isActive: icpPeerCompanies.isActive,
      lastResearchedAt: icpPeerCompanies.lastResearchedAt,
      costantinoConfig: icpPeerCompanies.costantinoConfig,
    })
    .from(icpPeerCompanies)
    .where(eq(icpPeerCompanies.isActive, true));

  const now = deps.now();
  const stalePeers: PeerStatus[] = [];
  for (const peer of peers) {
    const perPeerOverride =
      typeof peer.costantinoConfig?.staleAfterDays === "number"
        ? peer.costantinoConfig.staleAfterDays
        : undefined;
    const effectiveDays = perPeerOverride ?? thresholdDefaultDays;
    const last = peer.lastResearchedAt;
    const isStale =
      last === null || now.getTime() - last.getTime() > effectiveDays * MS_PER_DAY;
    if (isStale) {
      stalePeers.push({
        peerId: peer.id,
        peerName: peer.name,
        staleAfterDays: effectiveDays,
        lastResearchedAt: last,
        isStale,
      });
    }
  }

  // Look up existing open findings to surface so the caller doesn't open duplicates.
  const stalePeerIds = stalePeers.map((p) => String(p.peerId));
  const alreadyOpenPeerIds: number[] = [];
  if (stalePeerIds.length > 0) {
    const openRows = await deps.db
      .select({
        targetId: costantinoFindings.targetId,
      })
      .from(costantinoFindings)
      .where(
        and(
          eq(costantinoFindings.kind, FINDING_KIND_PEER_RESEARCH_STALE),
          eq(costantinoFindings.targetKind, "icp_peer"),
        ),
      );
    const openTargets = new Set(
      openRows.map((r) => Number(r.targetId)).filter((n) => Number.isFinite(n)),
    );
    for (const peer of stalePeers) {
      if (openTargets.has(peer.peerId)) alreadyOpenPeerIds.push(peer.peerId);
    }
  }

  return {
    thresholdDefaultDays,
    inspected: peers.length,
    stalePeers,
    alreadyOpenPeerIds,
  };
}

async function resolveDefaultThreshold(db: typeof defaultDb): Promise<number> {
  try {
    const [row] = await db
      .select({ config: adminResources.config })
      .from(adminResources)
      .where(
        and(
          eq(adminResources.kind, PEER_FRESHNESS_ADMIN_RESOURCE_KIND),
          eq(adminResources.slug, PEER_FRESHNESS_ADMIN_RESOURCE_SLUG),
        ),
      )
      .limit(1);
    const cfg = (row?.config ?? null) as Record<string, unknown> | null;
    const probe =
      cfg && typeof cfg["peerFreshness"] === "object" && cfg["peerFreshness"] !== null
        ? (cfg["peerFreshness"] as Record<string, unknown>)
        : null;
    if (probe && typeof probe.staleAfterDays === "number") return probe.staleAfterDays;
  } catch {
    // Fall through to the hardcoded fallback below.
  }
  return FALLBACK_STALE_AFTER_DAYS;
}

export const __testing = {
  PEER_FRESHNESS_ADMIN_RESOURCE_SLUG,
  FINDING_KIND_PEER_RESEARCH_STALE,
  FALLBACK_STALE_AFTER_DAYS,
  MS_PER_DAY,
};
