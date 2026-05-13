/**
 * Hugo — Bracket-Mix Aggregator Minion
 *
 * Phase B U4 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Pure deterministic aggregator: combines every active peer's
 * `brand_archetype_split` (Tiago output) weighted by its
 * `roster_size_estimate` into one normalized `BracketMixData` for the
 * Mgmt-Co global default.
 *
 * Same input set → byte-identical output (R3). No LLM, no judgment, no
 * external I/O. The optional `persistRun` caller can opt-in to writing
 * a `bracket_mix_runs` row tagged `target_kind='global_default'`; on
 * cold start (zero researched peers) Hugo returns
 * `{ provisional: true }` and the caller is expected NOT to persist
 * (R4 — provisional state is computed at read time, not stored).
 */

import type {
  BracketMixData,
  BracketEntry,
  BrandArchetypeSplit,
} from "@workspace/db";

// Active bracket catalog row (subset Hugo needs for normalization).
export interface ActiveBracket {
  slug: string;
  name: string;
  archetypeLabel: string;
  /** "hotel" | "str" — Hugo derives BracketEntry.serviceConsumption from this. */
  customerType: string;
}

// Subset of an icp_peer_companies row Hugo reads.
export interface PeerRow {
  id: number;
  isActive: boolean;
  rosterSizeEstimate: number | null;
  brandArchetypeSplit: BrandArchetypeSplit | null;
}

export interface HugoAggregateResult {
  mix: BracketMixData;
  /** True when the result was derived from cold-start equal-weight (R4). */
  provisional: boolean;
  /** Sum of `roster_size_estimate` across the peers that contributed weight. */
  totalRosterEstimate: number;
  /** Peer ids whose splits actually contributed (roster_size > 0, split non-null). */
  contributingPeerIds: number[];
}

/**
 * Aggregate active peers into a single global-default BracketMixData.
 *
 * Inputs:
 *   - `peers`: every `icp_peer_companies` row the orchestrator pulled
 *     (Hugo filters `is_active=true` itself for explicit determinism).
 *   - `activeBrackets`: every `icp_brackets` row with `is_active=true`,
 *     used to (a) drive the cold-start equal-weight fallback and (b)
 *     hydrate each output entry with the bracket catalog's display
 *     fields. Slugs the peers reference that aren't in `activeBrackets`
 *     are silently dropped (R3 deterministic skip).
 *   - `evidenceLabel`: free-form provenance string written to
 *     `BracketMixData.evidence`.
 *
 * Output:
 *   - On cold start (no peer has a non-null split with positive
 *     roster_size_estimate): `provisional=true`, equal-weight across
 *     `activeBrackets`, `contributingPeerIds=[]`. The caller MUST NOT
 *     persist this as a `bracket_mix_runs` row.
 *   - Otherwise: `provisional=false`, weights normalized so the entries
 *     sum to 1.0 across the slugs present in `activeBrackets`.
 *
 * Determinism guarantees (R3):
 *   - Iteration order on `activeBrackets` is preserved as supplied
 *     (callers should pass sorted by slug for cross-run stability).
 *   - Float reduction order is fixed (one pass, no parallel `sum`).
 *   - The `assignedAt` field is taken from the supplied `now` parameter
 *     when present; default `new Date()` is non-deterministic but
 *     intentionally only on the metadata layer — `entries` are pure.
 */
export function aggregate(args: {
  peers: PeerRow[];
  activeBrackets: ActiveBracket[];
  evidenceLabel: string;
  now?: Date;
}): HugoAggregateResult {
  const { peers, activeBrackets, evidenceLabel, now = new Date() } = args;

  const activeSlugs = new Set(activeBrackets.map((b) => b.slug));

  // Filter to peers that actually contribute: active, non-null split,
  // positive roster size estimate. Peers with rosterSizeEstimate=0
  // contribute zero weight (test scenario in plan U4).
  const contributing = peers.filter(
    (p) =>
      p.isActive &&
      p.brandArchetypeSplit !== null &&
      (p.rosterSizeEstimate ?? 0) > 0,
  );

  if (contributing.length === 0) {
    return coldStartMix(activeBrackets, evidenceLabel, now);
  }

  // Sum weighted contributions per slug. Use a plain object iterating
  // by activeBrackets.slug order so output ordering is deterministic.
  const weighted = new Map<string, number>();
  for (const slug of activeSlugs) {
    weighted.set(slug, 0);
  }

  let totalRoster = 0;
  const contributingIds: number[] = [];

  for (const peer of contributing) {
    const roster = peer.rosterSizeEstimate ?? 0;
    totalRoster += roster;
    contributingIds.push(peer.id);
    for (const entry of peer.brandArchetypeSplit!.entries) {
      if (!activeSlugs.has(entry.bracketSlug)) continue; // R3 skip
      const prior = weighted.get(entry.bracketSlug) ?? 0;
      weighted.set(entry.bracketSlug, prior + entry.weight * roster);
    }
  }

  // Normalize: divide each slug's accumulated weighted-contribution by the
  // sum of all accumulated weighted-contributions, so the output sums to 1.
  // (Note: dividing by totalRoster would only sum to 1 when every peer's
  // input split itself summed to 1; we trust Tiago's Zod check but
  // normalize defensively.)
  const accumulatedTotal = Array.from(weighted.values()).reduce(
    (sum, w) => sum + w,
    0,
  );
  const entries: BracketEntry[] = [];
  if (accumulatedTotal > 0) {
    for (const bracket of activeBrackets) {
      const raw = weighted.get(bracket.slug) ?? 0;
      const weight = raw / accumulatedTotal;
      if (weight === 0) continue; // omit zero-weight entries from the mix
      entries.push({
        id: bracket.slug,
        name: bracket.name,
        archetypeLabel: bracket.archetypeLabel,
        serviceConsumption: bracket.customerType === "str" ? "str" : "hotel",
        weight,
      });
    }
  }

  // If after normalization no entries survived (e.g. all peer slugs were
  // unknown to activeBrackets), fall back to cold-start. Hugo never emits
  // an empty `entries` array in normal-mode results.
  if (entries.length === 0) {
    return coldStartMix(activeBrackets, evidenceLabel, now);
  }

  return {
    mix: {
      entries,
      assignedAt: now.toISOString(),
      evidence: evidenceLabel,
    },
    provisional: false,
    totalRosterEstimate: totalRoster,
    contributingPeerIds: contributingIds,
  };
}

/**
 * Cold-start (R4): equal-weight across active brackets, marked provisional.
 * Caller MUST NOT persist this as a bracket_mix_runs row — provisional
 * state is computed at read time, not stored.
 */
function coldStartMix(
  activeBrackets: ActiveBracket[],
  evidenceLabel: string,
  now: Date,
): HugoAggregateResult {
  const equalWeight = activeBrackets.length > 0 ? 1 / activeBrackets.length : 0;
  const entries: BracketEntry[] = activeBrackets.map((b) => ({
    id: b.slug,
    name: b.name,
    archetypeLabel: b.archetypeLabel,
    serviceConsumption: b.customerType === "str" ? "str" : "hotel",
    weight: equalWeight,
  }));
  return {
    mix: {
      entries,
      assignedAt: now.toISOString(),
      evidence: `${evidenceLabel} — cold-start equal-weight (provisional)`,
    },
    provisional: true,
    totalRosterEstimate: 0,
    contributingPeerIds: [],
  };
}
