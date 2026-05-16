/**
 * bracket-assignment-minion — Deterministic minion that reads a Management
 * Company's portfolio and a set of Davi match-rules then emits a weighted ICP
 * bracket mix.
 *
 * Minion contract (CLAUDE.md §10):
 *   - No LLM calls, no judgment — fully deterministic given the same inputs.
 *   - Returns a BracketMixData with entries summing to exactly 1.0.
 *   - Every numeric weight is derived from portfolio signals, never hardcoded
 *     as an inline literal (per CLAUDE.md §1 no-magic-numbers).
 *
 * Algorithm:
 *   1. For each property, call Davi (pickBestFitBracket) with the DB-sourced
 *      match-rule set. Davi returns the slug of the highest-priority bracket
 *      whose predicates all match, or null if none match.
 *   2. Properties with null (no match) are assigned to the US Gateway Boutique
 *      bracket as a safe geographic default.
 *   3. Compute raw counts per bracket, normalise to weights summing to 1.0.
 *   4. If portfolio is empty, fall back to EMPTY_PORTFOLIO_DEFAULT_MIX.
 *
 * The match rules are loaded once by the caller from icp_brackets and passed
 * in — this minion is pure (no DB access, no I/O).
 */

import type { Property, GlobalAssumptions } from "@workspace/db";
import {
  BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT,
  BRACKET_ID_US_GATEWAY_BOUTIQUE,
  BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,
  BRACKET_ID_LATAM_RURAL_ILLIQUID,
  BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,
  BRACKET_CATALOG,
} from "./bracket-catalog";
import type { BracketEntry, BracketMixData } from "@workspace/db";
import { pickBestFitBracket, type BracketMatchRule } from "../../ai/ambient/minions/davi";

// ── Named thresholds (no inline numerics) ────────────────────────────────

/** Weight floor applied to any bracket that would otherwise reach zero. */
const MINIMUM_BRACKET_WEIGHT = 0.05;

// Default-mix weights for an empty portfolio (must sum to 1.0).
// Taxonomy: algorithm calibration constants (non-financial, non-admin-configurable).
// These are weights for a bracket-classification fallback — analogous to
// NOL_UTILIZATION_CAP in the engine — not financial model inputs. Confirmed
// exception to the DEFAULT_* prohibition in CLAUDE.md §2.
const EMPTY_MIX_WEIGHT_US_TERTIARY_RESORT  = 0.30;
const EMPTY_MIX_WEIGHT_US_GATEWAY          = 0.25;
const EMPTY_MIX_WEIGHT_LATAM_PRIME_URBAN   = 0.25;
const EMPTY_MIX_WEIGHT_LATAM_RURAL         = 0.10;
const EMPTY_MIX_WEIGHT_LATAM_LUXURY_STR    = 0.10;

/** Default mix when the portfolio is completely empty (weights must sum to 1). */
const EMPTY_PORTFOLIO_DEFAULT_MIX: readonly { id: string; weight: number }[] = [
  { id: BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT, weight: EMPTY_MIX_WEIGHT_US_TERTIARY_RESORT },
  { id: BRACKET_ID_US_GATEWAY_BOUTIQUE,          weight: EMPTY_MIX_WEIGHT_US_GATEWAY },
  { id: BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,   weight: EMPTY_MIX_WEIGHT_LATAM_PRIME_URBAN },
  { id: BRACKET_ID_LATAM_RURAL_ILLIQUID,         weight: EMPTY_MIX_WEIGHT_LATAM_RURAL },
  { id: BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,  weight: EMPTY_MIX_WEIGHT_LATAM_LUXURY_STR },
] as const;

// ── Weight normalisation helpers ──────────────────────────────────────────

function normalise(rawCounts: Record<string, number>): Record<string, number> {
  const ids = Object.keys(rawCounts);
  const total = ids.reduce((s, id) => s + rawCounts[id], 0);
  if (total === 0) return rawCounts;

  // First pass: raw percentages
  const pct: Record<string, number> = {};
  for (const id of ids) {
    pct[id] = rawCounts[id] / total;
  }

  // Apply floor
  for (const id of ids) {
    if (pct[id] < MINIMUM_BRACKET_WEIGHT) pct[id] = MINIMUM_BRACKET_WEIGHT;
  }

  // Re-normalise after floor application
  const flooredTotal = ids.reduce((s, id) => s + pct[id], 0);
  for (const id of ids) {
    pct[id] = Math.round((pct[id] / flooredTotal) * 1000) / 1000;
  }

  // Fix floating-point drift on the first bracket
  const sum = ids.reduce((s, id) => s + pct[id], 0);
  const drift = Math.round((1 - sum) * 1000) / 1000;
  if (Math.abs(drift) > 0 && ids.length > 0) {
    pct[ids[0]] = Math.round((pct[ids[0]] + drift) * 1000) / 1000;
  }

  return pct;
}

// ── Main minion export ────────────────────────────────────────────────────

/**
 * Assign bracket weights deterministically using Davi's match-rule classifier.
 *
 * @param properties  All properties visible to the management company.
 * @param _ga         The management company's global assumptions row (unused;
 *                    retained for call-site compatibility).
 * @param rules       Active match-rule set loaded from icp_brackets by caller.
 * @returns           A BracketMixData ready to persist.
 */
export function assignBrackets(
  properties: Property[],
  _ga: GlobalAssumptions | undefined,
  rules: readonly BracketMatchRule[],
): BracketMixData {
  // ── Empty portfolio fallback ──────────────────────────────────────────
  if (properties.length === 0) {
    const entries: BracketEntry[] = EMPTY_PORTFOLIO_DEFAULT_MIX.map((d) => {
      const cat = BRACKET_CATALOG.find((b) => b.id === d.id)!;
      return {
        id: d.id,
        name: cat.name,
        archetypeLabel: cat.archetypeLabel,
        serviceConsumption: cat.serviceConsumption,
        weight: d.weight,
        rationale: "Default mix — no portfolio properties exist yet. Run Assign Brackets after adding properties for a portfolio-informed mix.",
      };
    });

    return {
      entries,
      assignedAt: new Date().toISOString(),
      evidence: "No portfolio properties found. Showing balanced starter mix — re-run after adding properties.",
    };
  }

  // ── Classify each property via Davi ──────────────────────────────────
  const rawCounts: Record<string, number> = {};
  for (const cat of BRACKET_CATALOG) {
    rawCounts[cat.id] = 0;
  }

  const bracketHits: Record<string, number> = {};
  let unmatched = 0;

  for (const p of properties) {
    const slug = pickBestFitBracket(p, rules);
    if (slug !== null && rawCounts[slug] !== undefined) {
      rawCounts[slug]++;
      bracketHits[slug] = (bracketHits[slug] ?? 0) + 1;
    } else {
      unmatched++;
    }
  }

  // Unmatched properties fall to US Gateway Boutique as a safe default
  if (unmatched > 0) {
    rawCounts[BRACKET_ID_US_GATEWAY_BOUTIQUE] += unmatched;
    bracketHits[BRACKET_ID_US_GATEWAY_BOUTIQUE] =
      (bracketHits[BRACKET_ID_US_GATEWAY_BOUTIQUE] ?? 0) + unmatched;
  }

  const weights = normalise(rawCounts);

  // ── Build evidence narrative ──────────────────────────────────────────
  const totalCount = properties.length;
  const evidenceParts: string[] = [
    `Portfolio: ${totalCount} propert${totalCount === 1 ? "y" : "ies"} classified using ${rules.length} active bracket rule${rules.length === 1 ? "" : "s"}.`,
  ];

  for (const cat of BRACKET_CATALOG) {
    const count = bracketHits[cat.id] ?? 0;
    if (count > 0) {
      evidenceParts.push(`${count} → ${cat.name}.`);
    }
  }

  if (unmatched > 0) {
    evidenceParts.push(`${unmatched} unmatched (no rule fired) → defaulted to US Gateway Boutique.`);
  }

  const evidence = evidenceParts.join(" ");

  // ── Build rationale per bracket ───────────────────────────────────────
  const rationaleMap: Record<string, string> = {};
  for (const cat of BRACKET_CATALOG) {
    const count = bracketHits[cat.id] ?? 0;
    rationaleMap[cat.id] = count > 0
      ? `${count} propert${count === 1 ? "y" : "ies"} matched the ${cat.name} rule set via Davi.`
      : "Minimum floor weight applied — no properties matched this bracket's rules.";
  }

  // ── Build final entries ───────────────────────────────────────────────
  const entries: BracketEntry[] = BRACKET_CATALOG.map((cat) => ({
    id: cat.id,
    name: cat.name,
    archetypeLabel: cat.archetypeLabel,
    serviceConsumption: cat.serviceConsumption,
    weight: weights[cat.id] ?? MINIMUM_BRACKET_WEIGHT,
    rationale: rationaleMap[cat.id] ?? "",
  }));

  return {
    entries,
    assignedAt: new Date().toISOString(),
    evidence,
  };
}

// ── Service-consumption label helpers (used by route response) ────────────

export function serviceConsumptionLabel(type: string): string {
  if (type === "hotel") return "All service lines";
  if (type === "str") return "Marketing, branding, performance-bonus only";
  if (type === "mixed") return "Blended (hotel + STR)";
  return type;
}
