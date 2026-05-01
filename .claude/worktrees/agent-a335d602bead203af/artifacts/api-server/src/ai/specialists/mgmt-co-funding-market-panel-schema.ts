/**
 * Market panel output schema for the Claude Sonnet qualitative evaluation pass
 * in the G6-P2 N+1 pipeline.
 *
 * Sonnet's job: LP dynamics, market sentiment, directional bias signals. No
 * numeric ranges — those are the quant panel's output. The runner injects
 * market panel context into the Opus synthesis prompt as enrichment.
 */

import { z } from "zod";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";

export const MarketPanelDimensionSchema = z.object({
  key: z.enum(FUNDING_DIMENSION_KEYS),
  /** LP market sentiment for this dimension in the operator's target vertical + locale. */
  marketSentiment: z.enum(["bullish", "neutral", "cautious"]),
  /** 0–4 specific LP risk phrases; empty when no flags are warranted. */
  lpRiskFlags: z.array(z.string().max(200)).max(4),
  /** Whether the quant panel's range likely needs adjustment given LP expectations. */
  proposedBias: z.enum(["increase", "decrease", "hold", "insufficient-data"]),
  /** 20–400 chars; references the operator's specific context. */
  reasoning: z.string().min(20).max(400),
});

export type MarketPanelDimension = z.infer<typeof MarketPanelDimensionSchema>;

export const MarketPanelOutputSchema = z
  .object({
    dimensions: z.array(MarketPanelDimensionSchema),
    /** Optional 1-2 sentence roll-up of overall LP market context for this operator. */
    overallMarketContext: z.string().min(30).max(600).optional(),
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
      message: "market panel must cover all 5 funding keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type MarketPanelOutput = z.infer<typeof MarketPanelOutputSchema>;
