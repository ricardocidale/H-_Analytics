/**
 * Market panel output schema for the Claude Sonnet qualitative evaluation pass
 * in the Revenue G2 N+1 pipeline.
 *
 * Sonnet's job: guest-mix dynamics, concept-fit signals, ancillary capture
 * sentiment. No numeric ranges — those are the quant panel's output. The
 * runner injects market panel context into the Opus synthesis prompt as
 * enrichment (not as a numeric override).
 */

import { z } from "zod";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";

export const MarketPanelDimensionSchema = z.object({
  key: z.enum(REVENUE_DIMENSION_KEYS),
  /** Guest-mix and concept-fit sentiment for this dimension in the operator's
   *  target vertical + locale. */
  marketSentiment: z.enum(["bullish", "neutral", "cautious"]),
  /** 0–4 specific concept-fit or guest-mix risk phrases; empty when no flags
   *  are warranted. */
  conceptRiskFlags: z.array(z.string().max(200)).max(4),
  /** Whether the quant panel's range likely needs adjustment given guest-mix
   *  and concept-fit expectations. */
  proposedBias: z.enum(["increase", "decrease", "hold", "insufficient-data"]),
  /** 20–400 chars; references the operator's specific context. */
  reasoning: z.string().min(20).max(400),
});

export type MarketPanelDimension = z.infer<typeof MarketPanelDimensionSchema>;

export const MarketPanelOutputSchema = z
  .object({
    dimensions: z.array(MarketPanelDimensionSchema),
    /** Optional 1-2 sentence roll-up of overall guest-mix + concept-fit context
     *  for this operator. */
    overallMarketContext: z.string().min(30).max(600).optional(),
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
        "market panel must cover all 5 revenue keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type MarketPanelOutput = z.infer<typeof MarketPanelOutputSchema>;
