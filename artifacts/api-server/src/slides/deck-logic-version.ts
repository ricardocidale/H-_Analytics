/**
 * deck-logic-version.ts
 *
 * Single source of truth for "what version of the deck pipeline produced
 * this PDF". Bumped whenever any change would make a previously-cached PDF
 * stale even though the property's data hasn't changed:
 *
 *   - LLM model swap (DRAFT_MODEL in routes/property-deck-payload.ts)
 *   - Prompt-template changes that affect slot draft copy
 *   - Slide layout, theme, or copy changes in features/internal-deck/
 *   - SlidePayload schema changes in slides/types.ts
 *
 * The version is embedded into the R2 cache key. When it changes, the
 * cache-fresh check in routes/property-deck-pdf.ts sees the row's r2_key
 * no longer matches the expected key for the current version and treats
 * the entry as stale, forcing a regenerate. Old keys orphan in R2; that
 * is acceptable cost for correctness.
 *
 * Bump rule: increment the numeric suffix. Pair the bump with a one-line
 * note here so future readers can trace why.
 *
 * History:
 *   v1 — initial PDF deck (Playwright HTML→PDF, Claude Opus 4.6 vision)
 */
export const DECK_LOGIC_VERSION = "v1";
