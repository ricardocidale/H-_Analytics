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
 * Two entry types:
 *   - NumericResearchValue — quantitative (ADR, occupancy, cap rate, cost
 *     rates, etc.) with explicit low/mid/high/unit.
 *   - DescriptiveResearchValue — qualitative narrative (market positioning,
 *     seasonal patterns, risk flags).
 *
 * Field names (the string key) must match the known field keys consumed by:
 *   - Property.researchValues DB column (per-property research storage)
 *   - client/src/components/analyst/AnalystRangeIndicator.tsx (badge render)
 *
 * Known numeric fields (reference only; schema does NOT enum-restrict to
 * preserve extensibility for future Specialists):
 *
 *   adr, adrGrowth, occupancy, startOccupancy, occupancyStep, rampMonths,
 *   capRate, catering, landValue, saleCommission, incentiveFee, incomeTax,
 *   inflationRate, interestRate, ltv, platformFee,
 *   revShareFB, revShareEvents, revShareOther,
 *   costHousekeeping, costFB, costAdmin, costPropertyOps, costUtilities,
 *   costFFE, costMarketing, costIT, costOther, costPropertyTaxes,
 *   svcFeeMarketing, svcFeeTechRes, svcFeeAccounting, svcFeeRevMgmt,
 *   svcFeeGeneralMgmt, svcFeeProcurement,
 *   costSeg5yrPct, costSeg7yrPct, costSeg15yrPct,
 *   arDays, apDays, preOpeningCosts.
 *
 * See docs/operational-tooling/HANDOFF-replit-phase-OT-A.md §OT-A.3 for
 * the migration plan and A/B parity criteria.
 */

import { z } from "zod";

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

/**
 * Numeric research value with a conviction range. Replaces the regex-parsed
 * { display, mid } output of research-value-extractor.ts.
 */
export const NumericResearchValueSchema = z
  .object({
    /** Canonical field key (e.g. "adr", "capRate", "costMarketing"). */
    field: z.string().min(1),
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    unit: ResearchUnitSchema,
    /** Human-readable range ("70%–80%", "$180–$220", "6–9 mo"). UI consumes this. */
    display: z.string().min(1),
    /** One-paragraph reasoning citing which sources drove the range. */
    reasoning: z.string().min(1).max(1200),
    /** Source names (e.g. ["HVS 2024 Fee Survey", "STR Q1 2026"]). */
    sources: z.array(z.string().min(1)).min(1),
    /** Segment-relevance score (0..1). How well sources apply to this persona. */
    personaFit: z.number().min(0).max(1),
  })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, {
    message: "NumericResearchValue requires low <= mid <= high",
  });
export type NumericResearchValue = z.infer<typeof NumericResearchValueSchema>;

/**
 * Descriptive research content (market narrative, seasonal patterns, risk
 * flags). No numeric range — just narrative prose plus sources.
 */
export const DescriptiveResearchValueSchema = z.object({
  field: z.string().min(1),
  narrative: z.string().min(1).max(2000),
  sources: z.array(z.string().min(1)).min(1),
});
export type DescriptiveResearchValue = z.infer<typeof DescriptiveResearchValueSchema>;

/**
 * Top-level synthesis output. Opus returns this via streamObject. The
 * orchestrator flattens `values[]` into the legacy ResearchEntry map via
 * `toLegacyResearchValuesMap()` for DB-column compatibility during A/B.
 */
export const SynthesisOutputSchema = z.object({
  /** Quantitative research values, one per field. */
  values: z.array(NumericResearchValueSchema).min(1),
  /** Qualitative narrative blocks (optional; not every synthesis produces these). */
  narrative: z.array(DescriptiveResearchValueSchema).optional().default([]),
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
