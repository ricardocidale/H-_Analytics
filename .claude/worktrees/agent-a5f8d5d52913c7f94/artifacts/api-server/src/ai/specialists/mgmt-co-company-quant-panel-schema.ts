/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Company Phase 2 N+1 pipeline.
 *
 * Reuses `CompanyDimensionOutputSchema` per dimension — same key/low/mid/
 * high/conviction/evidenceRefs/reasoning shape Opus already emits at
 * synthesis. No `overallNarrative`; that is Opus synthesis's responsibility.
 *
 * Output scale: fractions (0.08 = 8%) for all 4 dimensions. Schema validates
 * `low ≤ mid ≤ high` and `high ≤ 2` (catches accidental % emission).
 */

import { z } from "zod";
import { COMPANY_DIMENSION_KEYS } from "./mgmt-co-company-prompt-input-builder";
import { CompanyDimensionOutputSchema } from "./mgmt-co-company-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(CompanyDimensionOutputSchema),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === COMPANY_DIMENSION_KEYS.length;
    },
    {
      message:
        "quant panel must cover all 4 company keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
