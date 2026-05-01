/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Revenue G2 N+1 pipeline.
 *
 * Reuses `RevenueDimensionOutputSchema` per dimension — same key/low/mid/high/
 * conviction/evidenceRefs/reasoning shape Opus already emits at synthesis. No
 * `overallNarrative`; that is Opus synthesis's job. The runner's
 * `llmDimensionToRaw` helper consumes quant-panel output directly without a
 * separate adapter.
 *
 * Output scale: all 5 revenue keys carry DECIMAL FRACTIONS (e.g. 0.06 for 6%).
 * Schema validates `low ≤ mid ≤ high`; the prompt enforces fraction scale.
 */

import { z } from "zod";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";
import { RevenueDimensionOutputSchema } from "./mgmt-co-revenue-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(RevenueDimensionOutputSchema),
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
        "quant panel must cover all 5 revenue keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
