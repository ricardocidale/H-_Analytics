/**
 * Slide rendering constants for the L+B PPTX-style image renderer.
 *
 * Centralizes typography, spacing, opacity, and brand-color values used by
 * the hybrid background+overlay renderer (`hybrid-renderer.ts`) and the
 * slot-resolver financial defaults (`slot-resolver.ts`).
 *
 * Putting these here (rather than inline) gives the cross-file
 * magic-number ratchet a single canonical home for slide-rendering literals
 * and lets future slide variants share the same vocabulary.
 */

// ── Canvas geometry ─────────────────────────────────────────────────────────

/** Final rendered slide width in pixels (16:9 at 1920px). */
export const SLIDE_WIDTH_PX = 1920;
/** Final rendered slide height in pixels (16:9 at 1920px). */
export const SLIDE_HEIGHT_PX = 1080;
/** PPTX point-to-pixel ratio at the current target DPI (1920px / 13.33in / 72pt). */
export const PT_TO_PX = 2;

// ── Brand palette (subset used by slide overlays) ───────────────────────────

/** Deep brand green used for body text and headers. */
export const C_DARK = "#1C2B1E";
/** Cream tone used for titles on dark/sage backgrounds. */
export const C_CREAM = "#FFF9F5";
/** Brand accent green for emphasized values + borders. */
export const C_ACCENT = "#257D41";
/**
 * Pre-blended zebra row tint (≈5% dark over sage) — used in lieu of
 * `rgba(...)` so the magic-number ratchet has fewer color literals to track.
 */
export const C_ZEBRA = "#94A98D";
/** Pre-blended subtle hairline rule (≈18% dark over sage). */
export const C_RULE = "#7C9077";
/** Pre-blended green-tinted callout background (≈12% accent over sage). */
export const C_CALLOUT_BG = "#8AA388";

// ── Typography sizes (pixels at the canvas resolution) ──────────────────────

/** Default font size when an element omits its own size hint. */
export const DEFAULT_TEXT_FONT_PT = 12;
/** Font size for synthesized table header rows (Slide 6 IS table). */
export const IS_HEADER_FONT_PX = 22;
/** Font size for synthesized table body rows (Slide 6 IS table). */
export const IS_BODY_FONT_PX = 20;
/** Font size for synthesized investor-card label text (Slide 6). */
export const INVESTOR_LABEL_FONT_PX = 22;
/** Font size for synthesized investor-card value text (Slide 6). */
export const INVESTOR_VALUE_FONT_PX = 24;
/** Font size for synthesized eyebrow text (uppercase section header). */
export const INVESTOR_EYEBROW_FONT_PX = 22;
/** Font size for the disclaimer footnote inside the investor card. */
export const INVESTOR_DISCLAIMER_FONT_PX = 20;
/** Body line-height applied to the disclaimer footnote. */
export const INVESTOR_DISCLAIMER_LINE_HEIGHT = 1.5;
/** Tracking applied to the eyebrow uppercase text. */
export const INVESTOR_EYEBROW_LETTER_SPACING = "0.18em";

// ── Font weights ────────────────────────────────────────────────────────────

/** Regular font weight. */
export const FONT_WEIGHT_REGULAR = 400;
/** Semi-bold weight used for headers and key values. */
export const FONT_WEIGHT_SEMI = 600;
/** Bold weight used for emphasized values. */
export const FONT_WEIGHT_BOLD = 700;

// ── Layout & spacing ────────────────────────────────────────────────────────

/** Cell horizontal padding (in pixels) for synthesized tables. */
export const CELL_PAD_X_PX = 12;
/** Header band vertical padding for synthesized IS table. */
export const HEADER_BAND_PAD_PX = 10;
/** Investor card outer horizontal padding. */
export const CARD_PAD_X_PX = 28;
/** Investor card outer vertical padding. */
export const CARD_PAD_Y_PX = 24;
/** Row vertical padding inside investor card. */
export const ROW_PAD_Y_PX = 14;
/** Row horizontal padding inside investor card. */
export const ROW_PAD_X_PX = 16;
/** Disclaimer block padding-Y. */
export const DISCLAIMER_PAD_Y_PX = 16;
/** Disclaimer block padding-X. */
export const DISCLAIMER_PAD_X_PX = 20;
/** Margin above the disclaimer block. */
export const DISCLAIMER_MARGIN_TOP_PX = 32;
/** Margin below the eyebrow before list rows begin. */
export const EYEBROW_MARGIN_BOTTOM_PX = 16;
/** Border-left width for the disclaimer accent bar. */
export const DISCLAIMER_BORDER_PX = 3;
/** Flex weight for the wider "label" column in synthesized tables. */
export const LABEL_COL_FLEX = 1.4;
/** Default text line-height for non-disclaimer cells. */
export const DEFAULT_LINE_HEIGHT = 1.2;
/** Cell font size for generic recipe-driven tables (in points). */
export const TABLE_CELL_FONT_PT = 11;

// ── Output encoding ─────────────────────────────────────────────────────────

/** JPEG quality (0-100) used by the final composite. */
export const SLIDE_JPEG_QUALITY = 92;

// ── Slide identifiers ───────────────────────────────────────────────────────

/** Slide number that requires synthesized picture-slot tables (Picture 4 / Picture 6). */
export const SLIDE_NUM_WITH_SYNTH_PICTURES = 6;
/** Maximum number of years shown in the 5-yr Income Statement table. */
export const IS_TABLE_YEAR_COUNT = 5;

// ── Financial fallback bounds (used by slot-resolver) ───────────────────────

/** Minimum stabilized occupancy clamp when sourcing from financials. */
export const STABLE_OCC_FLOOR = 0.55;
/** Maximum stabilized occupancy clamp when sourcing from financials. */
export const STABLE_OCC_CEIL = 0.85;
/** Default exit cap rate used when the property + financials both omit one. */
export const DEFAULT_EXIT_CAP_RATE = 0.07;
