/**
 * mgmt-co-property-defaults-prompt-input-builder.ts — pure input adapters for
 * the Property-Defaults Surface Specialist's Tier-1 graduation (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-company-prompt-input-builder.ts — same pattern, same
 * constraints. No I/O, no LLM, no HTTP.
 *
 * Four dimensions: all fraction-rate fields from the Property Underwriting tab
 * (Admin → Model Defaults → Property Underwriting). Values stored as fractions
 * (e.g. 0.65 = 65%).
 */

import { createHash } from "node:crypto";
import {
  computeInputContextHash,
  type CompanyCacheInputs,
  type VerdictCacheKey,
} from "../../../engine/analyst/cognitive/cache-keys";
import type { DimensionInput } from "../../../engine/analyst/cognitive/verdict-reconstructor";
import type { PropertyDefaultsInputs } from "../../../engine/watchdog/propertyDefaultsEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";

// ────────────────────────────────────────────────────────────────────────────
// Property-Defaults dimension taxonomy (4 keys, locked to specialist-catalog
// entry P — mgmt-co.property-defaults)

export const PROPERTY_DEFAULTS_DIMENSION_KEYS = [
  "eventExpenseRate",
  "otherExpenseRate",
  "utilitiesVariableSplit",
  "salesCommissionRate",
] as const;

export type PropertyDefaultsDimensionKey = (typeof PROPERTY_DEFAULTS_DIMENSION_KEYS)[number];

export interface PropertyDefaultsDimensionDescriptor {
  key: PropertyDefaultsDimensionKey;
  label: string;
  /** Display unit for prompt rendering — "%" for all 4 dims. */
  unit: "%";
  /** Data sources + reasoning inputs to consult. No numeric hints. */
  evidenceCues: readonly string[];
}

const PROPERTY_DEFAULTS_DIMENSIONS: readonly PropertyDefaultsDimensionDescriptor[] = [
  {
    key: "eventExpenseRate",
    label: "Event expense rate (fraction of event/banquet revenue)",
    unit: "%",
    evidenceCues: [
      "banquet and event cost-to-revenue benchmarks for full-service boutique-luxury hotels (AHLA/USALI F&B and Event Cost Benchmarks 11th ed., CBRE Hotel Operations Report — event-segment cost ratios by hotel tier)",
      "food-and-beverage prime cost structure (labor + COGS) as the primary driver of event cost ratio — F&B-heavy properties push the ratio upward; event-only catering models pull it lower",
      "LP scrutiny on event profitability: a ratio above the USALI undistributed benchmark for comparable hotels suggests either high labor cost or under-pricing; below suggests a lean catering model that may constrain event revenue growth",
    ],
  },
  {
    key: "otherExpenseRate",
    label: "Other expense rate (fraction of other/ancillary revenue)",
    unit: "%",
    evidenceCues: [
      "other/ancillary department cost-to-revenue benchmarks for boutique-luxury hotels (CBRE Trends in the Hotel Industry, USALI undistributed-department benchmarks for ancillary/other revenue streams)",
      "ancillary revenue mix composition: spa, parking, retail, resort fees — each carries a different cost structure; mixed ancillary portfolios tend toward the mid-range because high-margin streams (resort fees) offset lower-margin ones (retail)",
      "investor-return impact: other expense ratio above USALI comps for the property's comp set signals either under-pricing of ancillary services or structurally high delivery cost — worth flagging for LP diligence",
    ],
  },
  {
    key: "utilitiesVariableSplit",
    label: "Utilities variable split (fraction of utilities that vary with occupancy)",
    unit: "%",
    evidenceCues: [
      "occupancy-driven energy variability benchmarks for boutique hotels (ENERGY STAR Hotel Energy Intensity benchmarks, Cornell Hotel Sustainability Handbook, STR Energy Cost Survey — variable vs. fixed utilities split by hotel class)",
      "property infrastructure drivers: HVAC zoning by room/floor, in-room controls, EV-charging infrastructure, laundry volume — higher automation and smart-room controls raise the variable fraction; older fixed-load infrastructure lowers it",
      "financial model impact: a higher variable split improves ANOI margin at low occupancy (lower fixed load) but reduces the benefit of high occupancy periods; LP sensitivity on worst-case cash flow modeling",
    ],
  },
  {
    key: "salesCommissionRate",
    label: "Sales commission rate (blended distribution/OTA commission fraction of revenue)",
    unit: "%",
    evidenceCues: [
      "blended OTA and distribution commission benchmarks for boutique-luxury hotels (Kalibri Labs Direct Booking Study, AHLA Distribution Cost Study, Phocuswright OTA Commission Report — weighted-average commission for comparable OTA mix and brand affiliation)",
      "channel mix context: the commission rate is a weighted average of direct-booking (near 0%) and OTA (typically higher); a boutique with heavy OTA dependence sits higher in the range; a well-developed direct booking program pulls it lower",
      "LP scrutiny on distribution cost: a high blended commission compresses RevPAR-to-NOI flow-through and may signal brand underinvestment in direct channels; Kalibri Labs data shows the cost spread between OTA-heavy and direct-booking-optimized boutiques is material",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface PropertyDefaultsPortfolioAggregate {
  propertyCount: number;
  /** Total annual ManCo revenue (USD) implied by the financial model. */
  totalManagementCoRevenueUsd: number;
  /** Modeled monthly burn (USD). */
  monthlyBurnUsd: number;
}

export interface PropertyDefaultsPersonaContext {
  verticalSlug: string;
  marketTier: string;
  locale: string;
}

export interface PropertyDefaultsPriorVerdictRef {
  specialistId: string;
  cognitiveRunId: string | null;
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface PropertyDefaultsPromptInputContext {
  inputs: PropertyDefaultsInputs;
  portfolio: PropertyDefaultsPortfolioAggregate;
  persona: PropertyDefaultsPersonaContext;
  priorVerdicts?: readonly PropertyDefaultsPriorVerdictRef[];
}

export interface PropertyDefaultsPromptInput {
  specialistId: "mgmt-co.property-defaults";
  requiredFields: readonly PropertyDefaultsDimensionDescriptor[];
  portfolio: PropertyDefaultsPortfolioAggregate;
  persona: PropertyDefaultsPersonaContext;
  currentValues: Readonly<Record<PropertyDefaultsDimensionKey, number | null>>;
  priorVerdicts: readonly PropertyDefaultsPriorVerdictRef[];
  intent: string;
}

const PROPERTY_DEFAULTS_INTENT =
  "Property underwriting defaults adequacy: are the operator's assumed event expense rate, other expense rate, utilities variable split, and blended sales commission rate defensible for the boutique-luxury properties in the portfolio? Evaluate each dimension against USALI / CBRE / AHLA / Kalibri Labs benchmarks for this operator's vertical, locale, and portfolio scale. Flag LP scrutiny triggers: a high event expense rate compresses F&B contribution; a high sales commission rate signals OTA dependence and distribution cost risk; a utilities variable split that is inconsistently high or low relative to the property infrastructure profile creates NOI forecast risk.";

export function buildPropertyDefaultsPromptInput(
  ctx: PropertyDefaultsPromptInputContext,
): PropertyDefaultsPromptInput {
  const currentValues = Object.fromEntries(
    PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<PropertyDefaultsDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.property-defaults",
    requiredFields: PROPERTY_DEFAULTS_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: PROPERTY_DEFAULTS_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PropertyDefaultsInputs → DimensionInput[]

export function mapPropertyDefaultsToDimensionInputs(
  inputs: PropertyDefaultsInputs,
): DimensionInput[] {
  return PROPERTY_DEFAULTS_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: (inputs as Record<string, number | null | undefined>)[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface PropertyDefaultsCacheKeyArgs {
  specialistId: "mgmt-co.property-defaults";
  fieldGroup?: readonly PropertyDefaultsDimensionKey[];
  persona: PropertyDefaultsPersonaContext;
  companyInputs: CompanyCacheInputs;
  scenarioId: number | null;
  entityId: number;
  engineVersion: string;
}

export function buildPropertyDefaultsCacheKey(
  args: PropertyDefaultsCacheKeyArgs,
): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? PROPERTY_DEFAULTS_DIMENSION_KEYS;
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

function sha256OfPersona(persona: PropertyDefaultsPersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export { computeCacheKey } from "../../../engine/analyst/cognitive/cache-keys";
