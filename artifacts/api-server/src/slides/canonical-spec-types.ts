/**
 * Canonical spec types for the Lorenzo vision pipeline (Units 3c–3f).
 *
 * AldoResult → Lorenzo-03 enrichment → Carlo validation → Lorenzo-05 inspection
 * → LorenzoCanonicalSpec stored in slide_factory_runs.canonical_spec.
 *
 * Lorenzo-03 processes word-level Aldo primitives per slide and returns
 * LorenzoTextBlock[] per slide — grouped line-runs with visual style metadata
 * derived from the canonical PNG images.
 */

/** Overflow handling instructions for dynamic text slots. */
export interface LorenzoOverflowBehavior {
  /** e.g. "preserve_bbox_wrap_then_shrink" | "fixed_wrap" | "truncate" */
  mode: string;
  /** Negative = shrink allowed. Units: percentage of original font size. */
  maxFontSizeDeltaPct: number;
  /** Negative = shrink allowed. Units: percentage of original line height. */
  maxLineHeightDeltaPct: number;
  truncateAllowed: boolean;
}

/**
 * One semantic text block as enriched by Lorenzo-03.
 * Corresponds to a visually coherent group of words at a single style/position.
 */
export interface LorenzoTextBlock {
  /** Concatenated text of all words in this block */
  text: string;
  /** Left edge of block on 960×540 canvas (px) */
  x: number;
  /** Top edge of block on 960×540 canvas (px) */
  y: number;
  /** Width of block on 960×540 canvas (px) */
  w: number;
  /** Height of block on 960×540 canvas (px) */
  h: number;
  /** 0-based slide index (slide 1 → 0) */
  slideIndex: number;
  /** CSS font-family string, e.g. "Georgia, serif" */
  fontName: string;
  /** Font size in canvas pixels */
  fontSize: number;
  /** CSS font-weight integer (100–900) */
  fontWeight: number;
  /** Hex color string, e.g. "#257D41" */
  color: string;
  /** Semantic label, e.g. "slide_title", "bullet_point", "label" */
  semanticRole: string;
  /**
   * DraftSlotKey this block maps to (e.g. "slide1.headerSubtitle"),
   * or null for static/decorative text.
   */
  variableBinding: string | null;
  /** Overflow handling for dynamic slots; null for static blocks */
  overflowBehavior: LorenzoOverflowBehavior | null;
  /** Number of characters in text (for overflow planning) */
  characterCount: number;
}

/**
 * The enriched canonical spec stored in slide_factory_runs.canonical_spec
 * after the Lorenzo-03 → Carlo → Lorenzo-05 chain completes.
 */
export interface LorenzoCanonicalSpec {
  /** "1.0.0" — see LORENZO_SCHEMA_VERSION */
  schemaVersion: string;
  documentType: "pdf" | "pptx";
  slideCount: number;
  /** blocksBySlide[0] = slide 1, blocksBySlide[1] = slide 2, etc. */
  blocksBySlide: LorenzoTextBlock[][];
  /** Set by Lorenzo-05 after holistic inspection */
  inspectorApproved: boolean;
  /** Lorenzo-05 gap notes when inspectorApproved is false */
  inspectorNotes: string | null;
}
