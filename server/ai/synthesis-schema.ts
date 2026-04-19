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
