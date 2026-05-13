/**
 * bracket-assignment-minion — Deterministic minion that reads a Management
 * Company's portfolio and emits a weighted ICP bracket mix.
 *
 * Minion contract (CLAUDE.md §10):
 *   - No LLM calls, no judgment — fully deterministic given the same inputs.
 *   - Returns a BracketMixData with entries summing to exactly 1.0.
 *   - Every numeric weight is derived from portfolio signals or named
 *     constants — never inline literals (per CLAUDE.md §1 no-magic-numbers).
 *
 * **Plan 2026-05-13-001 U7 rewrite (2026-05-13):** the previous algorithm
 * classified each property by keyword scan and split the hotel bucket by
 * quality tier. With the catalog rewritten to 5 geography-tier brackets
 * AND the match rules persisted on the `icp_brackets` table, classification
 * now flows through Davi (per-property best-fit classifier minion). Each
 * property is matched against the DB-stored rules in priority order, the
 * selected bracket gets a +1 count, and counts are normalised to weights.
 * Same external contract — only the per-property classifier changes.
 */

import type { Property, GlobalAssumptions } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT,
  BRACKET_ID_US_GATEWAY_BOUTIQUE,
  BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,
  BRACKET_ID_LATAM_RURAL_ILLIQUID,
  BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,
  BRACKET_CATALOG,
  SERVICE_CONSUMPTION_HOTEL,
  SERVICE_CONSUMPTION_STR,
  SERVICE_CONSUMPTION_MIXED,
  type BracketId,
} from "./bracket-catalog";
import type { BracketEntry, BracketMixData } from "@workspace/db";
import { pickBestFitBracket, type BracketMatchRule } from "../ambient/minions/davi";
import { db } from "../../db";

// ── Named thresholds (no inline numerics) ────────────────────────────────

/** Weight floor applied to any bracket that would otherwise reach zero. */
const MINIMUM_BRACKET_WEIGHT = 0.05;

/** Number of decimal places preserved by the weight normaliser (3 → 0.123). */
const WEIGHT_DECIMAL_PLACES = 3;
const WEIGHT_PRECISION_FACTOR = 1000; // 10 ** WEIGHT_DECIMAL_PLACES

// Default-mix weights for an empty portfolio (must sum to 1.0):
// Balanced US/LatAm split with extra weight on US tertiary (the most common
// archetype in the seeded demo). Tuned so the empty-state visualisation looks
// representative of a typical demo portfolio.
const EMPTY_MIX_WEIGHT_US_TERTIARY            = 0.30;
const EMPTY_MIX_WEIGHT_US_GATEWAY             = 0.20;
const EMPTY_MIX_WEIGHT_LATAM_PRIME_URBAN      = 0.20;
const EMPTY_MIX_WEIGHT_LATAM_RURAL_ILLIQUID   = 0.15;
const EMPTY_MIX_WEIGHT_LATAM_LUXURY_STR       = 0.15;

/** Default mix when the portfolio is completely empty (weights must sum to 1). */
const EMPTY_PORTFOLIO_DEFAULT_MIX: readonly { id: BracketId; weight: number }[] = [
  { id: BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT,   weight: EMPTY_MIX_WEIGHT_US_TERTIARY },
  { id: BRACKET_ID_US_GATEWAY_BOUTIQUE,            weight: EMPTY_MIX_WEIGHT_US_GATEWAY },
  { id: BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,    weight: EMPTY_MIX_WEIGHT_LATAM_PRIME_URBAN },
  { id: BRACKET_ID_LATAM_RURAL_ILLIQUID,           weight: EMPTY_MIX_WEIGHT_LATAM_RURAL_ILLIQUID },
  { id: BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,   weight: EMPTY_MIX_WEIGHT_LATAM_LUXURY_STR },
] as const;

// ── DB rules loader ───────────────────────────────────────────────────────

interface IcpBracketMatchRow {
  slug: string;
  match_countries: string[] | null;
  match_business_models: string[] | null;
  match_quality_tiers: string[] | null;
  match_keywords: string[] | null;
  match_priority: number;
  match_rationale: string | null;
}

/**
 * Load the active best-fit match rules from `icp_brackets`. Rows with
 * `match_priority = 0` are treated as "no rule registered" and excluded —
 * a slug becomes matchable only once it carries a positive priority.
 */
async function loadBestFitRulesFromDb(): Promise<BracketMatchRule[]> {
  const result = await db.execute(sql`
    SELECT slug,
           match_countries,
           match_business_models,
           match_quality_tiers,
           match_keywords,
           match_priority,
           match_rationale
    FROM icp_brackets
    WHERE is_active = true
      AND match_priority > 0
    ORDER BY match_priority DESC, id ASC
  `);
  return result.rows.map((r) => {
    const row = r as unknown as IcpBracketMatchRow;
    return {
      bracketId: row.slug,
      priority: row.match_priority,
      countries: row.match_countries ?? null,
      businessModels: row.match_business_models ?? null,
      qualityTiers: row.match_quality_tiers ?? null,
      keywords: row.match_keywords ?? null,
      rationale: row.match_rationale ?? null,
    };
  });
}

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
    pct[id] = Math.round((pct[id] / flooredTotal) * WEIGHT_PRECISION_FACTOR) / WEIGHT_PRECISION_FACTOR;
  }

  // Fix floating-point drift on the first bracket
  const sum = ids.reduce((s, id) => s + pct[id], 0);
  const drift = Math.round((1 - sum) * WEIGHT_PRECISION_FACTOR) / WEIGHT_PRECISION_FACTOR;
  if (Math.abs(drift) > 0 && ids.length > 0) {
    pct[ids[0]] = Math.round((pct[ids[0]] + drift) * WEIGHT_PRECISION_FACTOR) / WEIGHT_PRECISION_FACTOR;
  }

  return pct;
}

// ── Main minion export ────────────────────────────────────────────────────

/**
 * Assign bracket weights deterministically from the portfolio.
 *
 * @param properties  All properties visible to the management company.
 * @param ga          The management company's global assumptions row.
 * @returns           A BracketMixData ready to persist.
 */
export async function assignBrackets(
  properties: Property[],
  _ga: GlobalAssumptions | undefined,
): Promise<BracketMixData> {
  // The post-rewrite minion no longer reads `ga.assetDefinition.level` — the
  // catalog's geography-tier bracket axes do not have a quality-tier split,
  // and the per-property qualityTier (when set) is already an input to the
  // best-fit rules. The argument is retained for signature compatibility
  // with existing callers; the underscore name silences the unused-param
  // lint without forcing a call-site sweep.

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

  // ── Classify each property by best-fit rule (via Davi + DB rules) ─────
  const rules = await loadBestFitRulesFromDb();
  const counts: Record<string, number> = {};
  for (const cat of BRACKET_CATALOG) {
    counts[cat.id] = 0;
  }
  let unclassifiedCount = 0;
  for (const p of properties) {
    const picked = pickBestFitBracket(p, rules);
    if (picked != null && picked in counts) {
      counts[picked]++;
    } else {
      // Unclassified properties fall into the US-gateway catch-all so the
      // emitted mix still sums to a non-degenerate distribution. The
      // alternative (skip + renormalise) would silently hide problematic
      // rows; this surfaces them as an "all-gateway" anomaly visible in
      // the evidence string below.
      counts[BRACKET_ID_US_GATEWAY_BOUTIQUE]++;
      unclassifiedCount++;
    }
  }

  const weights = normalise(counts);

  // ── Build evidence narrative ──────────────────────────────────────────
  const total = properties.length;
  const evidenceParts: string[] = [
    `Portfolio: ${total} propert${total === 1 ? "y" : "ies"} analysed.`,
  ];
  for (const cat of BRACKET_CATALOG) {
    const n = counts[cat.id];
    if (n > 0) {
      const pct = Math.round((n / total) * 100);
      evidenceParts.push(`${pct}% matched ${cat.name} (n=${n}).`);
    }
  }
  if (unclassifiedCount > 0) {
    evidenceParts.push(
      `${unclassifiedCount} propert${unclassifiedCount === 1 ? "y" : "ies"} did not match any best-fit rule and were routed to the US gateway boutique catch-all. Add country / market / business-model metadata to improve the mix.`,
    );
  }
  const evidence = evidenceParts.join(" ");

  // ── Build rationale per bracket ───────────────────────────────────────
  const rationaleMap: Record<string, string> = {};
  for (const cat of BRACKET_CATALOG) {
    const n = counts[cat.id];
    rationaleMap[cat.id] = n > 0
      ? `${n} propert${n > 1 ? "ies" : "y"} match the ${cat.archetypeLabel} archetype.`
      : "Minimum floor weight applied — no portfolio matches.";
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
  if (type === SERVICE_CONSUMPTION_HOTEL) return "All service lines";
  if (type === SERVICE_CONSUMPTION_STR) return "Marketing, branding, performance-bonus only";
  if (type === SERVICE_CONSUMPTION_MIXED) return "Blended (hotel + STR)";
  return type;
}
