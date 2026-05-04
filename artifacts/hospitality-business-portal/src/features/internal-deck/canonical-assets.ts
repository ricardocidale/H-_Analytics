/**
 * canonical-assets.ts — R2 storage keys for the L+B canonical 6-slide
 * investor deck reference assets (portal-side mirror).
 *
 * Fetch via the API: GET /api/canonical-slides/<slideNumber>/<format>
 *
 * Source: docs/slide-system/canonical/r2-manifest.json
 * Uploaded by: scripts/src/upload-canonical-slides.ts
 */

const R2_PREFIX = "canonical/lb-6-slide";

function slideKey(n: number, ext: "png" | "pdf"): string {
  return `${R2_PREFIX}/slides/slide-${n}.${ext}`;
}

export const CANONICAL_ASSETS = {
  fullPdf: `${R2_PREFIX}/lb-6-slide-canonical.pdf`,

  /** Returns the R2 key for slide N (1–6) in the requested format. */
  slide(slideNumber: number, format: "png" | "pdf"): string {
    return slideKey(slideNumber, format);
  },
} as const;
