/**
 * RevenueSpecialistOutputSchema — strict Zod schema for Opus's structured
 * response to the Revenue Specialist prompt (G2-v1).
 *
 * Mirrors mgmt-co-funding-output-schema.ts (G1.5c-v1) — same single-shot
 * Opus pattern, same evidence-refs mechanism, same Anthropic structured-output
 * constraints.
 *
 * Dimensions covered: marketingRate, fbRevenueShare, eventsRevenueShare,
 * otherRevenueShare, cateringBoostPct.
 *
 * Cross-references:
 *   - REVENUE_DIMENSION_KEYS — mgmt-co-revenue-prompt-input-builder.ts
 *   - DIMENSION_META — engine/analyst/surface/mgmt-co/revenue-specialist.ts
 *   - buildAnalystVerdict — engine/analyst/contracts/verdict.ts
 *   - prompt — mgmt-co-revenue-prompt.ts
 *   - runner — mgmt-co-revenue-runner.ts
 */

import { z } from "zod";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";

/**
 * Single dimension's structured output. Refines `low ≤ mid ≤ high` so we
 * never emit a verdict with an inverted range.
 */
export const RevenueDimensionOutputSchema = z
  .object({
    key: z.enum(REVENUE_DIMENSION_KEYS),
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

export type RevenueDimensionOutput = z.infer<typeof RevenueDimensionOutputSchema>;

/**
 * Top-level output schema. Five dimensions, each unique by key, plus an
 * optional roll-up narrative. The superRefine ensures all 5 revenue keys
 * appear exactly once.
 */
export const RevenueSpecialistOutputSchema = z
  .object({
    dimensions: z
      .array(RevenueDimensionOutputSchema),
      // Exact-5 and all-keys-unique enforced by the superRefine below.
      // Anthropic's structured output rejects minItems > 1, so .length(5) is
      // intentionally omitted. The prompt instructs Opus to emit exactly
      // 5 dimensions; the superRefine validates at parse time.
    /**
     * Optional 1-2 sentence roll-up above the per-dimension cards.
     * Investor-aware framing of the overall revenue ancillary mix.
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
      return seen.size === REVENUE_DIMENSION_KEYS.length;
    },
    {
      message:
        "dimensions must cover all 5 revenue keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type RevenueSpecialistOutput = z.infer<typeof RevenueSpecialistOutputSchema>;
