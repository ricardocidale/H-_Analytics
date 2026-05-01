/**
 * CompensationSpecialistOutputSchema — strict Zod schema for Opus's
 * structured response to the Compensation Specialist prompt (G3-v1).
 *
 * Mirrors mgmt-co-revenue-output-schema.ts — same single-pass synthesis
 * pattern, same evidence-refs mechanism, same Anthropic structured-output
 * constraints.
 *
 * Dimensions covered: partnerCompYear1, partnerCompYear10, partnerCountYear1,
 * staffSalary, staffTier3Fte. All numeric, but units differ — partner-comp
 * + staff-salary are USD, headcount + FTE are unitless counts.
 *
 * Cross-references:
 *   - COMPENSATION_DIMENSION_KEYS — mgmt-co-compensation-prompt-input-builder.ts
 *   - DIMENSION_META — engine/analyst/surface/mgmt-co/compensation-specialist.ts
 *   - buildAnalystVerdict — engine/analyst/contracts/verdict.ts
 *   - prompt — mgmt-co-compensation-prompt.ts
 *   - runner — mgmt-co-compensation-runner.ts
 */

import { z } from "zod";
import { COMPENSATION_DIMENSION_KEYS } from "./mgmt-co-compensation-prompt-input-builder";

/**
 * Single dimension's structured output. Refines `low ≤ mid ≤ high` so we
 * never emit a verdict with an inverted range.
 */
export const CompensationDimensionOutputSchema = z
  .object({
    key: z.enum(COMPENSATION_DIMENSION_KEYS),
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(20, "reasoning too thin — must reference user's specific inputs (>=20 chars)")
      .max(500, "reasoning too verbose — keep to one tight paragraph (<=500 chars)"),
    // Anthropic structured output rejects minItems > 1 and maxItems entirely.
    // The prompt instructs Opus to cite 1-5 refs per dimension; the runner
    // ignores out-of-range indexes via bounds check in buildEvidenceForDimension.
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });

export type CompensationDimensionOutput = z.infer<typeof CompensationDimensionOutputSchema>;

/**
 * Top-level output schema. Five dimensions, each unique by key, plus an
 * optional roll-up narrative.
 */
export const CompensationSpecialistOutputSchema = z
  .object({
    dimensions: z.array(CompensationDimensionOutputSchema),
    /**
     * Optional 1-2 sentence roll-up above the per-dimension cards.
     * Investor-aware framing of the overall compensation plan.
     */
    overallNarrative: z
      .string()
      .min(50, "overall narrative must be substantive when present")
      .max(800, "overall narrative must be tight; cards carry the per-dimension detail")
      .optional(),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === COMPENSATION_DIMENSION_KEYS.length;
    },
    {
      message:
        "dimensions must cover all 5 compensation keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type CompensationSpecialistOutput = z.infer<typeof CompensationSpecialistOutputSchema>;
