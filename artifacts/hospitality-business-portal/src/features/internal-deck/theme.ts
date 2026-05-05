/**
 * @deprecated theme.ts — LEGACY. Use contract.ts instead.
 *
 * This file pre-dates the v4 PDF-deterministic render spec and contains
 * values that DO NOT match the canonical L+B investor deck:
 *
 *   WRONG canvas:    1920×1080 px  →  correct is 960×540 (CANVAS in contract.ts)
 *   WRONG palette:   C.darkBg, C.mint, C.dimWhite, etc. are not in the PDF spec
 *   WRONG sage hex:  #9FBCA4 vs canonical #9FBCAD (PALETTE.sage in contract.ts)
 *
 * Canonical source of truth:
 *   • artifacts/hospitality-business-portal/src/features/internal-deck/contract.ts
 *   • docs/slide-system/canonical/spec_skeleton_v4.json
 *   • R2: canonical/lb-6-slide/lb-6-slide-canonical.pdf
 *     (file: L+B_Property_6-Slide_Cannonical_1777859377769.pdf)
 *
 * Removal plan: this file will be deleted once slides.tsx is fully rewritten
 * at 960×540 (T_RENDER_REWRITE). Until then, slides.tsx imports W, H, C,
 * FONT_*, and SLIDE_BACKGROUNDS from here because those values are tightly
 * coupled to 1920×1080 layout coordinates throughout slides.tsx. Changing
 * them here before rewriting the layout would corrupt all six slide renders.
 *
 * InternalDeck.tsx and PropertySlides.tsx also import SLIDE_WIDTH_PX and
 * SLIDE_HEIGHT_PX from here for PDF page sizing — also deferred to T_RENDER_REWRITE.
 * InternalDeck.tsx has already migrated TOTAL_SLIDES to contract.ts.
 *
 * DO NOT add new constants here. DO NOT import this in new files.
 */

export const SLIDE_WIDTH_PX = 1920;
export const SLIDE_HEIGHT_PX = 1080;
export const TOTAL_SLIDES = 6;

const CREAM_CANVAS = "#FFF9F5";
const SAGE_CANVAS = "#9FBCA4";

export const SLIDE_BACKGROUNDS: Record<number, string> = {
  1: CREAM_CANVAS,
  2: CREAM_CANVAS,
  3: CREAM_CANVAS,
  4: CREAM_CANVAS,
  5: SAGE_CANVAS,
  6: SAGE_CANVAS,
};

/** L+B palette — canonical for the investor deck. */
export const C = {
  darkBg: "#1C2B1E",
  accent: "#257D41",
  sage: "#9FBCA4",
  cream: "#FFF9F5",
  mint: "#C8E8D0",
  white: "#FFFFFF",
  dimWhite: "rgba(255,249,245,0.85)",
  faintWhite: "rgba(255,249,245,0.55)",
  canvasRule: "rgba(28,43,30,0.15)",
  canvasZebra: "rgba(28,43,30,0.04)",
  canvasHeader: "rgba(37,125,65,0.2)",
} as const;

/**
 * Self-hosted font family names declared in fonts.css. Use these instead of
 * generic "Garamond" / "Poppins" so we always hit the bundled WOFF files,
 * never a system-installed family that may differ between dev and prod.
 */
export const FONT_SERIF = '"EB Garamond Deck", Garamond, serif';
export const FONT_SANS = '"Poppins Deck", "Helvetica Neue", Arial, sans-serif';
/**
 * Numeric font for financial-reporting slides (Slide 6 only). Roboto
 * Condensed packs more digits per inch than Poppins, which lets the 5-year
 * pro forma fit comfortably without truncation or shrinking. `tnum`
 * activates tabular figures so columns of numbers align vertically.
 */
export const FONT_NUMERIC = '"Roboto Condensed Deck", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
