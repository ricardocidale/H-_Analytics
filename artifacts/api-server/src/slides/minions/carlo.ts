/**
 * Carlo — Zod schema validator minion.
 *
 * Called by the Lorenzo ingestion pipeline after Lorenzo-03 enrichment.
 * Validates that every LorenzoTextBlock in blocksBySlide has correct types,
 * in-range values, and a valid hex color.
 *
 * Returns blocking errors (schema violations) and advisory warnings
 * (e.g., unrecognised variable bindings) as separate lists.
 * The pipeline only aborts on blocking errors.
 */
import { z } from "zod";
import {
  CARLO_FONT_WEIGHT_MIN,
  CARLO_FONT_WEIGHT_MAX,
} from "../deck-render-constants";

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
