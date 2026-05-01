/**
 * Market panel output schema for the Claude Sonnet qualitative evaluation pass
 * in the Risk Intelligence N+1 pipeline (G3).
 *
 * Sonnet's job: property-level deviation signals for `propertyInflationRate`.
 * Unlike the Funding market panel (which covers LP sentiment across raise
 * dimensions), the Risk market panel covers the gap between the country
 * inflation outlook and the property's actual experienced inflation — driven
 * by operator-specific factors like import-heavy F&B, long-stay resident
 * mix, or tourist-economy CPI lag.
 *
 * No numeric ranges — those are the quant panel's output. Sonnet produces
 * qualitative bias signals the synthesis Opus uses to adjust the quant
 * panel's range up, down, or hold.
 *
 * Mirrors `mgmt-co-funding-market-panel-schema.ts` for the single-dimension
 * Risk pipeline.
 */

import { z } from "zod";
import { RISK_DIMENSION_KEYS } from "./property-risk-orchestrator-adapter";

export const RiskMarketDimensionSchema = z.object({
  key: z.enum(RISK_DIMENSION_KEYS),
  /**
   * How this property's experienced inflation compares to the country outlook.
   * "above-outlook" = property inflates faster (e.g. import-heavy F&B costs,
   * specialist labor scarcity); "below-outlook" = property inflates slower
   * (e.g. long-stay contracts, rent-controlled structure).
   */
  propertyDeviation: z.enum(["above-outlook", "in-line", "below-outlook"]),
  /**
   * 0–4 specific LP risk flags for inflation exposure. Examples:
   * "F&B import exposure amplifies USD/EUR FX risk in EM markets",
   * "Long-stay resident contracts reduce CPOR inflation pass-through".
   * Empty when no flags are warranted.
   */
  lpRiskFlags: z.array(z.string().max(200)).max(4),
  /**
   * Whether the quant panel's range likely needs adjustment given the
   * property's operator/structural context.
   */
  proposedBias: z.enum(["increase", "hold", "decrease", "insufficient-data"]),
  /** 20–400 chars; must reference the operator's specific vertical + locale. */
  reasoning: z.string().min(20).max(400),
});

export type RiskMarketDimension = z.infer<typeof RiskMarketDimensionSchema>;

export const RiskMarketPanelOutputSchema = z
  .object({
    dimensions: z.array(RiskMarketDimensionSchema),
    /** Optional 1-2 sentence roll-up of the property's inflation exposure context. */
    overallInflationContext: z.string().min(20).max(400).optional(),
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
      message: "risk market panel must cover all risk dimension keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type RiskMarketPanelOutput = z.infer<typeof RiskMarketPanelOutputSchema>;
