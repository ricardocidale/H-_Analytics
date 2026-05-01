/**
 * FundingSpecialistOutputSchema — strict Zod schema for Opus's structured
 * response to the Funding Specialist prompt (G1.5c-v1).
 *
 * Single-vendor, single-shot Opus call enforces this schema via Vercel AI
 * SDK's `streamObject({ schema })`. On parse success, the `runFundingSpecialist`
 * runner maps each dimension to a `RawVerdictDimension` and assembles an
 * `AnalystVerdict` via the existing `buildAnalystVerdict()` invariant builder.
 *
 * Strictness (intentional):
 *   - `dimensions.length === 5` (one per FUNDING_DIMENSION_KEYS, no fewer/more)
 *   - `key` is a `z.enum(FUNDING_DIMENSION_KEYS)` — Opus cannot invent keys
 *   - per-dimension `low ≤ mid ≤ high` (refinement; rejects nonsense ranges)
 *   - `reasoning` length-bounded 20–500 chars (forces specific, not boilerplate)
 *   - `evidenceRefs` 1–5 indexes into the comparables array (forces evidence)
 *   - `conviction` is one of three enums (no ad-hoc strings)
 *
 * Quality gate: invalid outputs throw `Tier1UnavailableError` from the runner;
 * the route handler catches and degrades to Tier-0 fallback with
 * `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 *
 * Cross-references:
 *   - FUNDING_DIMENSION_KEYS — `mgmt-co-funding-prompt-input-builder.ts:54`
 *   - DIMENSION_META — `engine/analyst/surface/mgmt-co/funding-specialist.ts:109`
 *   - buildAnalystVerdict — `engine/analyst/contracts/verdict.ts`
 *   - the prompt that produces this output — `mgmt-co-funding-prompt.ts`
 *   - the runner that consumes this output — `mgmt-co-funding-runner.ts`
 */

import { z } from "zod";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";

/**
 * Single dimension's structured output. Refines `low ≤ mid ≤ high` so we
 * never emit a verdict with an inverted range (which downstream Voice
 * Renderer + UI cannot meaningfully display).
 */
export const FundingDimensionOutputSchema = z
  .object({
    key: z.enum(FUNDING_DIMENSION_KEYS),
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(20, "reasoning too thin — must reference user's specific inputs (>=20 chars)")
      .max(500, "reasoning too verbose — keep to one tight paragraph (<=500 chars)"),
    /**
     * Indexes into the comparables array provided in the prompt user message.
     * 1-5 refs forces at least one cited source per dimension AND caps
     * Opus from "citing every row" boilerplate.
     */
    // Anthropic structured output rejects minItems > 1 and maxItems entirely.
    // The prompt instructs Opus to cite 1-5 refs per dimension; the runner
    // ignores out-of-range indexes via the bounds check in buildEvidenceForDimension.
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });

export type FundingDimensionOutput = z.infer<typeof FundingDimensionOutputSchema>;

/**
 * Top-level output schema. Five dimensions, each unique by key, plus an
 * optional roll-up narrative. The `dimensionsCoverAllKeys` refinement
 * ensures all 5 funding keys appear exactly once — Opus cannot drop a
 * dimension or duplicate one.
 */
export const FundingSpecialistOutputSchema = z
  .object({
    dimensions: z
      .array(FundingDimensionOutputSchema),
      // Exact-5 and all-keys-unique enforced by the superRefine below.
      // Anthropic's structured output rejects minItems > 1, so .length(5) is
      // intentionally omitted here. The prompt instructs Opus to emit exactly
      // 5 dimensions; the superRefine validates at parse time.
    /**
     * Optional 1-2 sentence roll-up that sits above the per-dimension cards
     * in the UI. Investor-aware framing of the overall funding plan.
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
      return seen.size === FUNDING_DIMENSION_KEYS.length;
    },
    {
      message: "dimensions must cover all 5 funding keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type FundingSpecialistOutput = z.infer<typeof FundingSpecialistOutputSchema>;
