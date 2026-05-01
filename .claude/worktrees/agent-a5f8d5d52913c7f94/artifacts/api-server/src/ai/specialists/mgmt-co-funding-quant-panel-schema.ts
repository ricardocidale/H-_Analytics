/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the G6-P2 N+1 pipeline.
 *
 * Reuses `FundingDimensionOutputSchema` per dimension — same low/mid/high/
 * conviction/evidenceRefs/reasoning shape. No `overallNarrative`; that is
 * Opus synthesis's job. The runner's `llmDimensionToRaw` helper can consume
 * quant-panel output directly without a separate adapter.
 */

import { z } from "zod";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";
import { FundingDimensionOutputSchema } from "./mgmt-co-funding-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(FundingDimensionOutputSchema),
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
      message: "quant panel must cover all 5 funding keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
