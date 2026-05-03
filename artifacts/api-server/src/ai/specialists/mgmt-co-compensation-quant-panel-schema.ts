/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Compensation G3 N+1 pipeline.
 *
 * Reuses `CompensationDimensionOutputSchema` per dimension — same key/low/
 * mid/high/conviction/evidenceRefs/reasoning shape Opus already emits at
 * synthesis. No `overallNarrative`; that is Opus synthesis's job.
 *
 * Output scale: USD for partner-comp / staff-salary dimensions, whole-number
 * counts for partner-count / Tier-3 FTE. Schema validates `low ≤ mid ≤ high`;
 * the prompt enforces the per-dimension scale.
 */

import { z } from "zod";
import { COMPENSATION_DIMENSION_KEYS } from "./mgmt-co-compensation-prompt-input-builder";
import { CompensationDimensionOutputSchema } from "./mgmt-co-compensation-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(CompensationDimensionOutputSchema),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === COMPENSATION_DIMENSION_KEYS.length;
    },
    {
      message:
        "quant panel must cover all 5 compensation keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
