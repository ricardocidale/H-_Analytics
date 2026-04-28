/**
 * PropertyRiskIntelligenceOutputSchema — strict Zod schema for Opus's
 * structured response to the Property Risk Intelligence prompt.
 *
 * Single-vendor, single-shot Opus call enforces this schema via Vercel AI
 * SDK's `streamObject({ schema })`. On parse success, the
 * `runPropertyRiskIntelligenceSpecialist` runner maps the dimension to a
 * `RawVerdictDimension` and assembles an `AnalystVerdict` via the existing
 * `buildAnalystVerdict()` invariant builder.
 *
 * Strictness (intentional, mirrors `mgmt-co-funding-output-schema.ts`):
 *   - `dimension.key === "propertyInflationRate"` (single dimension, no others)
 *   - `low ≤ mid ≤ high` (refinement; rejects nonsense ranges)
 *   - `reasoning` length-bounded 20–500 chars (forces specific, not boilerplate)
 *   - `sources` array carries 1–5 cited authority/market sources — each row
 *     becomes one `Evidence` entry on the verdict, satisfying
 *     `MIN_SOURCES_FOR_ADVICE`.
 *   - `conviction` is one of three enums (no ad-hoc strings)
 *
 * Quality gate: invalid outputs throw `Tier1UnavailableError` from the
 * runner; the route handler catches and degrades to Tier-0 fallback with
 * `meta.fallbackReason: "tier1_unavailable"`.
 */

import { z } from "zod";

/**
 * Single source entry the LLM cites. Mirrors the runtime `Evidence`
 * shape (`engine/analyst/contracts/verdict.ts:EvidenceSchema`) without
 * Evidence's `tier` and `personaFit` — the runner sets those itself
 * (`tier: "web"`, `personaFit: 1`) so Opus cannot game the conviction
 * floor by claiming `tier: "db_table"`.
 */
export const PropertyRiskIntelligenceSourceSchema = z.object({
  /** Authority publishing the cited number — e.g. "US Federal Reserve long-run target". */
  source: z
    .string()
    .min(3, "source name too thin — name the publishing authority")
    .max(200, "source name too verbose — keep to the authority's short name"),
  /** ISO date the source was published or last refreshed. */
  asOf: z.string().min(1),
  /** Optional URL to the source publication. */
  url: z.string().optional(),
});
export type PropertyRiskIntelligenceSource = z.infer<
  typeof PropertyRiskIntelligenceSourceSchema
>;

/**
 * Single dimension's structured output. Refines `low ≤ mid ≤ high` so we
 * never emit a verdict with an inverted range (which downstream Voice
 * Renderer + UI cannot meaningfully display).
 */
export const PropertyInflationDimensionOutputSchema = z
  .object({
    /**
     * Locked to `propertyInflationRate` so Opus cannot invent a different
     * dimension key. Single-element enum mirrors the multi-key enum used
     * in `mgmt-co-funding-output-schema.ts` at the same position.
     */
    key: z.enum(["propertyInflationRate"]),
    /**
     * Country/market inflation outlook range in decimal form (0.025 =
     * 2.5%). Matches the unit declared by `propertyInflationRate` in
     * `engine/analyst/registry/field-registry.ts`.
     */
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(
        20,
        "reasoning too thin — must reference the country outlook and the user's saved override (>=20 chars)",
      )
      .max(
        500,
        "reasoning too verbose — keep to one tight paragraph (<=500 chars)",
      ),
    /**
     * 1-5 cited sources for this dimension. Each entry becomes one
     * `Evidence` row on the verdict; the runner enforces that at least
     * one source survives so the `MIN_SOURCES_FOR_ADVICE` invariant in
     * `engine/analyst/contracts/verdict.ts` holds.
     *
     * Anthropic structured output rejects `minItems > 1` and `maxItems`
     * entirely, so the schema only declares the array. The runner
     * defends the lower bound and degrades to Tier-0 when Opus emits
     * zero sources — same pattern as the funding runner.
     */
    sources: z.array(PropertyRiskIntelligenceSourceSchema),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  });
export type PropertyInflationDimensionOutput = z.infer<
  typeof PropertyInflationDimensionOutputSchema
>;

/**
 * Top-level output schema. Single dimension plus an optional roll-up
 * narrative. Locked to one entry so Opus cannot pad the response with
 * adjacent risk dimensions (regulatory, brand, etc.) that Daniela's
 * v1 verdict surface does not currently render.
 */
export const PropertyRiskIntelligenceOutputSchema = z
  .object({
    dimension: PropertyInflationDimensionOutputSchema,
    /**
     * Optional 1-2 sentence roll-up that sits above the dimension card
     * in the UI. Investor-aware framing of the property's inflation
     * exposure. Mirrors `overallNarrative` on the funding schema.
     */
    overallNarrative: z
      .string()
      .min(50, "overall narrative must be substantive when present")
      .max(
        800,
        "overall narrative must be tight; the dimension card carries the per-band detail",
      )
      .optional(),
  });
export type PropertyRiskIntelligenceOutput = z.infer<
  typeof PropertyRiskIntelligenceOutputSchema
>;
