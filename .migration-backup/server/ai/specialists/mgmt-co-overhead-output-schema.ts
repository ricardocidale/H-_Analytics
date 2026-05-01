/**
 * OverheadSpecialistOutputSchema — strict Zod schema for Opus's
 * structured response to the Overhead Specialist prompt (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-compensation-output-schema.ts — same single-pass synthesis
 * pattern, same evidence-refs mechanism, same Anthropic structured-output
 * constraints.
 *
 * Dimensions covered: officeLeaseStart, professionalServicesStart,
 * techInfraStart, businessInsuranceStart, travelCostPerClient,
 * itLicensePerClient. All numeric, all USD.
 *
 * Cross-references:
 *   - OVERHEAD_DIMENSION_KEYS — mgmt-co-overhead-prompt-input-builder.ts
 *   - DIMENSION_META — engine/analyst/surface/mgmt-co/overhead-specialist.ts
 *   - buildAnalystVerdict — engine/analyst/contracts/verdict.ts
 *   - prompt — mgmt-co-overhead-prompt.ts
 *   - runner — mgmt-co-overhead-runner.ts
 */

import { z } from "zod";
import { OVERHEAD_DIMENSION_KEYS } from "./mgmt-co-overhead-prompt-input-builder";

/**
 * Single dimension's structured output. Refines `low ≤ mid ≤ high` so we
 * never emit a verdict with an inverted range.
 */
export const OverheadDimensionOutputSchema = z
  .object({
    key: z.enum(OVERHEAD_DIMENSION_KEYS),
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

export type OverheadDimensionOutput = z.infer<typeof OverheadDimensionOutputSchema>;

/**
 * Top-level output schema. Six dimensions, each unique by key, plus an
 * optional roll-up narrative.
 */
export const OverheadSpecialistOutputSchema = z
  .object({
    dimensions: z.array(OverheadDimensionOutputSchema),
    /**
     * Optional 1-2 sentence roll-up above the per-dimension cards.
     * Investor-aware framing of the overall overhead plan.
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
      return seen.size === OVERHEAD_DIMENSION_KEYS.length;
    },
    {
      message:
        "dimensions must cover all 6 overhead keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type OverheadSpecialistOutput = z.infer<typeof OverheadSpecialistOutputSchema>;
