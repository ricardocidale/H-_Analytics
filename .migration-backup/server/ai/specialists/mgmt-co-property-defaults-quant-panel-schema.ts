/**
 * Quant panel output schema for the Gemini Flash quantitative evaluation pass
 * in the Property-Defaults Phase 2 N+1 pipeline.
 *
 * Reuses `PropertyDefaultsDimensionOutputSchema` per dimension — same key/
 * low/mid/high/conviction/evidenceRefs/reasoning shape Opus already emits at
 * synthesis. No `overallNarrative`; that is Opus synthesis's responsibility.
 *
 * Output scale: fractions (0.65 = 65%) for all 4 dimensions. Schema validates
 * `low ≤ mid ≤ high` and `high ≤ 2` (catches accidental % emission).
 */

import { z } from "zod";
import { PROPERTY_DEFAULTS_DIMENSION_KEYS } from "./mgmt-co-property-defaults-prompt-input-builder";
import { PropertyDefaultsDimensionOutputSchema } from "./mgmt-co-property-defaults-output-schema";

export const QuantPanelOutputSchema = z
  .object({
    dimensions: z.array(PropertyDefaultsDimensionOutputSchema),
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
        "quant panel must cover all 4 property-defaults keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type QuantPanelOutput = z.infer<typeof QuantPanelOutputSchema>;
