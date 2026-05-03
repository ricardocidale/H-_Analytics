/**
 * theme.ts — Shared colors, slide canvas dimensions, and font-family tokens
 * for the internal investor deck. Mirrors the satori canvas (1920×1080) and
 * the canonical L+B palette.
 */

export const SLIDE_WIDTH_PX = 1920;
export const SLIDE_HEIGHT_PX = 1080;
export const TOTAL_SLIDES = 6;
export const SLIDE_EXIT_CAP_RATE_FALLBACK = 0.07;

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

/** L+B palette — must match SLIDE_COLORS in api-server/src/slides/slide-jsx.tsx. */
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
