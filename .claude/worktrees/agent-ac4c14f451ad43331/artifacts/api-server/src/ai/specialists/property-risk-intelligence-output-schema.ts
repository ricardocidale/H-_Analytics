/**
 * PropertyRiskIntelligenceOutputSchema — strict Zod schema for Opus's
 * structured response in the Risk Intelligence N+1 pipeline (G3).
 *
 * The N+1 pipeline (G3) replaces the single-shot Opus call with a
 * Prompt Engineer pre-stage → parallel quant + market panels → Opus
 * synthesis. This schema governs the synthesis (Opus) output only.
 *
 * Key changes from G1.5c single-shot schema:
 *   - `dimension` (singular) → `dimensions: [...]` array for future
 *     expansion (regulatory, brand risk dimensions)
 *   - `sources` (LLM-cited named sources) → `evidenceRefs` (integer
 *     indices into the canned comparables array), matching the Funding
 *     Specialist pattern (G6-P2)
 *
 * Strictness:
 *   - `key === "propertyInflationRate"` (single key, enforced by refine)
 *   - `low ≤ mid ≤ high` (refinement; rejects inverted ranges)
 *   - `reasoning` 20–500 chars (forces specific, not boilerplate)
 *   - `conviction` one of three enums
 *   - `evidenceRefs` integer array (runner enforces ≥1 in-bounds ref via validator)
 */

import { z } from "zod";
import { RISK_DIMENSION_KEYS } from "./property-risk-orchestrator-adapter";

/**
 * Single dimension's synthesis output. Integer `evidenceRefs` index into
 * the comparables array provided in the prompt so the runner can map each
 * ref to one Evidence entry via `comparableToEvidence()`.
 */
export const RiskDimensionOutputSchema = z
  .object({
    key: z.enum(RISK_DIMENSION_KEYS),
    /**
     * Decimal form (0.025 = 2.5%). Authority-anchored range grounded in
     * the country outlook and cross-sectoral CPI comparables.
     */
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(
        20,
        "reasoning too thin — must reference the country outlook and deviation drivers (>=20 chars)",
      )
      .max(500, "reasoning too verbose — keep to one tight paragraph (<=500 chars)"),
    /**
     * Indexes into the comparables array provided in the prompt user message.
     * Out-of-bounds refs are silently dropped by the runner; at least one
     * in-bounds ref is required (enforced by the synthesis validator).
     */
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });

export type RiskDimensionOutput = z.infer<typeof RiskDimensionOutputSchema>;

/**
 * Top-level synthesis output schema. Array of dimensions (currently one:
 * propertyInflationRate) plus optional narrative. The refine enforces
 * all expected dimension keys appear exactly once.
 */
export const PropertyRiskIntelligenceOutputSchema = z
  .object({
    dimensions: z.array(RiskDimensionOutputSchema),
    overallNarrative: z
      .string()
      .min(50, "overall narrative must be substantive when present")
      .max(800, "overall narrative must be tight; the dimension card carries the detail")
      .optional(),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === RISK_DIMENSION_KEYS.length;
    },
    {
      message: "synthesis must cover all risk dimension keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type PropertyRiskIntelligenceOutput = z.infer<typeof PropertyRiskIntelligenceOutputSchema>;
