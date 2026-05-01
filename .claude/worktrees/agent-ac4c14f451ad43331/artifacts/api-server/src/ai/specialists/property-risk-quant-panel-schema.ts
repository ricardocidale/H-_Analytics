/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Risk Intelligence N+1 pipeline (G3).
 *
 * Gemini Flash's job: authority-anchored numeric range derivation for
 * `propertyInflationRate`. Inputs: the operator's country inflation outlook,
 * the three canned cross-sectoral CPI comparables, and the PE quantAddendum.
 * Output: low/mid/high range, conviction, reasoning, and evidenceRefs (indices
 * into the comparables array).
 *
 * No `overallNarrative` — that is Opus synthesis's job.
 *
 * Mirrors `mgmt-co-funding-quant-panel-schema.ts` for the single-dimension
 * Risk pipeline.
 */

import { z } from "zod";
import { RISK_DIMENSION_KEYS } from "./property-risk-orchestrator-adapter";

/**
 * Single dimension's quant output. Identical shape to
 * `FundingDimensionOutputSchema` so the runner's dimension-mapping helper
 * can consume both without a separate adapter.
 */
const RiskQuantDimensionSchema = z
  .object({
    key: z.enum(RISK_DIMENSION_KEYS),
    /** Decimal form (0.025 = 2.5%). Authority-anchored low end of market range. */
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(20, "reasoning too thin — must cite authority source and comparable range (>=20 chars)")
      .max(500, "reasoning too verbose — keep to one tight paragraph (<=500 chars)"),
    /**
     * Integer indices into the comparables array provided in the prompt.
     * Must include ≥1 in-bounds ref per the synthesis validator; out-of-bounds
     * refs are silently dropped by the runner's evidence-builder.
     */
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });

export type RiskQuantDimension = z.infer<typeof RiskQuantDimensionSchema>;

/**
 * Top-level quant panel output. Single dimension enforced by the refine.
 * The `dimensions` array shape (vs singular `dimension`) matches the
 * synthesis schema and allows future Risk dimensions (regulatory, brand)
 * without a schema migration.
 */
export const RiskQuantPanelOutputSchema = z
  .object({
    dimensions: z.array(RiskQuantDimensionSchema),
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
      message: "risk quant panel must cover all risk dimension keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type RiskQuantPanelOutput = z.infer<typeof RiskQuantPanelOutputSchema>;
