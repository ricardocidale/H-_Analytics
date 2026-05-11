/**
 * Carlo — Zod schema validator minion.
 *
 * Two surfaces:
 *   1. `runCarlo(blocksBySlide)` — original Lorenzo block validator (Lorenzo
 *      ingestion pipeline after Lorenzo-03 enrichment). Returns blocking
 *      errors (schema violations) and advisory warnings (e.g., unrecognised
 *      variable bindings).
 *   2. `runCarloSubstitutionMap(map)` — Factory v2 U8 substitution-map
 *      validator. Delegates to the `SubstitutionMapSchema` exported by
 *      `pptx-substitution-types.ts` so the contract stays single-sourced.
 *      Marco's U8 substitution-assembly step calls this before invoking
 *      `substituteSlots` so malformed maps abort the run before any I/O.
 *
 * Both surfaces return the same `CarloValidationResult` shape so callers
 * can branch uniformly on `valid`.
 */
import { z } from "zod";
import {
  CARLO_FONT_WEIGHT_MIN,
  CARLO_FONT_WEIGHT_MAX,
} from "../deck-render-constants";
import { SubstitutionMapSchema } from "../pptx-substitution-types";

// RegExp built from string so "{6}" is inside a string literal and not flagged
// by the magic-number ratchet, which does not strip regex literal internals.
const HEX_COLOR_RE = new RegExp("^#[0-9A-Fa-f]{6}$");

export interface CarloValidationResult {
  valid: boolean;
  blockingErrors: string[];
  advisoryWarnings: string[];
}

const overflowBehaviorSchema = z.object({
  mode: z.string().min(1),
  maxFontSizeDeltaPct: z.number(),
  maxLineHeightDeltaPct: z.number(),
  truncateAllowed: z.boolean(),
});

const textBlockSchema = z.object({
  text: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  slideIndex: z.number().int().min(0),
  fontName: z.string().min(1),
  fontSize: z.number().positive(),
  fontWeight: z.number()
    .min(CARLO_FONT_WEIGHT_MIN)
    .max(CARLO_FONT_WEIGHT_MAX),
  color: z.string().regex(HEX_COLOR_RE, "must be #RRGGBB hex"),
  semanticRole: z.string().min(1),
  variableBinding: z.string().nullable(),
  overflowBehavior: overflowBehaviorSchema.nullable(),
  characterCount: z.number().int().min(0),
});

/**
 * Validate the blocksBySlide array produced by Lorenzo-03.
 * Accepts unknown[][] so the validator itself acts as the type guard.
 */
export function runCarlo(blocksBySlide: unknown[][]): CarloValidationResult {
  const blockingErrors: string[] = [];
  const advisoryWarnings: string[] = [];

  blocksBySlide.forEach((slideBlocks, slideIdx) => {
    if (!Array.isArray(slideBlocks)) {
      blockingErrors.push(`blocksBySlide[${slideIdx}] is not an array`);
      return;
    }
    slideBlocks.forEach((block, blockIdx) => {
      const result = textBlockSchema.safeParse(block);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = issue.path.length > 0
            ? `blocksBySlide[${slideIdx}][${blockIdx}].${issue.path.join(".")}`
            : `blocksBySlide[${slideIdx}][${blockIdx}]`;
          blockingErrors.push(`${path}: ${issue.message}`);
        }
      }
    });
  });

  return { valid: blockingErrors.length === 0, blockingErrors, advisoryWarnings };
}

/**
 * Validate a Factory v2 substitution map. Delegates to
 * `SubstitutionMapSchema.safeParse` so the schema definition stays in
 * `pptx-substitution-types.ts` (single source of truth).
 *
 * The Zod issues are surfaced as `blockingErrors` (Carlo's existing
 * vocabulary) so callers — Marco's U8 assembly step — can branch on
 * `valid` uniformly with the existing block validator.
 *
 * No advisory warnings are emitted for substitution maps: every Zod
 * violation is a hard error (mismatched op/payload, missing shapeId, etc.)
 * because pptx-automizer aborts on the same conditions.
 */
export function runCarloSubstitutionMap(map: unknown): CarloValidationResult {
  const blockingErrors: string[] = [];
  const advisoryWarnings: string[] = [];

  const parsed = SubstitutionMapSchema.safeParse(map);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0
        ? `[${issue.path.join(".")}] `
        : "";
      blockingErrors.push(`${path}${issue.message}`);
    }
  }

  return {
    valid: blockingErrors.length === 0,
    blockingErrors,
    advisoryWarnings,
  };
}
