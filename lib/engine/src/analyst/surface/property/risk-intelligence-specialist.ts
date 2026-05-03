/**
 * Property Risk Intelligence Surface Specialist (`property.risk-intelligence`,
 * Daniela / D) — Tier-0 deterministic verdict for the per-property inflation
 * override slider (`propertyInflationRate`).
 *
 * Why Tier-0 lives here (engine), not under `server/ai/specialists/`:
 *   - The Tier-1 path (Opus single-shot) lives in
 *     `server/ai/specialists/property-risk-intelligence-runner.ts`.
 *   - Tier-0 is the always-available deterministic fallback the Surface
 *     Router serves when Tier-1 is unavailable / disabled / cooling down
 *     (per ADR-008). It must never depend on `server/` runtime modules so
 *     it stays importable from edge runtimes and tests.
 *
 * Verdict shape: ONE dimension on field id `propertyInflationRate`.
 *   - In-range or missing data → severity: ok (range null per the
 *     verdict-shape invariant in `engine/analyst/contracts/verdict.ts`).
 *   - Out-of-range against the country outlook → severity: advisory, with a
 *     `consult-cognitive` Adjust action whose payload.field deep-links to
 *     the per-property slider via the FIELD_REGISTRY entry's mountPoint
 *     (`property-edit/other-assumptions`).
 *
 * Inflation-cascade discipline (`.claude/rules/inflation-cascade.md`):
 *   - This Specialist owns the *property-level* override; the macro
 *     Specialist (Isadora I, `constants.macro-research`) owns the *global*
 *     `inflationRate` Constant.
 *   - The Tier-0 path NEVER fabricates a country outlook range. Callers
 *     pass the published country outlook in via
 *     `PropertyRiskIntelligenceInputs.countryInflationOutlook`. When the
 *     outlook is absent the Specialist emits an honest `missing-data`
 *     verdict instead of inventing a number.
 *   - Hard-coded numeric ranges in this file would violate the cascade
 *     rule, so the only literals here are the seed quality scores (UX
 *     calibration, not financial values).
 */

import type {
  Evidence,
  RawVerdictDimension,
  Severity,
  VerdictAction,
  VerdictRange,
  VoiceIntent,
} from "../../contracts/verdict";
import type {
  SpecialistFn,
  SpecialistOutput,
} from "../../router/surface-router";
import { getFieldRegistryEntry } from "../../registry/field-registry";
import { CONVICTION_FLOOR, SPECIALIST_RAW_QUALITY_SEED } from "@shared/analyst-conviction";

/** Verdict-emitting field id Daniela targets for the Adjust deep-link. */
const PROPERTY_INFLATION_FIELD = "propertyInflationRate";

/**
 * UX-calibration constants. Seed quality score is conservatively above
 * `CONVICTION_FLOOR` (40) so non-ok dimensions with a range satisfy the
 * verdict-shape invariant in `engine/analyst/contracts/verdict.ts`. These
 * are presentation thresholds, not financial assumptions, so they stay
 * here as named constants per the no-magic-numbers rule.
 */
const RAW_QUALITY_SEED = SPECIALIST_RAW_QUALITY_SEED;
const RAW_QUALITY_MISSING_OUTLOOK = CONVICTION_FLOOR;

/**
 * Resolve the property-inflation field's display unit from FIELD_REGISTRY.
 * Mirrors `unitFor` in the funding/revenue Specialists so the Voice
 * Renderer formats `range.unit` consistently across Specialists. Throws
 * loudly when the registry entry is missing — the parity test
 * (`tests/analyst/voice/field-registry-parity.test.ts`) guards against
 * this drift, and a runtime throw is the safer failure mode than a
 * silently-wrong unit string.
 */
function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Property Risk Intelligence Specialist: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts so the Voice Renderer formats this dimension consistently.`,
    );
  }
  return entry.unit;
}

/**
 * Country/market published inflation outlook the macro authority (central
 * bank, statistics agency) reports. Caller resolves this from the
 * Constants table — this Specialist never invents it. Per the
 * inflation-cascade rule, the only legitimate path for a numeric inflation
 * range to enter a verdict is via an authority-published source the caller
 * cites here.
 */
export interface CountryInflationOutlook {
  /** Lower bound of the published outlook range (decimal, e.g. 0.018 = 1.8%). */
  low: number;
  /** Mid / point estimate of the published outlook range (decimal). */
  mid: number;
  /** Upper bound of the published outlook range (decimal). */
  high: number;
  /** Authority that published the outlook — e.g. "US Federal Reserve long-run target". */
  source: string;
  /** ISO date the outlook was last refreshed by the macro Specialist. */
  asOf: string;
  /** Optional URL to the source publication. */
  url?: string;
}

/**
 * Tier-0 payload Daniela receives. The caller is responsible for resolving
 * the country outlook from the Constants table (the macro Specialist's
 * domain) and passing it in. When `countryInflationOutlook` is `null` /
 * `undefined` the Specialist emits a missing-data verdict — it must NOT
 * fabricate an outlook to keep working.
 */
export interface PropertyRiskIntelligenceInputs {
  /**
   * The property-level override the user has currently saved on the
   * Other Assumptions tab's inflation slider. Decimal (0.025 = 2.5%).
   * `null` when the user has not set an override.
   */
  propertyInflationRate: number | null;
  /**
   * Country/market published inflation outlook resolved by the caller
   * from the Constants table (the macro Specialist's domain). When
   * absent, Tier-0 emits a missing-data verdict rather than inventing a
   * range.
   */
  countryInflationOutlook?: CountryInflationOutlook | null;
  /** Property's country code (e.g. "US"). Surfaced in evidence labelling only. */
  country?: string;
  /** Property's city. Surfaced in evidence labelling only. */
  city?: string;
}

/**
 * Public list of every field id this Specialist may emit as
 * `VerdictDimension.field`. Exported so the field-registry parity test
 * (`tests/analyst/voice/field-registry-parity.test.ts`) can assert each
 * one has a `FIELD_REGISTRY` entry without reaching into this module's
 * internals. Mirrors the export from
 * `engine/analyst/surface/mgmt-co/funding-specialist.ts` and
 * `engine/analyst/surface/mgmt-co/revenue-specialist.ts`.
 */
export const RISK_INTELLIGENCE_SPECIALIST_TRACKED_FIELDS: readonly string[] = [
  PROPERTY_INFLATION_FIELD,
];

function classifyIntent(
  value: number | null | undefined,
  range: VerdictRange | null,
): VoiceIntent {
  if (range == null) return "missing-data";
  if (value == null || !Number.isFinite(value)) return "missing-data";
  if (value < range.low) return "below-range";
  if (value > range.high) return "above-range";
  return "within-range";
}

function rangeFromOutlook(
  outlook: CountryInflationOutlook | null | undefined,
): VerdictRange | null {
  if (!outlook) return null;
  if (
    !Number.isFinite(outlook.low) ||
    !Number.isFinite(outlook.mid) ||
    !Number.isFinite(outlook.high)
  ) {
    return null;
  }
  // VerdictRangeSchema enforces low <= mid <= high; reject inverted
  // ranges up front rather than throwing inside buildAnalystVerdict.
  if (!(outlook.low <= outlook.mid && outlook.mid <= outlook.high)) {
    return null;
  }
  return {
    low: outlook.low,
    mid: outlook.mid,
    high: outlook.high,
    unit: unitFor(PROPERTY_INFLATION_FIELD),
  };
}

function buildEvidence(
  outlook: CountryInflationOutlook | null | undefined,
  fallbackAsOf: string,
): Evidence[] {
  if (outlook) {
    return [
      {
        source: outlook.source,
        tier: "db_table",
        asOf: outlook.asOf,
        url: outlook.url,
        personaFit: 1,
      },
    ];
  }
  // Honest evidence row when the outlook hasn't been resolved yet — names
  // the missing input rather than fabricating a citation. The macro
  // Specialist (`constants.macro-research` / Isadora I) owns the
  // upstream Constant; the row points reviewers at the gap.
  return [
    {
      source:
        "Country inflation outlook unresolved — refresh constants.macro-research (Isadora) to populate it",
      tier: "estimated",
      asOf: fallbackAsOf,
      personaFit: 0.5,
    },
  ];
}

function buildDimension(
  inputs: PropertyRiskIntelligenceInputs,
  evidenceAsOf: string,
): RawVerdictDimension {
  const range = rangeFromOutlook(inputs.countryInflationOutlook);
  const intent = classifyIntent(inputs.propertyInflationRate, range);

  // Severity: only "advisory" when we have BOTH a published range AND a
  // user value that falls outside it. Missing inputs / missing outlook
  // resolve to ok+missing-data so the verdict-shape invariant
  // (range null when severity ok) holds without us inventing a range.
  const severity: Severity =
    intent === "below-range" || intent === "above-range" ? "advisory" : "ok";

  const evidence = buildEvidence(inputs.countryInflationOutlook, evidenceAsOf);

  // Quality seed: lower when we have no published outlook, since the
  // verdict's reasoning is "we cannot judge" rather than "we judged
  // against a real range". Both values stay above CONVICTION_FLOOR for
  // ok-severity emission; only non-ok dimensions are gated on the floor.
  const qualityScore =
    inputs.countryInflationOutlook != null
      ? RAW_QUALITY_SEED
      : RAW_QUALITY_MISSING_OUTLOOK;

  const reasonText =
    severity === "ok"
      ? inputs.countryInflationOutlook == null
        ? "Country inflation outlook isn't resolved yet — refresh the macro Specialist before relying on this override."
        : "Within the country inflation outlook The Analyst expects."
      : intent === "below-range"
        ? "Below the country inflation outlook — verify why the property would underrun the published range."
        : "Above the country inflation outlook — verify why the property would overrun the published range.";

  const actions: VerdictAction[] = [];
  if (severity !== "ok") {
    actions.push({
      kind: "consult-cognitive",
      label: "Adjust",
      payload: { field: PROPERTY_INFLATION_FIELD, reason: reasonText },
    });
    actions.push({ kind: "dismiss", label: "Got it" });
  }

  return {
    field: PROPERTY_INFLATION_FIELD,
    isNumericField: true,
    severity,
    range: severity === "ok" ? null : range,
    qualityScore,
    evidence,
    intent,
    actions,
  } satisfies RawVerdictDimension;
}

export interface PropertyRiskIntelligenceSpecialistOptions {
  /** Reference date stamped on fallback evidence rows; tests pass a fixed value. */
  evidenceAsOf?: string;
  /**
   * Admin-edited prompt template (P5). The Tier-0 path is pure
   * deterministic JS and ignores this; threaded through so a future
   * LLM-backed Tier-0 upgrade can pick it up without changing the
   * factory contract. Mirrors `RevenueSpecialistOptions`.
   */
  promptTemplate?: string;
  /**
   * `admin_resources.id` of the model resource the admin selected for
   * this Specialist (P5). Same TODO note as `promptTemplate`.
   */
  modelResourceId?: number | null;
}

/**
 * Factory for the Tier-0 Surface Specialist. Returns a `SpecialistFn` the
 * Surface Router can register and dispatch under
 * `specialistId: "property.risk-intelligence"`.
 */
export function createPropertyRiskIntelligenceSpecialist(
  options: PropertyRiskIntelligenceSpecialistOptions = {},
): SpecialistFn {
  const evidenceAsOf =
    options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  return (payload, _context): SpecialistOutput => {
    const inputs = (payload ?? {}) as PropertyRiskIntelligenceInputs;
    const dimension = buildDimension(inputs, evidenceAsOf);
    return { dimensions: [dimension], tier: 0 };
  };
}
