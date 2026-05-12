/**
 * normalize-bracket-mix.ts — Coerce persisted bracket-mix shapes into engine inputs.
 *
 * Task #1428 — wire bracket weights into Mgmt Co revenue calculations.
 *
 * Two writers persist to `global_assumptions.bracket_mix`:
 *
 *   1. ICP catalog API (`PUT /api/icp/brackets/mix`) — writes a flat
 *      `BracketMixEntry[]` of `{ bracketSlug, weight }`. Slugs reference
 *      rows in the `icp_brackets` table.
 *
 *   2. Bracket-assignment minion (`POST /api/company/bracket-mix/assign`) —
 *      writes a `BracketMixData = { entries: BracketEntry[], ... }` where each
 *      entry carries `id`, `serviceConsumption: "hotel" | "str" | "mixed"`,
 *      `weight`, etc. The catalog ids are not guaranteed to match
 *      `icp_brackets.slug`.
 *
 * The engine consumes a single normalized pair: `(BracketMixEntry[],
 * IcpBracketProfile[])`. This module accepts either persisted shape and
 * returns that pair, plus a flag telling the caller whether engine-side
 * profile data still needs to be loaded from the `icp_brackets` table.
 *
 * Shape detection rules:
 *   - `Array.isArray(raw)` → catalog-API shape; profiles come from the DB.
 *   - `raw.entries` array → minion shape; profiles are SYNTHESIZED from each
 *     entry's `serviceConsumption` field. No DB lookup needed.
 *
 * Two writers used to persist different shapes to `global_assumptions.bracket_mix`:
 *
 *   1. ICP catalog API (`PUT /api/icp/brackets/mix`) — used to write a flat
 *      `BracketMixEntry[]` of `{ bracketSlug, weight }`. Slugs reference
 *      rows in the `icp_brackets` table.
 *
 *   2. Bracket-assignment minion (`POST /api/company/bracket-mix/assign`) —
 *      writes a `BracketMixData = { entries: BracketEntry[], ... }` where each
 *      entry carries `id`, `serviceConsumption: "hotel" | "str" | "mixed"`,
 *      `weight`, etc. The catalog ids are not guaranteed to match
 *      `icp_brackets.slug`.
 *
 * The engine consumes a single normalized pair: `(BracketMixEntry[],
 * IcpBracketProfile[])`. This module accepts either persisted shape and
 * returns that pair, plus a flag telling the caller whether engine-side
 * profile data still needs to be loaded from the `icp_brackets` table.
 *
 * Shape detection rules:
 *   - `Array.isArray(raw)` → catalog-API shape; profiles come from the DB.
 *   - `raw.entries` array → minion shape; profiles are SYNTHESIZED from each
 *     entry's `serviceConsumption` field. No DB lookup needed.
 *
 * "mixed" handling: per `bracket-catalog.ts` doctrine, mixed brackets show
 * "blended service-consumption profile reflecting both hotel-style
 * accommodation and STR-style short-stay units". We split a mixed entry's
 * weight evenly between two synthetic profiles — one `full` and one
 * `str_only` — so the engine's per-category scalar comes out at exactly the
 * midpoint of the pure-hotel and pure-STR results.
 */

import type {
  BracketMixEntry,
  IcpBracketProfile,
} from "@engine/company/icp-bracket-types";

// ── Named constants (CLAUDE.md §1) ─────────────────────────────────────────

/** Suffix appended to the synthetic "full" half of a mixed bracket. */
const MIXED_HOTEL_SLUG_SUFFIX = "__mixed-hotel";

/** Suffix appended to the synthetic "str_only" half of a mixed bracket. */
const MIXED_STR_SLUG_SUFFIX = "__mixed-str";

/** Half-weight applied to each side of a "mixed" bracket split. */
const MIXED_SPLIT_FRACTION = 0.5;

// ── Types ──────────────────────────────────────────────────────────────────

export interface NormalizedBracketMix {
  bracketMix: BracketMixEntry[];
  /**
   * Synthesized profiles derived from each entry's serviceConsumption field.
   * Always populated for the unified shape — callers only need a DB fallback
   * lookup if using the legacy flat catalog-API shape (where this is null).
   */
  brackets: IcpBracketProfile[] | null;
}

// ── Persisted-shape guards ─────────────────────────────────────────────────

interface PersistedMinionEntry {
  id: string;
  name?: string;
  archetypeLabel?: string;
  serviceConsumption: "hotel" | "str" | "mixed";
  weight: number;
}

interface PersistedMinionData {
  entries: PersistedMinionEntry[];
}

function isMinionEntry(value: unknown): value is PersistedMinionEntry {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.weight === "number" &&
    (r.serviceConsumption === "hotel" ||
      r.serviceConsumption === "str" ||
      r.serviceConsumption === "mixed")
  );
}

function isMinionData(value: unknown): value is PersistedMinionData {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return Array.isArray(r.entries) && r.entries.every(isMinionEntry);
}

function isCatalogEntry(value: unknown): value is BracketMixEntry {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.bracketSlug === "string" && typeof r.weight === "number";
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Normalize whatever shape was persisted in `global_assumptions.bracket_mix`
 * into the pair the engine consumes. Returns `null` when the value is
 * missing, the wrong shape, or empty — callers should treat that as
 * "no bracket scaling".
 * Only the canonical BracketMixData shape is handled. The old flat-array
 * format ([ { bracketSlug, weight } ]) is no longer written; any legacy rows
 * were converted by the icp-brackets-002 migration.
 */
export function normalizePersistedBracketMix(
  raw: unknown,
): NormalizedBracketMix | null {
  // Catalog-API shape: flat array of { bracketSlug, weight }.
  // Legacy shape, only handled for backwards compatibility.
  if (Array.isArray(raw)) {
    const entries = raw.filter(isCatalogEntry);
    if (entries.length === 0) return null;
    return { bracketMix: entries, brackets: null };
  }

  // BracketMixData shape: { entries: BracketEntry[], assignedAt?, evidence? }.
  if (isPersistedBracketMixData(raw)) {
    return synthesizeFromEntries(raw.entries);
  }

  // Minion shape: { entries: BracketEntry[], assignedAt?, evidence? }.
  if (isMinionData(raw)) {
    return synthesizeFromMinionEntries(raw.entries);
  }

  return null;
}

/**
 * Build engine inputs directly from minion entries. Each entry's
 * `serviceConsumption` field decides the synthetic profile:
 *
 *   "hotel" → one `full` profile, full weight
 *   "str"   → one `str_only` profile, full weight
 *   "mixed" → two synthetic profiles (full + str_only), each at half weight
 *
 * Slugs are namespaced with the entry id so they cannot collide with real
 * `icp_brackets` rows even when the same column also stores catalog-shape
 * data on a different row. Empty input returns `null`.
 */
function synthesizeFromMinionEntries(
  entries: PersistedMinionEntry[],
): NormalizedBracketMix | null {
  if (entries.length === 0) return null;

  const bracketMix: BracketMixEntry[] = [];
  const brackets: IcpBracketProfile[] = [];

  for (const entry of entries) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) continue;

    if (entry.serviceConsumption === "mixed") {
      const hotelSlug = `${entry.id}${MIXED_HOTEL_SLUG_SUFFIX}`;
      const strSlug = `${entry.id}${MIXED_STR_SLUG_SUFFIX}`;
      const halfWeight = entry.weight * MIXED_SPLIT_FRACTION;

      bracketMix.push({ bracketSlug: hotelSlug, weight: halfWeight });
      bracketMix.push({ bracketSlug: strSlug, weight: halfWeight });
      brackets.push({
        slug: hotelSlug,
        name: entry.name ?? entry.id,
        customerType: "hotel",
        serviceConsumptionProfile: "full",
      });
      brackets.push({
        slug: strSlug,
        name: entry.name ?? entry.id,
        customerType: "str",
        serviceConsumptionProfile: "str_only",
      });
      continue;
    }

    const customerType = entry.serviceConsumption === "str" ? "str" : "hotel";
    const profile =
      entry.serviceConsumption === "str" ? "str_only" : "full";

    bracketMix.push({ bracketSlug: entry.id, weight: entry.weight });
    brackets.push({
      slug: entry.id,
      name: entry.name ?? entry.id,
      customerType,
      serviceConsumptionProfile: profile,
    });
  }

  if (bracketMix.length === 0) return null;
  return { bracketMix, brackets };
}
