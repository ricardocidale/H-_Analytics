/**
 * canonical-assets.ts — R2 storage keys for the L+B canonical 6-slide
 * investor deck reference assets (portal-side mirror).
 *
 * The portal fetches these through the API. Use the keys to construct
 * fetch URLs: GET /api/canonical-slides/<key>  (served by the api-server
 * canonical-slides route).
 *
 * Source: docs/slide-system/canonical/r2-manifest.json
 * Uploaded by: scripts/src/upload-canonical-slides.ts
 */

const R2_PREFIX = "canonical/lb-6-slide";

export const CANONICAL_ASSETS = {
  fullPdf: `${R2_PREFIX}/lb-6-slide-canonical.pdf`,

  slidePng: {
    1: `${R2_PREFIX}/slides/slide-1.png`,
    2: `${R2_PREFIX}/slides/slide-2.png`,
    3: `${R2_PREFIX}/slides/slide-3.png`,
    4: `${R2_PREFIX}/slides/slide-4.png`,
    5: `${R2_PREFIX}/slides/slide-5.png`,
    6: `${R2_PREFIX}/slides/slide-6.png`,
  } as Record<1 | 2 | 3 | 4 | 5 | 6, string>,

  slidePdf: {
    1: `${R2_PREFIX}/slides/slide-1.pdf`,
    2: `${R2_PREFIX}/slides/slide-2.pdf`,
    3: `${R2_PREFIX}/slides/slide-3.pdf`,
    4: `${R2_PREFIX}/slides/slide-4.pdf`,
    5: `${R2_PREFIX}/slides/slide-5.pdf`,
    6: `${R2_PREFIX}/slides/slide-6.pdf`,
  } as Record<1 | 2 | 3 | 4 | 5 | 6, string>,

  slide(slideNumber: 1 | 2 | 3 | 4 | 5 | 6, format: "png" | "pdf"): string {
    return format === "png"
      ? CANONICAL_ASSETS.slidePng[slideNumber]
      : CANONICAL_ASSETS.slidePdf[slideNumber];
  },
} as const;

export type CanonicalSlideNumber = 1 | 2 | 3 | 4 | 5 | 6;
