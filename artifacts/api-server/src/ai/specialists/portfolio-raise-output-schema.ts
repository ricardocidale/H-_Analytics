/**
 * PortfolioRaiseSpecialistOutputSchema — strict Zod schema for Opus's
 * structured response to the Portfolio Capital Raise Specialist prompt (v1).
 *
 * Single-shot Opus call enforces this schema via Vercel AI SDK's
 * `generateObject({ schema })`. On parse success, the runner maps each
 * dimension to a `RawVerdictDimension` and assembles an `AnalystVerdict`
 * via the existing `buildAnalystVerdict()` invariant builder.
 *
 * Strictness (intentional):
 *   - `dimensions.length === 5` (one per PORTFOLIO_RAISE_DIMENSION_KEYS)
 *   - `key` is a `z.enum(PORTFOLIO_RAISE_DIMENSION_KEYS)` — Opus cannot invent keys
 *   - per-dimension `low ≤ mid ≤ high` (refinement; rejects nonsense ranges)
 *   - `reasoning` length-bounded 20–500 chars
 *   - `evidenceRefs` indexes into the canned LP comparables array
 *   - `conviction` is one of three enums
 *
 * Quality gate: invalid outputs throw `Tier1UnavailableError` from the runner;
 * caller degrades to Tier-0 with `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 */

import { z } from "zod";
import { PORTFOLIO_RAISE_DIMENSION_KEYS } from "./portfolio-raise-prompt-input-builder";
import {
  PORTFOLIO_RAISE_REASONING_MIN_CHARS,
  PORTFOLIO_RAISE_REASONING_MAX_CHARS,
  PORTFOLIO_RAISE_NARRATIVE_MIN_CHARS,
  PORTFOLIO_RAISE_NARRATIVE_MAX_CHARS,
} from "@shared/constants-funding";

export const PortfolioRaiseDimensionOutputSchema = z
  .object({
    key: z.enum(PORTFOLIO_RAISE_DIMENSION_KEYS),
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(PORTFOLIO_RAISE_REASONING_MIN_CHARS, `reasoning too thin — must reference engine-computed inputs (>=${PORTFOLIO_RAISE_REASONING_MIN_CHARS} chars)`)
      .max(PORTFOLIO_RAISE_REASONING_MAX_CHARS, `reasoning too verbose — keep to one tight paragraph (<=${PORTFOLIO_RAISE_REASONING_MAX_CHARS} chars)`),
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });

export type PortfolioRaiseDimensionOutput = z.infer<typeof PortfolioRaiseDimensionOutputSchema>;

export const PortfolioRaiseSpecialistOutputSchema = z
  .object({
    dimensions: z.array(PortfolioRaiseDimensionOutputSchema),
    overallNarrative: z
      .string()
      .min(PORTFOLIO_RAISE_NARRATIVE_MIN_CHARS, "overall narrative must be substantive when present")
      .max(PORTFOLIO_RAISE_NARRATIVE_MAX_CHARS, "overall narrative must be tight; cards carry per-dimension detail")
      .optional(),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === PORTFOLIO_RAISE_DIMENSION_KEYS.length;
    },
    {
      message: "dimensions must cover all 5 portfolio raise keys exactly once",
      path: ["dimensions"],
    },
  );

export type PortfolioRaiseSpecialistOutput = z.infer<typeof PortfolioRaiseSpecialistOutputSchema>;
