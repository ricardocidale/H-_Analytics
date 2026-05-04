/**
 * canonical-assets.ts — R2 storage keys for the L+B canonical 6-slide
 * investor deck reference assets.
 *
 * These keys were written by `scripts/src/upload-canonical-slides.ts`.
 * All assets live under the `canonical/lb-6-slide/` R2 prefix.
 *
 * Usage:
 *   import { CANONICAL_ASSETS } from "./canonical-assets";
 *   const pngKey = CANONICAL_ASSETS.slide(1, "png"); // → R2 object key
 *
 * Source: docs/slide-system/canonical/r2-manifest.json
 */

const R2_PREFIX = "canonical/lb-6-slide" as const;

/**
 * Constructs the R2 key for a per-slide asset.
 * @param n Slide number (valid range: 1–6 inclusive).
 *   Callers are responsible for validating the range before calling this.
 *   Passing an out-of-range value generates an R2 key that will not resolve.
 */
function slideKey(n: number, ext: "png" | "pdf"): string {
  return `${R2_PREFIX}/slides/slide-${n}.${ext}`;
}

export const CANONICAL_ASSETS = {
  /** Full 6-slide deck PDF. */
  fullPdf: `${R2_PREFIX}/lb-6-slide-canonical.pdf`,

  /**
   * Returns the R2 key for a slide in the requested format.
   * @param slideNumber slide index (1–6)
   * @param format "png" | "pdf"
   */
  slide(slideNumber: number, format: "png" | "pdf"): string {
    return slideKey(slideNumber, format);
  },
} as const;
