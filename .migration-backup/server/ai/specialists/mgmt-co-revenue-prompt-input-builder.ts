/**
 * mgmt-co-revenue-prompt-input-builder.ts — pure input adapters for the
 * Revenue Surface Specialist's Tier-1 graduation (G2-v1 of ADR-007).
 *
 * Mirrors mgmt-co-funding-prompt-input-builder.ts (G1.5c-v1) — same pattern,
 * same constraints. No ICP model gate: revenue ancillary mix is driven by
 * property vertical + guest profile, not ManCo scale tier.
 *
 * Three exports, no I/O:
 *
 *   1. `buildRevenuePromptInput(ctx)` — assembles the structured input pack
 *      consumed by the Opus prompt stage.
 *
 *   2. `mapInputsToDimensionInputs(inputs)` — adapts `RevenueInputs` shape
 *      into `DimensionInput[]` (one per dimension key; all numeric).
 *
 *   3. `buildRevenueCacheKey(args)` — wraps `computeCacheKey` with Revenue-
 *      specific field-group taxonomy.
 *
 * Constraints (per ADR-007 §1 + .claude/rules/specialist-intelligence-bar.md):
 *   - Pure functions: no DB, no LLM, no HTTP.
 *   - Field keys MUST match `mgmt-co.revenue.candidateFields[].key` in
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
import type { RevenueInputs } from "../../../engine/watchdog/revenueEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";

// ────────────────────────────────────────────────────────────────────────────
// Revenue dimension taxonomy (5 keys, locked to specialist-catalog.ts entry B)

/**
 * The 5 Revenue dimension keys. Must match `mgmt-co.revenue.candidateFields[].key`
 * in `engine/analyst/registry/specialist-catalog.ts` verbatim.
 */
export const REVENUE_DIMENSION_KEYS = [
  "marketingRate",
  "fbRevenueShare",
  "eventsRevenueShare",
  "otherRevenueShare",
  "cateringBoostPct",
] as const;

export type RevenueDimensionKey = (typeof REVENUE_DIMENSION_KEYS)[number];

/**
 * Per-dimension descriptor consumed by the Opus prompt stage. `evidenceCues`
 * names reasoning sources — never a typical-range hint, per the
 * field-definitions-no-prescription-hints rule.
 */
export interface RevenueDimensionDescriptor {
  key: RevenueDimensionKey;
  label: string;
  unit: "%";
  /** Data sources + reasoning inputs Opus should consult. No numbers. */
  evidenceCues: readonly string[];
}

const REVENUE_DIMENSIONS: readonly RevenueDimensionDescriptor[] = [
  {
    key: "marketingRate",
    label: "Marketing & brand spend (% of room revenue)",
    unit: "%",
    evidenceCues: [
      "brand-level marketing budgets as % of room revenue for comparable boutique-luxury operators (STR benchmarks, HVS Brand Study)",
      "channel mix and OTA commission structure for the property's primary distribution channels",
      "direct-booking investment required to hit the revenue model's OTA mix assumptions",
    ],
  },
  {
    key: "fbRevenueShare",
    label: "F&B revenue (% of total revenue)",
    unit: "%",
    evidenceCues: [
      "USALI F&B department revenue share for comparable properties by vertical (HVS, CBRE Hotel Horizons)",
      "outlet concept count, seat count relative to room count, and meal period coverage",
      "capture rate assumptions for in-house vs. walk-in F&B guests in the property's market",
    ],
  },
  {
    key: "eventsRevenueShare",
    label: "Events & banquets (% of total revenue)",
    unit: "%",
    evidenceCues: [
      "meeting + event space per key ratio vs. comp set (CBRE, STR Group event-space analysis)",
      "corporate vs. social/SMERF demand mix in the market and its effect on banquet capture",
      "seasonality of event demand in the target locality and property positioning",
    ],
  },
  {
    key: "otherRevenueShare",
    label: "Other ancillary revenue (% of total revenue)",
    unit: "%",
    evidenceCues: [
      "spa, retail, parking, and recreation revenue mix for comparable boutique/wellness properties (HVS Spa Survey, STR)",
      "amenity count and revenue-generating facility per key for the property tier and vertical",
      "ancillary yield management benchmarks in the target market by property type",
    ],
  },
  {
    key: "cateringBoostPct",
    label: "Catering lift above base F&B (%)",
    unit: "%",
    evidenceCues: [
      "catering and banquet capture uplift observed in comparable operator comp sets for the property's event space per key",
      "group and social-event calendar density assumptions embedded in the revenue model's occupancy mix",
      "catering revenue per attendee vs. room F&B per occupied room ratio for the property vertical",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface RevenuePortfolioAggregate {
  /** Number of revenue-active properties in the portfolio at evaluation time. */
  propertyCount: number;
  /** Weighted average stabilized occupancy across properties (0–1). */
  avgOccupancyRate: number;
  /** Average daily rate across all properties, in USD. */
  avgAdr: number;
}

export interface RevenuePersonaContext {
  /** Vertical slug (e.g. "wellness", "boutique-luxury", "lifestyle"). */
  verticalSlug: string;
  /** Market tier ("L+B", "lifestyle", "luxury", "midscale"). */
  marketTier: string;
  /** Primary operating locale (e.g. "US", "Brazil", "MX"). */
  locale: string;
}

export interface RevenuePriorVerdictRef {
  /** Specialist id that produced the prior verdict (composition reference). */
  specialistId: string;
  /** Cognitive run id — non-null for Tier-1 verdicts. */
  cognitiveRunId: string | null;
  /** Iso date of the prior verdict. */
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface RevenuePromptInputContext {
  inputs: RevenueInputs;
  portfolio: RevenuePortfolioAggregate;
  persona: RevenuePersonaContext;
  /** Composition references; empty in G2's first run. */
  priorVerdicts?: readonly RevenuePriorVerdictRef[];
}

export interface RevenuePromptInput {
  specialistId: "mgmt-co.revenue";
  /** The 5 dimension descriptors the Opus prompt must address. */
  requiredFields: readonly RevenueDimensionDescriptor[];
  /** Aggregate portfolio numbers; engine-computed, never re-derived here. */
  portfolio: RevenuePortfolioAggregate;
  /** Persona triplet that drives prompt framing + cache personaHash. */
  persona: RevenuePersonaContext;
  /** User's currently-saved Revenue-tab values per dimension key. */
  currentValues: Readonly<Record<RevenueDimensionKey, number | null>>;
  /** Empty in G2; populated when composing against another Specialist. */
  priorVerdicts: readonly RevenuePriorVerdictRef[];
  /** Specialist intent string consumed verbatim by the Opus stage. */
  intent: string;
}

const REVENUE_INTENT =
  "Revenue ancillary mix adequacy: are the management company's marketing spend rate and ancillary revenue share assumptions (F&B, events, catering, other) appropriate for the property vertical, brand tier, and target market? Evaluate each rate against boutique-luxury operator comp sets and USALI benchmarks. Flag both under-assumptions (missed revenue potential) and over-assumptions (unrealistic capture rates).";

/**
 * Assemble the structured input pack the Opus prompt stage consumes.
 * Pure: ctx is the only signal; no defaults reach into the database.
 */
export function buildRevenuePromptInput(
  ctx: RevenuePromptInputContext,
): RevenuePromptInput {
  const currentValues = Object.fromEntries(
    REVENUE_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<RevenueDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.revenue",
    requiredFields: REVENUE_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: REVENUE_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// RevenueInputs → DimensionInput[]

/**
 * Adapt `RevenueInputs` into `DimensionInput[]` for `consultCognitive`.
 * One DimensionInput per known Revenue dimension key; unknown keys dropped.
 */
export function mapRevenueToDimensionInputs(
  inputs: RevenueInputs,
): DimensionInput[] {
  return REVENUE_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: inputs[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface RevenueCacheKeyArgs {
  specialistId: "mgmt-co.revenue";
  fieldGroup?: readonly RevenueDimensionKey[];
  persona: RevenuePersonaContext;
  companyInputs: CompanyCacheInputs;
  scenarioId: number | null;
  entityId: number;
  engineVersion: string;
}

/**
 * Build the structured `VerdictCacheKey` for a Revenue-tab evaluation.
 * Mirrors `buildFundingCacheKey` — same cast rationale (Revenue keys are not
 * in CanonicalResearchField; widening cache-keys.ts is its own packet).
 */
export function buildRevenueCacheKey(args: RevenueCacheKeyArgs): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? REVENUE_DIMENSION_KEYS;
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

function sha256OfPersona(persona: RevenuePersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export { computeCacheKey } from "../../../engine/analyst/cognitive/cache-keys";
