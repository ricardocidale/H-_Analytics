/**
 * Davi — Per-property best-fit bracket classifier (deterministic minion).
 *
 * Given a Property row and the active set of ICP bracket match-rules, Davi
 * returns the highest-priority bracket whose AND-ed predicates all match,
 * or `null` if no rule matches. Davi exercises no judgment: the rule set
 * lives in the `icp_brackets` table (columns `match_countries`,
 * `match_business_models`, `match_quality_tiers`, `match_keywords`,
 * `match_priority`, `match_rationale`) so the catalog can evolve without a
 * code deploy — see Plan 2026-05-13-001 §U7 and `docs/concepts/bracket-mix.md`.
 *
 * Davi is invoked by:
 *   - `bracket-assignment-minion` (company-level mix derivation)
 *   - U6 per-property best-fit resolver (creates new properties)
 *
 * Predicate semantics (loose typing — the property row's string fields are
 * case-folded before comparison):
 *   - `matchCountries`        — property.country must appear in the list
 *   - `matchBusinessModels`   — property.businessModel must appear in the list
 *   - `matchQualityTiers`     — property.qualityTier must appear in the list
 *   - `matchKeywords`         — any keyword appears (case-insensitive substring)
 *                               in property.market OR stateProvince OR city OR name
 * NULL or empty array = wildcard (no constraint on that dimension).
 */

import type { Property } from "@workspace/db";

// ── Public match-rule shape (mirrors icp_brackets DB columns) ─────────────

export interface BracketMatchRule {
  bracketId: string;          // icp_brackets.slug (canonical identifier)
  priority: number;            // higher fires first; ties broken by caller
  countries?: readonly string[] | null;
  businessModels?: readonly string[] | null;
  qualityTiers?: readonly string[] | null;
  keywords?: readonly string[] | null;
  rationale?: string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function asLowerString(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

function isEmpty(arr: readonly string[] | null | undefined): boolean {
  return !arr || arr.length === 0;
}

export function propertyMatchesRule(p: Property, rule: BracketMatchRule): boolean {
  const rec = p as unknown as Record<string, unknown>;
  const country = String(rec.country ?? rec.Country ?? "");
  const businessModel = asLowerString(rec.businessModel ?? rec.business_model);
  const qualityTier = asLowerString(rec.qualityTier ?? rec.quality_tier);
  const market = asLowerString(rec.market);
  const stateProvince = asLowerString(rec.stateProvince ?? rec.state_province);
  const city = asLowerString(rec.city);
  const name = asLowerString(p.name);

  if (!isEmpty(rule.countries)) {
    if (!rule.countries!.includes(country)) return false;
  }
  if (!isEmpty(rule.businessModels)) {
    if (!rule.businessModels!.includes(businessModel)) return false;
  }
  if (!isEmpty(rule.qualityTiers)) {
    if (!rule.qualityTiers!.includes(qualityTier)) return false;
  }
  if (!isEmpty(rule.keywords)) {
    const haystack = `${market} ${stateProvince} ${city} ${name}`;
    const anyMatch = rule.keywords!.some((kw) => haystack.includes(kw.toLowerCase()));
    if (!anyMatch) return false;
  }
  return true;
}

// ── Main minion export ────────────────────────────────────────────────────

/**
 * Pick the highest-priority best-fit bracket for a single property.
 *
 * @param property  Property row (loose-typed access; only string fields read).
 * @param rules     Active match-rule set, typically loaded once from
 *                  `icp_brackets` and reused across many calls.
 * @returns         The matched bracket's slug, or `null` if no rule matched.
 */
export function pickBestFitBracket(
  property: Property,
  rules: readonly BracketMatchRule[],
): string | null {
  // Sort defensively — the DB read order is not load-bearing.
  const ordered = rules.slice().sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (propertyMatchesRule(property, rule)) return rule.bracketId;
  }
  return null;
}
