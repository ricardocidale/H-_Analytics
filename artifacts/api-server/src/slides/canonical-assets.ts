/**
 * canonical-assets.ts — R2 storage keys for the L+B canonical 6-slide
 * investor deck reference assets.
 *
 * These keys were written by `scripts/src/upload-canonical-slides.ts`.
 * All assets live under the `canonical/lb-6-slide/` R2 prefix.
 *
 * Usage:
 *   import { CANONICAL_SLIDES } from "./canonical-assets";
 *   const pngKey = CANONICAL_SLIDES.slide(1, "png"); // → R2 object key
 *
 * To serve any of these via the API, construct a URL using the storage
 * provider:
 *   const { buffer, contentType } = await storage.downloadBuffer(key);
 *
 * Source: docs/slide-system/canonical/r2-manifest.json
 */

const R2_PREFIX = "canonical/lb-6-slide" as const;

export const CANONICAL_ASSETS = {
  /** Full 6-slide deck PDF. */
  fullPdf: `${R2_PREFIX}/lb-6-slide-canonical.pdf`,

  /** Per-slide PNG raster (300 dpi, suitable as visual reference / photo). */
  slidePng: {
    1: `${R2_PREFIX}/slides/slide-1.png`,
    2: `${R2_PREFIX}/slides/slide-2.png`,
    3: `${R2_PREFIX}/slides/slide-3.png`,
    4: `${R2_PREFIX}/slides/slide-4.png`,
    5: `${R2_PREFIX}/slides/slide-5.png`,
    6: `${R2_PREFIX}/slides/slide-6.png`,
  } as Record<1 | 2 | 3 | 4 | 5 | 6, string>,

  /** Per-slide individual PDF (one page each). */
  slidePdf: {
    1: `${R2_PREFIX}/slides/slide-1.pdf`,
    2: `${R2_PREFIX}/slides/slide-2.pdf`,
    3: `${R2_PREFIX}/slides/slide-3.pdf`,
    4: `${R2_PREFIX}/slides/slide-4.pdf`,
    5: `${R2_PREFIX}/slides/slide-5.pdf`,
    6: `${R2_PREFIX}/slides/slide-6.pdf`,
  } as Record<1 | 2 | 3 | 4 | 5 | 6, string>,

  /**
   * Convenience getter: returns the R2 key for a slide in the requested format.
   * @param slideNumber 1–6
   * @param format "png" | "pdf"
   */
  slide(slideNumber: 1 | 2 | 3 | 4 | 5 | 6, format: "png" | "pdf"): string {
    return format === "png"
      ? CANONICAL_ASSETS.slidePng[slideNumber]
      : CANONICAL_ASSETS.slidePdf[slideNumber];
  },
} as const;

export type CanonicalSlideNumber = 1 | 2 | 3 | 4 | 5 | 6;
