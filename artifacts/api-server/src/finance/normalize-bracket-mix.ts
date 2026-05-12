/**
 * normalize-bracket-mix.ts — Coerce persisted bracket-mix shapes into engine inputs.
 *
 * Task #1428 — wire bracket weights into Mgmt Co revenue calculations.
 * Task #1486 — unify persisted shape; this translator is now a thin pass-through.
 *
 * The canonical persisted shape for `global_assumptions.bracket_mix` is now
 * BracketMixData = { entries: BracketEntry[], assignedAt?, evidence? } where
 * each BracketEntry carries `id`, `name`, `archetypeLabel`, `serviceConsumption`,
 * and `weight`.
 *
 * Both writers (the ICP catalog API and the bracket-assignment minion) now
 * emit this same shape. The old flat-array shape ([ { bracketSlug, weight } ])
 * is no longer written; any legacy rows were converted by icp-brackets-002.
 *
 * The engine consumes a single normalized pair: (BracketMixEntry[],
 * IcpBracketProfile[]). This module accepts BracketMixData and returns that
 * pair. The `brackets` field is SYNTHESIZED from each entry's
 * `serviceConsumption` field — no DB lookup needed.
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
   * Always populated — callers no longer need a DB fallback lookup.
   */
  brackets: IcpBracketProfile[];
}

// ── Persisted-shape guards ─────────────────────────────────────────────────

interface PersistedEntry {
  id: string;
  name?: string;
  archetypeLabel?: string;
  serviceConsumption: "hotel" | "str" | "mixed";
  weight: number;
}

interface PersistedBracketMixData {
  entries: PersistedEntry[];
}

function isPersistedEntry(value: unknown): value is PersistedEntry {
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

function isPersistedBracketMixData(
  value: unknown,
): value is PersistedBracketMixData {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return Array.isArray(r.entries) && r.entries.every(isPersistedEntry);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Normalize whatever shape was persisted in `global_assumptions.bracket_mix`
 * into the pair the engine consumes. Returns `null` when the value is
 * missing, the wrong shape, or empty — callers should treat that as
 * "no bracket scaling".
 *
 * Only the canonical BracketMixData shape is handled. The old flat-array
 * format ([ { bracketSlug, weight } ]) is no longer written; any legacy rows
 * were converted by the icp-brackets-002 migration.
 */
export function normalizePersistedBracketMix(
  raw: unknown,
): NormalizedBracketMix | null {
  if (isPersistedBracketMixData(raw)) {
    return synthesizeFromEntries(raw.entries);
  }
  return null;
}

/**
 * Build engine inputs directly from persisted BracketMixData entries. Each
 * entry's `serviceConsumption` field decides the synthetic profile:
 *
 *   "hotel" → one `full` profile, full weight
 *   "str"   → one `str_only` profile, full weight
 *   "mixed" → two synthetic profiles (full + str_only), each at half weight
 *
 * Slugs for "mixed" entries are namespaced with the entry id so they cannot
 * collide with real `icp_brackets` rows. Empty input returns `null`.
 */
function synthesizeFromEntries(
  entries: PersistedEntry[],
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
