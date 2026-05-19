/**
 * Canonical field specs per Model Defaults sub-tab.
 *
 * Each entry pairs:
 *   - `guidanceKey` — the assumption-key emitted by the server's guidance
 *     extractor (see `server/ai/guidance/schemas.ts` →
 *     COMPANY_ASSUMPTION_KEYS + PROPERTY_ASSUMPTION_KEYS + KEY_ALIASES).
 *   - `draftKey` — the literal key used on the tab's Draft object
 *     (what `onChange("…", v)` writes).
 *
 * These usually match, but the Model Defaults forms prefix many
 * property-level fields (`defaultMaxOccupancy` in the draft ↔
 * `maxOccupancy` in the guidance vocabulary), and at least one field
 * has a plain vocabulary skew (`salesCommissionRate` in the draft ↔
 * `dispositionCommission` in the guidance vocabulary).
 *
 * Keep this file as the single source of truth for both (a) which
 * guidance keys we ask the server to refresh, and (b) which draft
 * values the save-gate reads when computing violations.
 */

export interface AnalystFieldSpec {
  /** assumption_guidance.assumption_key — matches guidance-extractor output. */
  guidanceKey: string;
  /** The key on the tab's Draft object — what the form writes via onChange. */
  draftKey: string;
}

export const COMPANY_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [
  { guidanceKey: "baseManagementFee",      draftKey: "baseManagementFee" },
  { guidanceKey: "incentiveManagementFee", draftKey: "incentiveManagementFee" },
  { guidanceKey: "companyTaxRate",         draftKey: "companyTaxRate" },
  { guidanceKey: "costOfEquity",           draftKey: "costOfEquity" },
  // Surfaced on CompanyTab as "Sales Commission"; guidance-side key is dispositionCommission.
  { guidanceKey: "dispositionCommission",  draftKey: "salesCommissionRate" },
];

export const MARKET_MACRO_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [
  { guidanceKey: "inflationRate", draftKey: "inflationRate" },
  { guidanceKey: "costOfEquity",  draftKey: "costOfEquity" },
];

export const PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [
  { guidanceKey: "adr",                 draftKey: "defaultStartAdr" },
  { guidanceKey: "adrGrowth",           draftKey: "defaultAdrGrowthRate" },
  { guidanceKey: "startOccupancy",      draftKey: "defaultStartOccupancy" },
  { guidanceKey: "maxOccupancy",        draftKey: "defaultMaxOccupancy" },
  { guidanceKey: "occupancyRampMonths", draftKey: "defaultOccupancyRampMonths" },
  { guidanceKey: "costRooms",           draftKey: "defaultCostRateRooms" },
  { guidanceKey: "costFB",              draftKey: "defaultCostRateFb" },
  { guidanceKey: "costAdmin",           draftKey: "defaultCostRateAdmin" },
  { guidanceKey: "costMarketing",       draftKey: "defaultCostRateMarketing" },
  { guidanceKey: "costPropertyOps",     draftKey: "defaultCostRatePropertyOps" },
  { guidanceKey: "costUtilities",       draftKey: "defaultCostRateUtilities" },
  { guidanceKey: "costIT",              draftKey: "defaultCostRateIt" },
  { guidanceKey: "costFFE",             draftKey: "defaultCostRateFfe" },
  { guidanceKey: "costInsurance",       draftKey: "defaultCostRateInsurance" },
  { guidanceKey: "costTaxes",           draftKey: "defaultCostRateTaxes" },
  // depreciationYears is a regulatory constant (IRS Pub 946); canonical home is the
  // Constants tab. Removed from this list per Task #379 audit so the Analyst soft-gate
  // does not fire on a non-business-input value. See
  // docs/audits/task-379-defaults-vs-source-of-truth.md.
  { guidanceKey: "landValue",           draftKey: "defaultLandValuePercent" },
  // inflationRate's canonical Defaults home is MarketMacroTab (the duplicate editor on
  // PropertyUnderwritingTab was removed per Task #379 audit §4.2). The MarketMacroTab
  // soft-gate already covers inflationRate.
];

export const CAPITAL_STACK_DISCIPLINE_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [
  { guidanceKey: "runwayBufferMonths",     draftKey: "runwayBufferMonths" },
  { guidanceKey: "sizingOvershootPct",     draftKey: "sizingOvershootPct" },
  { guidanceKey: "revenueRampDelayMonths", draftKey: "revenueRampDelayMonths" },
  { guidanceKey: "burnFlexDownPct",        draftKey: "burnFlexDownPct" },
];

// Placeholders — these tabs currently hold constants/LLM settings/required-field
// metadata, not admin-editable assumption values. Kept for completeness so a
// later slice can attach a button without inventing new keys.
export const MODEL_CONSTANTS_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [];
export const LLM_DEFAULTS_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [];
export const REQUIRED_FIELDS_TAB_ANALYST_FIELDS: readonly AnalystFieldSpec[] = [];

/** Extract the guidance-side keys from a spec list (for the refresh API). */
export function toGuidanceKeys(specs: readonly AnalystFieldSpec[]): string[] {
  return specs.map((s) => s.guidanceKey);
}

/**
 * Traffic-light freshness thresholds for Analyst button corner dots.
 * Matches the server-side stale check in routes/guidance.ts.
 */
const FRESHNESS_STALE_MS     = 7  * 24 * 60 * 60 * 1000; // 7 days
const FRESHNESS_VERY_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Derive the `FreshnessStatus` for a tab's Analyst button from the loaded
 * guidance records.
 *
 * Rules (per task #1690 spec):
 *   - "missing"    → no guidance records exist for any of the tab's fields
 *   - null (no dot) → most-recent record is < 7 days old (fresh)
 *   - "stale"      → most-recent record is 7–30 days old
 *   - "very_stale" → most-recent record is > 30 days old
 *
 * Returns `null` rather than `"current"` so the Analyst button shows no dot
 * for fresh data (matching the task spec "fresh session shows no dot").
 */
export function computeTabFreshness(
  guidance: Array<{ assumptionKey: string; updatedAt?: string }>,
  specs: readonly AnalystFieldSpec[],
): "stale" | "very_stale" | "missing" | null {
  const tabKeys = new Set(specs.map((s) => s.guidanceKey));
  const relevant = guidance.filter((g) => tabKeys.has(g.assumptionKey));

  if (relevant.length === 0) return "missing";

  const now = Date.now();
  let newestMs = 0;
  for (const r of relevant) {
    if (!r.updatedAt) continue;
    const t = new Date(r.updatedAt).getTime();
    if (t > newestMs) newestMs = t;
  }

  if (newestMs === 0) return "missing";

  const age = now - newestMs;
  if (age < FRESHNESS_STALE_MS)      return null;
  if (age < FRESHNESS_VERY_STALE_MS) return "stale";
  return "very_stale";
}

/**
 * Derive the `FreshnessStatus` for a specialist-verdict-backed Analyst button
 * (e.g. Capital Stack Discipline) from the verdict's `generatedAt` timestamp.
 *
 * Unlike `computeTabFreshness`, which aggregates over multiple guidance records,
 * this function evaluates a single verdict object whose freshness is represented
 * by one timestamp field.
 *
 * Rules (same thresholds as `computeTabFreshness`):
 *   - "missing"    → no verdict (null / undefined)
 *   - null (no dot) → verdict is < 7 days old (fresh)
 *   - "stale"      → verdict is 7–30 days old
 *   - "very_stale" → verdict is > 30 days old
 */
export function computeVerdictFreshness(
  verdict: { generatedAt: string } | null | undefined,
): "stale" | "very_stale" | "missing" | null {
  if (!verdict?.generatedAt) return "missing";
  const age = Date.now() - new Date(verdict.generatedAt).getTime();
  if (age < FRESHNESS_STALE_MS)      return null;
  if (age < FRESHNESS_VERY_STALE_MS) return "stale";
  return "very_stale";
}

/**
 * Merge several spec lists into one, deduplicating by `draftKey` (the
 * UI-facing identity). The first occurrence wins, so the caller can
 * control ordering.
 */
export function unionAnalystFieldSpecs(
  ...lists: readonly (readonly AnalystFieldSpec[])[]
): AnalystFieldSpec[] {
  const seen = new Set<string>();
  const out: AnalystFieldSpec[] = [];
  for (const list of lists) {
    for (const spec of list) {
      if (seen.has(spec.draftKey)) continue;
      seen.add(spec.draftKey);
      out.push(spec);
    }
  }
  return out;
}
