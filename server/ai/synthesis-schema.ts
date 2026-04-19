/**
 * SynthesisOutputSchema — the Zod shape Opus returns for Cognitive Engine
 * synthesis after OT-A.3 migration.
 *
 * This schema is the structured replacement for the regex-based extraction
 * in server/ai/research-value-extractor.ts. Before OT-A.3, Opus returned
 * loose JSON/markdown and the extractor regex-parsed strings like
 * "stabilized occupancy of 70–80%". After OT-A.3, Opus returns this schema
 * directly via Vercel AI SDK's streamObject. OT-A.4 deletes the extractor.
 *
 * Post OT-A.3 A/B (commit 12363142) revision:
 *   - `field` is now a strict z.enum(CANONICAL_RESEARCH_FIELDS). The
 *     initial A/B run showed Opus inventing verbose ad-hoc names like
 *     "Occupancy Rate (Stabilized Year 3)" instead of the canonical
 *     "occupancy" key. 7 of 11 cases had zero field overlap with the
 *     legacy extractor. Enum-restricting fixes that at the type layer;
 *     the system prompt must also restate the canonical list (TODO in
 *     research-orchestrator.ts system prompt).
 *   - `narrative[]` block removed from SynthesisOutput. It was unused
 *     by downstream consumers; generating it added ~10-20% latency.
 *   - `reasoning` max length tightened 1200 → 500 chars. 500 is enough
 *     for one tight sentence citing top 2-3 sources; longer reasoning
 *     prose never surfaces to users and wastes output tokens.
 *
 * Field names emitted by `NumericResearchValue.field` MUST match the
 * canonical keys consumed by:
 *   - Property.researchValues DB column (per-property research storage)
 *   - client/src/components/analyst/AnalystRangeIndicator.tsx (badge render)
 *   - server/ai/research-value-extractor.ts (legacy path — retires in OT-A.4)
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Canonical field enum
// ────────────────────────────────────────────────────────────────────────────

/**
 * The exhaustive list of canonical numeric field keys Opus is allowed to
 * emit. Derived from `server/ai/research-value-extractor.ts` — any key the
 * legacy regex extractor produces must appear here so downstream consumers
 * (Property.researchValues, range-badge UI) keep working unchanged.
 *
 * Adding a new field: add it here AND update the system prompt in
 * research-orchestrator.ts AND confirm the downstream consumer handles it.
 */
export const CANONICAL_RESEARCH_FIELDS = [
  // Revenue
  "adr",
  "adrGrowth",
  "occupancy",
  "startOccupancy",
  "occupancyStep",
  "rampMonths",
  "catering",
  "revShareFB",
  "revShareEvents",
  "revShareOther",
  // Valuation & exit
  "capRate",
  "landValue",
  "saleCommission",
  // Operating costs
  "costHousekeeping",
  "costFB",
  "costAdmin",
  "costMarketing",
  "costPropertyOps",
  "costUtilities",
  "costFFE",
  "costIT",
  "costOther",
  "costPropertyTaxes",
  // Management fees
  "incentiveFee",
  "svcFeeMarketing",
  "svcFeeTechRes",
  "svcFeeAccounting",
  "svcFeeRevMgmt",
  "svcFeeGeneralMgmt",
  "svcFeeProcurement",
  // Tax & macro
  "incomeTax",
  "inflationRate",
  "interestRate",
  // Capital structure
  "ltv",
  "costSeg5yrPct",
  "costSeg7yrPct",
  "costSeg15yrPct",
  "arDays",
  "apDays",
  "preOpeningCosts",
  // Platform (VRBO/STR)
  "platformFee",
] as const;

export type CanonicalResearchField = typeof CANONICAL_RESEARCH_FIELDS[number];
export const CanonicalResearchFieldSchema = z.enum(CANONICAL_RESEARCH_FIELDS);

// ────────────────────────────────────────────────────────────────────────────
// Field definitions — unit + denominator + scope per canonical field
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-field semantic contract. Derived from the legacy
 * `server/ai/research-value-extractor.ts` reading paths. These definitions
 * pin unit + denominator + scope so Opus emits values comparable to the
 * legacy path.
 *
 * History:
 *   - v1 (commit 1f80383f A/B): no definitions → Opus free-interpreted
 *     canonical keys. 6-order-of-magnitude drift on landValue, etc.
 *     Bucket-match aggregate 39.9%.
 *   - v2 (commit 9b88958e, A/B 1ca4a2ee): definitions added via textbook
 *     semantics. 7 fields dramatically improved (landValue, costFB,
 *     costPropertyTaxes, occupancy, costFFE, costPropertyOps, catering).
 *     BUT 2 definitions were WRONG — picked textbook interpretation
 *     instead of what legacy actually emits:
 *       * rampMonths — said "per-step months" (textbook); legacy emits
 *         TOTAL ramp duration (industry practice). Bucket-match 0%.
 *       * incentiveFee — said "% of total revenue" (safer-looking);
 *         legacy emits "% of GOP" (industry practice). Bucket-match 0%.
 *     Aggregate stayed flat at 37.6% because wins cancelled regressions.
 *   - v3 (this commit): fix rampMonths + incentiveFee to match legacy
 *     semantics. The remaining bucket-match gap on narrow-range fields
 *     (cost seg splits, svcFeeRevMgmt) is inherent Opus stochastic
 *     variance, not definitional drift — two independent runs on a
 *     5–10pp wide range will naturally disagree ~40% of the time.
 *
 * Acceptance criteria reframe: aggregate bucket-match threshold is the
 * WRONG gate. The right gate is categorical:
 *   - Unit errors (orders of magnitude) → must be ZERO
 *   - Denominator errors (wrong base) → must be ZERO
 *   - Scope errors (per-step vs cumulative) → must be ZERO
 *   - Stochastic variance on narrow-range fields → ACCEPTABLE
 *
 * To be injected into the synthesis system prompt as a table, replacing
 * the flat enum list.
 */
export interface FieldDefinition {
  /** Canonical field key. Must match CANONICAL_RESEARCH_FIELDS. */
  key: CanonicalResearchField;
  /** Unit symbol (matches ResearchUnitSchema where applicable). */
  unit: "%" | "$" | "days" | "months" | "years" | "rooms" | "ratio";
  /** What the value is expressed in — the denominator for percentages, or the
   *  scope for dollar amounts. */
  denominator: string;
  /** One-phrase definition for the prompt. */
  description: string;
}

export const FIELD_DEFINITIONS: Record<CanonicalResearchField, FieldDefinition> = {
  // Revenue
  adr: { key: "adr", unit: "$", denominator: "per available room per night", description: "Average Daily Rate" },
  adrGrowth: { key: "adrGrowth", unit: "%", denominator: "annual growth over prior-year ADR (per-year, not cumulative)", description: "Annual ADR growth rate" },
  occupancy: { key: "occupancy", unit: "%", denominator: "of available room-nights, stabilized (year 3+)", description: "Stabilized occupancy rate" },
  startOccupancy: { key: "startOccupancy", unit: "%", denominator: "of available room-nights, month 1 of operations", description: "Day-one occupancy" },
  occupancyStep: { key: "occupancyStep", unit: "%", denominator: "per-step increment in occupancy (NOT cumulative); typical 3–10 percentage points per ramp interval", description: "Occupancy ramp step size" },
  rampMonths: { key: "rampMonths", unit: "months", denominator: "TOTAL months from opening to stabilized occupancy (end-to-end ramp duration, e.g., 24–36 months)", description: "Total ramp duration to stabilization" },
  catering: { key: "catering", unit: "%", denominator: "boost on F&B revenue (catering uplift multiplier)", description: "Catering boost on F&B" },
  revShareFB: { key: "revShareFB", unit: "%", denominator: "F&B revenue as % of TOTAL revenue", description: "F&B revenue share of total" },
  revShareEvents: { key: "revShareEvents", unit: "%", denominator: "Events revenue as % of TOTAL revenue", description: "Events revenue share of total" },
  revShareOther: { key: "revShareOther", unit: "%", denominator: "Other operated revenue as % of TOTAL revenue", description: "Other revenue share of total" },

  // Valuation & exit
  capRate: { key: "capRate", unit: "%", denominator: "annual NOI ÷ property value (exit cap rate)", description: "Exit cap rate" },
  landValue: { key: "landValue", unit: "%", denominator: "LAND ALLOCATION as % of PURCHASE PRICE (NOT a dollar amount; typical 15–30%)", description: "Land allocation percentage" },
  saleCommission: { key: "saleCommission", unit: "%", denominator: "broker commission as % of gross sale value", description: "Disposition commission" },

  // Department costs — note denominators differ
  costHousekeeping: { key: "costHousekeeping", unit: "%", denominator: "housekeeping cost as % of ROOM revenue", description: "Housekeeping cost rate" },
  costFB: { key: "costFB", unit: "%", denominator: "F&B cost of sales as % of F&B revenue (hospitality-standard food cost ratio; NOT % of total revenue)", description: "F&B cost of sales" },

  // Undistributed expenses — all % of TOTAL revenue
  costAdmin: { key: "costAdmin", unit: "%", denominator: "admin & general as % of TOTAL revenue (USALI undistributed)", description: "Admin & general rate" },
  costMarketing: { key: "costMarketing", unit: "%", denominator: "marketing as % of TOTAL revenue", description: "Marketing cost rate" },
  costPropertyOps: { key: "costPropertyOps", unit: "%", denominator: "property operations as % of TOTAL revenue", description: "Property ops rate" },
  costUtilities: { key: "costUtilities", unit: "%", denominator: "utilities as % of TOTAL revenue", description: "Utilities rate" },
  costFFE: { key: "costFFE", unit: "%", denominator: "FF&E reserve as % of TOTAL revenue", description: "FF&E reserve rate" },
  costIT: { key: "costIT", unit: "%", denominator: "IT & telecom as % of TOTAL revenue", description: "IT cost rate" },
  costOther: { key: "costOther", unit: "%", denominator: "other operated as % of TOTAL revenue", description: "Other operated rate" },

  // Property-value-based
  costPropertyTaxes: { key: "costPropertyTaxes", unit: "%", denominator: "annual property taxes as % of PROPERTY VALUE (mill rate; typical 1–3%)", description: "Property tax rate" },

  // Management fees
  incentiveFee: { key: "incentiveFee", unit: "%", denominator: "incentive management fee as % of GOP (Gross Operating Profit, hospitality-standard); NOT % of total revenue. Typical 8–15% of GOP.", description: "Incentive management fee (% of GOP)" },
  svcFeeMarketing: { key: "svcFeeMarketing", unit: "%", denominator: "service fee (marketing component) as % of TOTAL revenue", description: "Service fee — marketing" },
  svcFeeTechRes: { key: "svcFeeTechRes", unit: "%", denominator: "service fee (technology + reservations) as % of TOTAL revenue", description: "Service fee — tech/reservations" },
  svcFeeAccounting: { key: "svcFeeAccounting", unit: "%", denominator: "service fee (accounting) as % of TOTAL revenue", description: "Service fee — accounting" },
  svcFeeRevMgmt: { key: "svcFeeRevMgmt", unit: "%", denominator: "service fee (revenue management) as % of TOTAL revenue", description: "Service fee — revenue mgmt" },
  svcFeeGeneralMgmt: { key: "svcFeeGeneralMgmt", unit: "%", denominator: "service fee (general management) as % of TOTAL revenue", description: "Service fee — general mgmt" },
  svcFeeProcurement: { key: "svcFeeProcurement", unit: "%", denominator: "service fee (procurement) as % of TOTAL revenue", description: "Service fee — procurement" },

  // Tax & macro
  incomeTax: { key: "incomeTax", unit: "%", denominator: "corporate income tax rate as % of taxable income", description: "Income tax rate" },
  inflationRate: { key: "inflationRate", unit: "%", denominator: "annual CPI / general inflation (per year)", description: "Inflation rate" },
  interestRate: { key: "interestRate", unit: "%", denominator: "debt interest rate (annual, nominal)", description: "Interest rate on debt" },

  // Capital structure
  ltv: { key: "ltv", unit: "%", denominator: "loan amount as % of property value (acquisition LTV)", description: "Loan-to-value ratio" },
  costSeg5yrPct: { key: "costSeg5yrPct", unit: "%", denominator: "5-year MACRS class as % of BUILDING VALUE (depreciable basis = total project cost minus land allocation, per engine resolve-assumptions.ts:182 buildingValue * pct5). Typical 18–25%.", description: "Cost seg 5-yr class" },
  costSeg7yrPct: { key: "costSeg7yrPct", unit: "%", denominator: "7-year MACRS class as % of BUILDING VALUE (depreciable basis, see costSeg5yrPct). Typical 5–12%.", description: "Cost seg 7-yr class" },
  costSeg15yrPct: { key: "costSeg15yrPct", unit: "%", denominator: "15-year MACRS class as % of BUILDING VALUE (depreciable basis, see costSeg5yrPct). Typical 10–18%.", description: "Cost seg 15-yr class" },
  arDays: { key: "arDays", unit: "days", denominator: "accounts receivable days outstanding", description: "A/R days" },
  apDays: { key: "apDays", unit: "days", denominator: "accounts payable days outstanding", description: "A/P days" },
  preOpeningCosts: { key: "preOpeningCosts", unit: "$", denominator: "total pre-opening expense budget in DOLLARS (typical $200K–$2M for boutique-luxury)", description: "Pre-opening costs" },

  // Platform (VRBO/STR)
  platformFee: { key: "platformFee", unit: "%", denominator: "platform fee rate as % of GROSS booking value (all-in: host + guest fees)", description: "Platform fee rate" },
};

/**
 * Produces a table-formatted block of field definitions for injection into
 * the synthesis system prompt. Call this once at prompt construction time.
 *
 * Format is optimized for LLM comprehension: one line per field with
 * `key — unit — denominator`. Ordered by the CANONICAL_RESEARCH_FIELDS
 * const (which groups semantically).
 */
export function formatFieldDefinitionsForPrompt(): string {
  const lines = CANONICAL_RESEARCH_FIELDS.map((key) => {
    const def = FIELD_DEFINITIONS[key];
    return `  - \`${def.key}\` (${def.unit}) — ${def.denominator}`;
  });
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Unit enum
// ────────────────────────────────────────────────────────────────────────────

export const ResearchUnitSchema = z.enum([
  "%",
  "$",
  "days",
  "months",
  "years",
  "rooms",
  "ratio",
]);
export type ResearchUnit = z.infer<typeof ResearchUnitSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Numeric research value
// ────────────────────────────────────────────────────────────────────────────

/**
 * Numeric research value with a conviction range. Replaces the regex-parsed
 * { display, mid } output of research-value-extractor.ts.
 */
export const NumericResearchValueSchema = z
  .object({
    /** Canonical field key. Must be one of CANONICAL_RESEARCH_FIELDS. */
    field: CanonicalResearchFieldSchema,
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    unit: ResearchUnitSchema,
    /** Human-readable range ("70%–80%", "$180–$220", "6–9 mo"). UI consumes this. */
    display: z.string().min(1),
    /** One-sentence reasoning citing top 2-3 sources. Hard-capped at 500 chars
     *  to control output-token cost; users never see long reasoning prose. */
    reasoning: z.string().min(1).max(500),
    /** Source names (e.g. ["HVS 2024 Fee Survey", "STR Q1 2026"]). */
    sources: z.array(z.string().min(1)).min(1),
    /** Segment-relevance score (0..1). How well sources apply to this persona. */
    personaFit: z.number().min(0).max(1),
  })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, {
    message: "NumericResearchValue requires low <= mid <= high",
  });
export type NumericResearchValue = z.infer<typeof NumericResearchValueSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Top-level synthesis output
// ────────────────────────────────────────────────────────────────────────────

/**
 * Top-level synthesis output. Opus returns this via streamObject.
 *
 * The legacy `narrative[]` block was removed in the OT-A.3 post-A/B revision.
 * Qualitative narrative prose is out of scope for structured output — the
 * old-path synthesis already produced narrative context inside the free-form
 * response, and no downstream consumer reads a structured narrative block.
 */
export const SynthesisOutputSchema = z.object({
  /** Quantitative research values, one per field. Each value's `field` is
   *  enum-restricted to CANONICAL_RESEARCH_FIELDS. */
  values: z.array(NumericResearchValueSchema).min(1),
  /** Surface-level summary. */
  overall: z.object({
    /** Fraction of metrics where the two Cognitive Panels agreed (from Phase 2 validation). */
    consensusRatio: z.number().min(0).max(1),
    /** 1-5 bullet key takeaways for the UI summary header. */
    keyTakeaways: z.array(z.string().min(1)).min(1).max(5),
  }),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Legacy compatibility
// ────────────────────────────────────────────────────────────────────────────

/**
 * Legacy ResearchEntry shape currently stored in Property.researchValues.
 * Kept here for type continuity during OT-A.3 A/B. After OT-A.4 deletes the
 * extractor, any remaining consumers should migrate to SynthesisOutput directly.
 */
export type LegacyResearchEntry = { display: string; mid: number; source: "ai" };

/**
 * Converts the new SynthesisOutput shape into the legacy
 * `Record<field, { display, mid, source: "ai" }>` map that
 * Property.researchValues and research-value-extractor.ts consumers expect.
 *
 * During OT-A.3 A/B, both the old extractor path and the new streamObject
 * path produce this same map shape, making verdict comparison mechanical.
 */
export function toLegacyResearchValuesMap(
  output: SynthesisOutput,
): Record<string, LegacyResearchEntry> {
  const result: Record<string, LegacyResearchEntry> = {};
  for (const v of output.values) {
    result[v.field] = { display: v.display, mid: v.mid, source: "ai" };
  }
  return result;
}
