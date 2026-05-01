/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Overhead Phase 2 N+1 pipeline.
 *
 * Reuses `OverheadDimensionOutputSchema` per dimension — same key/low/
 * mid/high/conviction/evidenceRefs/reasoning shape Opus already emits at
 * synthesis. No `overallNarrative`; that is Opus synthesis's job.
 *
 * Output scale: USD for all 6 dimensions. Schema validates `low ≤ mid ≤ high`;
 * the prompt enforces the per-dimension scale.
 */

import { z } from "zod";
import { OVERHEAD_DIMENSION_KEYS } from "./mgmt-co-overhead-prompt-input-builder";
import { OverheadDimensionOutputSchema } from "./mgmt-co-overhead-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(OverheadDimensionOutputSchema),
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
        "quant panel must cover all 6 overhead keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
