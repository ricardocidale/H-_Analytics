/**
 * Market panel output schema for the Claude Sonnet qualitative evaluation pass
 * in the Property-Defaults Phase 2 N+1 pipeline.
 *
 * Sonnet's job: LP-perception dynamics for property underwriting defaults —
 * event cost defensibility, ancillary profitability, utilities variability
 * consistency, and distribution cost risk. No numeric ranges — those are the
 * quant panel's output. The runner injects market panel context into the Opus
 * synthesis prompt as enrichment (not as a numeric override).
 */

import { z } from "zod";
import { PROPERTY_DEFAULTS_DIMENSION_KEYS } from "./mgmt-co-property-defaults-prompt-input-builder";

export const MarketPanelDimensionSchema = z.object({
  key: z.enum(PROPERTY_DEFAULTS_DIMENSION_KEYS),
  /** LP-perception sentiment for this expense/rate dimension in the operator's
   *  vertical + locale. */
  marketSentiment: z.enum(["bullish", "neutral", "cautious"]),
  /** 0–4 specific LP scrutiny phrases for this dimension; empty when no
   *  flags are warranted. Each flag ≤200 chars. */
  lpRiskFlags: z.array(z.string().max(200)).max(4),
  /** Whether the quant panel's range likely needs adjustment given LP
   *  expectations and operator stage. */
  proposedBias: z.enum(["increase", "decrease", "hold", "insufficient-data"]),
  /** 20–400 chars; references the operator's specific context. */
  reasoning: z.string().min(20).max(400),
});

export type MarketPanelDimension = z.infer<typeof MarketPanelDimensionSchema>;

export const MarketPanelOutputSchema = z
  .object({
    dimensions: z.array(MarketPanelDimensionSchema),
    /** Optional 1-2 sentence roll-up of overall LP-perception context for the
     *  property underwriting defaults. */
    overallMarketContext: z.string().min(30).max(600).optional(),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === PROPERTY_DEFAULTS_DIMENSION_KEYS.length;
    },
    {
      message:
        "market panel must cover all 4 property-defaults keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type MarketPanelOutput = z.infer<typeof MarketPanelOutputSchema>;
