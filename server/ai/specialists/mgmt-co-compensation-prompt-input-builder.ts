/**
 * mgmt-co-compensation-prompt-input-builder.ts — pure input adapters for the
 * Compensation Surface Specialist's Tier-1 graduation (G3 of ADR-007).
 *
 * Mirrors mgmt-co-revenue-prompt-input-builder.ts — same pattern, same
 * constraints. No I/O, no LLM, no HTTP.
 *
 * Three exports:
 *
 *   1. `buildCompensationPromptInput(ctx)` — assembles the structured input
 *      pack consumed by the Opus prompt stage.
 *
 *   2. `mapCompensationToDimensionInputs(inputs)` — adapts `CompensationInputs`
 *      shape into `DimensionInput[]` (one per dimension key; all numeric).
 *
 *   3. `buildCompensationCacheKey(args)` — wraps `computeCacheKey` with
 *      Compensation-specific field-group taxonomy.
 *
 * Constraints (per ADR-007 §1 + .claude/rules/specialist-intelligence-bar.md):
 *   - Pure functions: no DB, no LLM, no HTTP.
 *   - Field keys MUST match `mgmt-co.compensation.candidateFields[].key` in
 *     `engine/analyst/registry/specialist-catalog.ts` verbatim.
 *   - Per `.claude/rules/field-definitions-no-prescription-hints.md`: evidence
 *     cues name reasoning sources, NEVER typical-range hints.
 */

import { createHash } from "node:crypto";
import {
  computeInputContextHash,
  type CompanyCacheInputs,
  type VerdictCacheKey,
} from "../../../engine/analyst/cognitive/cache-keys";
import type { DimensionInput } from "../../../engine/analyst/cognitive/verdict-reconstructor";
import type { CompensationInputs } from "../../../engine/watchdog/compensationEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";

// ────────────────────────────────────────────────────────────────────────────
// Compensation dimension taxonomy (5 keys, locked to specialist-catalog.ts entry M)

/**
 * The 5 Compensation dimension keys. Must match
 * `mgmt-co.compensation.candidateFields[].key` in `specialist-catalog.ts`
 * verbatim.
 */
export const COMPENSATION_DIMENSION_KEYS = [
  "partnerCompYear1",
  "partnerCompYear10",
  "partnerCountYear1",
  "staffSalary",
  "staffTier3Fte",
] as const;

export type CompensationDimensionKey = (typeof COMPENSATION_DIMENSION_KEYS)[number];

/**
 * Per-dimension descriptor consumed by the Opus prompt stage. `evidenceCues`
 * names reasoning sources — never a typical-range hint, per the
 * field-definitions-no-prescription-hints rule.
 */
export interface CompensationDimensionDescriptor {
  key: CompensationDimensionKey;
  label: string;
  /** Display unit hint for prompt rendering — "$" for USD, "" for unitless count. */
  unit: "$" | "";
  /** Data sources + reasoning inputs Opus should consult. No numbers. */
  evidenceCues: readonly string[];
}

const COMPENSATION_DIMENSIONS: readonly CompensationDimensionDescriptor[] = [
  {
    key: "partnerCompYear1",
    label: "Year 1 management compensation (annual USD)",
    unit: "$",
    evidenceCues: [
      "founder-stage partner draws for comparable boutique-luxury operators (AHLA Lodging Industry Survey, HVS Hospitality Comp Index)",
      "investor expectations on early-stage operator pay before fee revenue ramps in this vertical and locale",
      "operator portfolio scale + property count at Year 1 and how that constrains defensible founder draws",
    ],
  },
  {
    key: "partnerCompYear10",
    label: "Year 10 management compensation (annual USD)",
    unit: "$",
    evidenceCues: [
      "institutional-stage management compensation for comparable platform operators at 13-25 properties (CBRE Hospitality C-Suite Survey, HVS C-Suite Benchmarks)",
      "ManCo revenue trajectory implied by the operator's portfolio plan and how it caps defensible terminal partner pay",
      "comp restraint vs. industry-standard trajectory at scale — does the operator over-pay or hold the line?",
    ],
  },
  {
    key: "partnerCountYear1",
    label: "Year 1 partner headcount (count)",
    unit: "",
    evidenceCues: [
      "founding team composition for comparable boutique-luxury operators (AHLA, HVS founder surveys)",
      "key-person risk LPs price into single-founder vs. small-team operators in this vertical",
      "cap-table dilution and incentive alignment at the operator's target raise size",
    ],
  },
  {
    key: "staffSalary",
    label: "Average annual staff salary per FTE (USD)",
    unit: "$",
    evidenceCues: [
      "hospitality mid-level operations role compensation in the operator's primary locale (AHLA Lodging Industry Survey, BLS Hospitality Wages)",
      "talent retention dynamics — under-pricing labour usually breaks the assumption when retention slips",
      "role mix implied by the FTE tier counts (junior-heavy vs. senior-heavy)",
    ],
  },
  {
    key: "staffTier3Fte",
    label: "Tier-3 (max-scale) FTE count",
    unit: "",
    evidenceCues: [
      "scale-stage staffing models for comparable institutional-scale boutique platforms (HVS, CBRE staffing surveys)",
      "operating capacity required at the operator's target portfolio size and how that maps to FTE load",
      "compounding effect of FTE load × staff salary on burn at scale — cap-rate sensitivity",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface CompensationPortfolioAggregate {
  /** Number of revenue-active properties in the portfolio at evaluation time. */
  propertyCount: number;
  /** Total annual ManCo revenue (USD) implied by the financial model. */
  totalManagementCoRevenueUsd: number;
  /** Modeled monthly burn (USD), used to ground partner-comp share. */
  monthlyBurnUsd: number;
}

export interface CompensationPersonaContext {
  /** Vertical slug (e.g. "wellness", "boutique-luxury", "lifestyle"). */
  verticalSlug: string;
  /** Market tier ("L+B", "lifestyle", "luxury", "midscale"). */
  marketTier: string;
  /** Primary operating locale (e.g. "US", "Brazil", "MX"). */
  locale: string;
}

export interface CompensationPriorVerdictRef {
  /** Specialist id that produced the prior verdict (composition reference). */
  specialistId: string;
  /** Cognitive run id — non-null for Tier-1 verdicts. */
  cognitiveRunId: string | null;
  /** Iso date of the prior verdict. */
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface CompensationPromptInputContext {
  inputs: CompensationInputs;
  portfolio: CompensationPortfolioAggregate;
  persona: CompensationPersonaContext;
  /** Composition references; empty in G3's first run. */
  priorVerdicts?: readonly CompensationPriorVerdictRef[];
}

export interface CompensationPromptInput {
  specialistId: "mgmt-co.compensation";
  /** The 5 dimension descriptors the Opus prompt must address. */
  requiredFields: readonly CompensationDimensionDescriptor[];
  /** Aggregate portfolio numbers; engine-computed, never re-derived here. */
  portfolio: CompensationPortfolioAggregate;
  /** Persona triplet that drives prompt framing + cache personaHash. */
  persona: CompensationPersonaContext;
  /** User's currently-saved Compensation-tab values per dimension key. */
  currentValues: Readonly<Record<CompensationDimensionKey, number | null>>;
  /** Empty in G3; populated when composing against another Specialist. */
  priorVerdicts: readonly CompensationPriorVerdictRef[];
  /** Specialist intent string consumed verbatim by the Opus stage. */
  intent: string;
}

const COMPENSATION_INTENT =
  "Compensation plan adequacy: are the management company's partner compensation trajectory (Year 1 and Year 10), partner headcount, average staff salary, and Tier-3 staffing model defensible to LPs given the operator's vertical, locale, and portfolio scale? Evaluate each dimension against ManCo comp comparables and persona expectations. Flag both lean-founder restraint (key-person risk) and aggressive draws (LP pushback / cap-table dilution).";

/**
 * Assemble the structured input pack the Opus prompt stage consumes.
 * Pure: ctx is the only signal; no defaults reach into the database.
 */
export function buildCompensationPromptInput(
  ctx: CompensationPromptInputContext,
): CompensationPromptInput {
  const currentValues = Object.fromEntries(
    COMPENSATION_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<CompensationDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.compensation",
    requiredFields: COMPENSATION_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: COMPENSATION_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CompensationInputs → DimensionInput[]

/**
 * Adapt `CompensationInputs` into `DimensionInput[]` for `consultCognitive`.
 * One DimensionInput per known Compensation dimension key.
 */
export function mapCompensationToDimensionInputs(
  inputs: CompensationInputs,
): DimensionInput[] {
  return COMPENSATION_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: inputs[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface CompensationCacheKeyArgs {
  specialistId: "mgmt-co.compensation";
  fieldGroup?: readonly CompensationDimensionKey[];
  persona: CompensationPersonaContext;
  companyInputs: CompanyCacheInputs;
  scenarioId: number | null;
  entityId: number;
  engineVersion: string;
}

/**
 * Build the structured `VerdictCacheKey` for a Compensation-tab evaluation.
 * Mirrors `buildRevenueCacheKey` — same cast rationale (Compensation keys
 * are not in CanonicalResearchField; widening cache-keys.ts is its own
 * packet).
 */
export function buildCompensationCacheKey(args: CompensationCacheKeyArgs): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? COMPENSATION_DIMENSION_KEYS;
  const fieldGroupAsCanonical = fieldGroup as readonly string[] as CanonicalResearchField[];

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

function sha256OfPersona(persona: CompensationPersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export { computeCacheKey } from "../../../engine/analyst/cognitive/cache-keys";
