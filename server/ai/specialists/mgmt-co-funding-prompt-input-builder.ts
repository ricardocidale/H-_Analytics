/**
 * mgmt-co-funding-prompt-input-builder.ts — pure input adapters for the
 * Funding Surface Specialist's Tier-1 graduation (G1 of ADR-007).
 *
 * Three exports, no I/O:
 *
 *   1. `buildFundingPromptInput(ctx)` — assembles the structured input pack
 *      the Prompt Engineer LLM stage (ADR-007 §1 step 2) consumes to engineer
 *      multi-stage prompts. Pack carries: required fields, portfolio
 *      aggregate, persona context, prior-verdict references, and the
 *      Specialist-intent string.
 *
 *   2. `mapInputsToDimensionInputs(inputs)` — adapts the legacy
 *      `CapitalRaiseInputs` shape into the `DimensionInput[]` shape
 *      `consultCognitive` expects (one DimensionInput per known dimension
 *      key; `userValue` from inputs; `isNumericField=true` for all five).
 *
 *   3. `buildFundingCacheKey(args)` — wraps `computeCacheKey` from
 *      `engine/analyst/cognitive/cache-keys.ts` with Funding-specific
 *      field-group taxonomy.
 *
 * Constraints (per ADR-007 §1 + .claude/rules/specialist-intelligence-bar.md):
 *   - Pure functions: no DB, no LLM, no HTTP, no `server/` runtime imports
 *     beyond pure types. Importable from edge runtimes.
 *   - Field keys MUST match `mgmt-co.funding.candidateFields[].key` in
 *     `engine/analyst/registry/specialist-catalog.ts` verbatim — they are
 *     simultaneously the dimension `field`, the `assumption_guidance.assumptionKey`,
 *     and the cache-key `fieldGroup` element.
 *   - Per `.claude/rules/field-definitions-no-prescription-hints.md`: prompt
 *     descriptions name evidence sources, NEVER typical ranges. The cognitive
 *     panels reason from market data; we don't seed the answer.
 *   - Per `.claude/rules/the-analyst-persona.md`: this file produces
 *     Specialist commentary inputs, never financial values — engines compute,
 *     Specialists analyze.
 */

import { createHash } from "node:crypto";
import {
  computeInputContextHash,
  type CompanyCacheInputs,
  type VerdictCacheKey,
} from "../../../engine/analyst/cognitive/cache-keys";
import type { DimensionInput } from "../../../engine/analyst/cognitive/verdict-reconstructor";
import type { CapitalRaiseInputs } from "../../../engine/watchdog/capitalRaiseEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";
import type { IcpModelProfile } from "@shared/constants-benchmarks";

// ────────────────────────────────────────────────────────────────────────────
// Funding dimension taxonomy (5 keys, locked to specialist-catalog.ts entry A)

/**
 * The 5 Funding dimension keys. Must match `mgmt-co.funding.candidateFields[].key`
 * in `engine/analyst/registry/specialist-catalog.ts` verbatim. A cross-check
 * test guards round-trip alignment.
 */
export const FUNDING_DIMENSION_KEYS = [
  "runwayBufferMonths",
  "sizingOvershootPct",
  "trancheGapMonths",
  "revenueRampDelayMonths",
  "burnFlexDownPct",
] as const;

export type FundingDimensionKey = (typeof FUNDING_DIMENSION_KEYS)[number];

/**
 * Per-dimension descriptor consumed by the Prompt Engineer LLM stage. The
 * `evidenceCues` field names the reasoning sources Opus should consult — never
 * a typical-range hint, per the field-definitions-no-prescription-hints rule.
 */
export interface FundingDimensionDescriptor {
  key: FundingDimensionKey;
  label: string;
  unit: "mo" | "%";
  /** Markets/sources the cognitive panels should reason from. No numbers. */
  evidenceCues: readonly string[];
}

const FUNDING_DIMENSIONS: readonly FundingDimensionDescriptor[] = [
  {
    key: "runwayBufferMonths",
    label: "Runway buffer (months)",
    unit: "mo",
    evidenceCues: [
      "comparable management-co fundraises in same vertical + tier",
      "milestone density between this raise and the next inflection point",
      "cash burn cadence implied by overhead + comp + property pre-ops",
    ],
  },
  {
    key: "sizingOvershootPct",
    label: "Sizing overshoot %",
    unit: "%",
    evidenceCues: [
      "LP comp set's typical raise-to-need ratio for this vertical + stage",
      "dilution tolerance signals from the cap-table structure",
      "execution-risk premium implied by property pipeline maturity",
    ],
  },
  {
    key: "trancheGapMonths",
    label: "Tranche gap (months)",
    unit: "mo",
    evidenceCues: [
      "milestone calendar between Tranche 1 close and Tranche 2 trigger",
      "comp-set tranche pacing for staged hospitality raises",
      "macro raise-window risk over the gap interval",
    ],
  },
  {
    key: "revenueRampDelayMonths",
    label: "Revenue ramp delay (months)",
    unit: "mo",
    evidenceCues: [
      "property pipeline opening cadence vs current Tranche 1 deployment plan",
      "ramp curves observed for comparable hospitality operators in the vertical",
      "seasonal openings and shoulder-period demand in target markets",
    ],
  },
  {
    key: "burnFlexDownPct",
    label: "Burn flex-down %",
    unit: "%",
    evidenceCues: [
      "discretionary share of overhead + partner comp that can be paused",
      "headcount staging tied to property count tiers",
      "marketing/dev-spend cadence flex observed in comparable raises",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface PortfolioAggregate {
  /** Number of properties in the portfolio at evaluation time. */
  propertyCount: number;
  /** Total funding need across all properties + management company, in USD. */
  totalRaiseNeedUsd: number;
  /** Months of runway the modeled plan needs to clear all milestones. */
  runwayNeedMonths: number;
}

export interface FundingPersonaContext {
  /** Vertical slug (e.g. "wellness", "boutique-luxury", "lifestyle"). */
  verticalSlug: string;
  /** Market tier ("L+B", "lifestyle", "luxury", "midscale"). */
  marketTier: string;
  /** Primary operating locale (e.g. "US", "Brazil", "MX"). */
  locale: string;
}

export interface PriorVerdictRef {
  /** Specialist id that produced the prior verdict (composition reference). */
  specialistId: string;
  /** Cognitive run id — non-null for Tier-1 verdicts. */
  cognitiveRunId: string | null;
  /** Iso date of the prior verdict. */
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface FundingPromptInputContext {
  inputs: CapitalRaiseInputs;
  portfolio: PortfolioAggregate;
  persona: FundingPersonaContext;
  /** Selected ICP management company model (A/B/C). Null = not yet selected. */
  icpModel?: IcpModelProfile | null;
  /** Composition references; empty in G1's first run. */
  priorVerdicts?: readonly PriorVerdictRef[];
}

export interface FundingPromptInput {
  specialistId: "mgmt-co.funding";
  /** The 5 dimension descriptors the Prompt Engineer must address. */
  requiredFields: readonly FundingDimensionDescriptor[];
  /** Aggregate portfolio numbers; engine-computed, never re-derived here. */
  portfolio: PortfolioAggregate;
  /** Persona triplet that drives prompt framing + cache personaHash. */
  persona: FundingPersonaContext;
  /** User's currently-saved Funding-tab values per dimension key. */
  currentValues: Readonly<Record<FundingDimensionKey, number | null>>;
  /** Empty in G1; populated when this Specialist composes against another. */
  priorVerdicts: readonly PriorVerdictRef[];
  /** Specialist intent string consumed verbatim by the Prompt Engineer. */
  intent: string;
}

const FUNDING_INTENT =
  "Funding raise adequacy and timing: is the amount being raised enough, and is it arriving at the right time? Analyze raise sizing, tranche pacing, runway adequacy, and revenue ramp coverage for the management company capital stack. Direct the user to the Cash Flow Statement when engine output is needed to confirm sufficiency.";

/**
 * Assemble the structured input pack the Prompt Engineer LLM stage consumes.
 * Pure: ctx is the only signal; no defaults reach into the database.
 */
export function buildFundingPromptInput(
  ctx: FundingPromptInputContext,
): FundingPromptInput {
  const currentValues = Object.fromEntries(
    FUNDING_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<FundingDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.funding",
    requiredFields: FUNDING_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: FUNDING_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CapitalRaiseInputs → DimensionInput[]

/**
 * Adapt the legacy `CapitalRaiseInputs` shape into `DimensionInput[]` for
 * `consultCognitive`. One DimensionInput per known Funding dimension key.
 * Unknown keys on the inputs object are dropped — the catalog locks the
 * 5 keys that flow through.
 */
export function mapInputsToDimensionInputs(
  inputs: CapitalRaiseInputs,
): DimensionInput[] {
  return FUNDING_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: inputs[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface FundingCacheKeyArgs {
  /** Always "mgmt-co.funding" but accepted as arg so future Specialists can share the helper if needed. */
  specialistId: "mgmt-co.funding";
  /**
   * Dimension keys this cache entry covers. Defaults to all 5; callers may
   * pass a subset when a partial Save touched only some dimensions.
   */
  fieldGroup?: readonly FundingDimensionKey[];
  persona: FundingPersonaContext;
  /** Company-side cache inputs (numProperties, capitalRaise{1,2}Amount, etc.) */
  companyInputs: CompanyCacheInputs;
  /** Scenario context; null = shared workspace. */
  scenarioId: number | null;
  /** Management-company entity id. */
  entityId: number;
  /** Engine version at call time (orchestrator semantics version). */
  engineVersion: string;
}

/**
 * Build the structured `VerdictCacheKey` for a Funding-tab evaluation. Wraps
 * `computeCacheKey` + `computeInputContextHash` from `cache-keys.ts`.
 *
 * Field-group typing note: `VerdictCacheKey.fieldGroup` is currently typed as
 * `CanonicalResearchField[]` (the property-research enum). Funding's
 * dimension keys are management-company-specific and are NOT in that enum.
 * The runtime hash is JSON-serialized over the string array, so the cast is
 * safe — but widening `cache-keys.ts` to accept Specialist-owned key
 * vocabularies (or making `VerdictCacheKey` generic over field keys) is its
 * own packet. Surfaced in G1's completion report as a pattern lesson for
 * G2-G6.
 */
export function buildFundingCacheKey(args: FundingCacheKeyArgs): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? FUNDING_DIMENSION_KEYS;
  // Sorted + deduplicated by `computeCacheKey` itself; we cast at the
  // boundary because Funding's keys are not in CanonicalResearchField.
  const fieldGroupAsCanonical = fieldGroup as readonly string[] as CanonicalResearchField[];

  // Persona triplet → stable hash. The cache-key shape is persona-hash-agnostic
  // so this is just a deterministic stringification of the resolved persona.
  const personaHash = sha256OfPersona(args.persona);

  const inputContextHash = computeInputContextHash(
    "company",
    args.companyInputs,
    fieldGroupAsCanonical,
  );

  return {
    scenarioId: args.scenarioId,
    entityType: "company",
    entityId: args.entityId,
    fieldGroup: fieldGroupAsCanonical,
    personaHash,
    inputContextHash,
    engineVersion: args.engineVersion,
  };
}

/**
 * Persona triplet → SHA-256 hex. Defined inline so this module stays free of
 * dynamic crypto imports at edge-runtime call sites that may not have
 * `node:crypto`. Falls back to a deterministic non-cryptographic hash if
 * `node:crypto` is unavailable.
 */
function sha256OfPersona(persona: FundingPersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  // Lazy node:crypto import; Node + most edge runtimes (Vercel, CF Workers
  // with Node compat) provide it. If not available, throw — there is no
  // safe fallback for cache-key material.
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Re-export of `computeCacheKey` so callers consuming this module don't have
 * to dual-import from `cache-keys.ts` for the actual hash step. Pass the
 * `VerdictCacheKey` returned by `buildFundingCacheKey` to get the final
 * SHA-256 hash that becomes `research_runs.cache_key`.
 */
export { computeCacheKey } from "../../../engine/analyst/cognitive/cache-keys";
