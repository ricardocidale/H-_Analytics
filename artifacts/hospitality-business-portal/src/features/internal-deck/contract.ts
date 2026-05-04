/**
 * contract.ts — Single TypeScript source of truth for the L+B canonical
 * investor deck renderer.
 *
 * ALL values in this file are derived from the PDF-extracted render spec:
 *   docs/slide-system/canonical/spec_skeleton_v4.json
 *   (schema_version: 4.0.0_pdf_deterministic_render_spec)
 *
 * DO NOT invent colors, font sizes, positions, or radii here.
 * Every constant must trace back to a field in the v4 spec.
 *
 * slides.tsx imports ONLY from this file — never from theme.ts's C palette.
 *
 * Renderer contract summary:
 *   • Canvas: 960×540 px, position:relative, overflow:hidden
 *   • All interior elements: position:absolute
 *   • Layout: left/top/width/height derived via bb(x1,y1,x2,y2) from spec bboxes
 *   • Scaling for thumbnails/previews: transform:scale(N) applied OUTSIDE the canvas only
 *   • Forbidden inside slides: flex/grid, responsive units, UI libraries, new colors
 */

// ── Canvas ──────────────────────────────────────────────────────────────────

export const CANVAS = {
  width: 960,
  height: 540,
} as const;

/**
 * Convert a spec bbox [x1, y1, x2, y2] into absolute CSS layout values.
 * Coordinates are in 960×540 space exactly as they appear in spec_skeleton_v4.json.
 */
export function bb(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { position: "absolute"; left: number; top: number; width: number; height: number } {
  return { position: "absolute", left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}

// ── Palette ─────────────────────────────────────────────────────────────────
// Source: spec_skeleton_v4.json → tokens.colors
// No colors outside this object may appear in slide rendering.

export const PALETTE = {
  deep_green: "#257D41",
  forest_green: "#15331F",
  sage: "#9FBCAD",
  pale_sage: "#AFC7B9",
  off_white: "#FFF9F5",
  cream_card: "#FFFBF7",
  muted_gray_green: "#9FB0A4",
  white: "#FFFFFF",
  fine_rule: "#D8D7D2",
  caption_overlay: "rgba(21,39,28,0.70)",
} as const;

export type PaletteKey = keyof typeof PALETTE;

// ── Fonts ───────────────────────────────────────────────────────────────────
// Self-hosted WOFF families declared in fonts.css.
// Source: spec_skeleton_v4.json → tokens.fonts + fonts.css declarations.

export const FONTS = {
  /** Georgia-BoldItalic / Georgia-Italic in the PDF. Slide titles. */
  editorial: '"EB Garamond Deck", Georgia, serif',
  /** Poppins-ExtraLight / Poppins-Bold in the PDF. Body, badges, captions. */
  body: '"Poppins Deck", Arial, sans-serif',
  /** Roboto Condensed — numeric cells on Slide 6 pro forma only. */
  numeric: '"Roboto Condensed Deck", "Roboto Condensed", Arial, sans-serif',
} as const;

// Source: spec_skeleton_v4.json → tokens.font_weights
export const FW = {
  extralight: 200,
  regular: 400,
  bold: 700,
} as const;

// ── Slide backgrounds ────────────────────────────────────────────────────────
// Source: spec_skeleton_v4.json → global_backgrounds

export const SLIDE_BG: Record<number, string> = {
  1: PALETTE.off_white,
  2: PALETTE.off_white,
  3: PALETTE.off_white,
  4: PALETTE.off_white,
  5: PALETTE.sage,
  6: PALETTE.sage,
};

// ── Element types ────────────────────────────────────────────────────────────

/** Layout rectangle derived from spec bbox [x1,y1,x2,y2]. */
export interface BBoxLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Known variable binding keys that map text elements to dynamic SlidePayload
 * fields. A null binding means the element renders its sourceContent verbatim.
 */
export type VariableBinding =
  | "slide_title"
  | "slide_subtitle"
  | "category_badge"
  | "property_name_at_slide_title"
  | "asking_price"
  | "target_acquisition"
  | "property_specs_bullets"
  | "vision_bullets"
  | "photo_caption_hero"
  | "photo_caption_secondary"
  | "photo_caption_inset"
  | "property_subtitle"
  | "header_subtitle"
  | "closing_tagline"
  | "operational_model_text"
  | "revenue_bullet"
  | "programming_bullet"
  | "concept_paragraph"
  | "market_rationale"
  | "why_reasons"
  | "closing_line"
  | "transformation_title"
  | "transformation_subtitle"
  | "transformation_table"
  | "key_metrics"
  | "financing_summary"
  | "stable_year_snapshot"
  | "proforma_left_table"
  | "proforma_right_table"
  | null;

/** Text overflow behavior from spec overflow_behavior_for_new_text. */
export interface OverflowBehavior {
  mode: "preserve_bbox_wrap_then_shrink" | "clip" | "none";
  maxFontSizeDeltaPct?: number;
  maxLineHeightDeltaPct?: number;
  truncateAllowed: boolean;
}

/** A text run element derived from spec text_runs[]. */
export interface TextElement {
  id: string;
  kind: "text";
  slideNumber: number;
  zIndex: number;
  layout: BBoxLayout;
  sourceContent: string;
  variableBinding: VariableBinding;
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: "normal" | "italic";
    color: string;
    opacity: number;
    lineHeight: number;
    whiteSpace: "pre" | "pre-wrap" | "normal";
    textAlign: "left" | "right" | "center";
    letterSpacing?: number;
    textTransform?: "uppercase" | "none";
  };
  overflowBehavior: OverflowBehavior;
}

/** A vector path element derived from spec vector_paths[]. */
export interface VectorElement {
  id: string;
  kind: "vector";
  slideNumber: number;
  zIndex: number;
  layout: BBoxLayout;
  pathType: "fill" | "stroke" | "fill_stroke";
  fillHex: string | null;
  fillOpacity: number;
  strokeHex: string | null;
  strokeWidth: number | null;
  strokeOpacity: number | null;
  lineCap: "butt" | "round" | "square" | null;
  lineJoin: "miter" | "round" | "bevel" | null;
  dashes: number[] | null;
}

/** An image slot derived from spec images[]. */
export interface ImageElement {
  id: string;
  kind: "image";
  slideNumber: number;
  zIndex: number;
  layout: BBoxLayout;
  /** Semantic role describes what content goes here. */
  semanticRole: string;
  /** border-radius in px derived from clip_path analysis. 0 if not specified. */
  borderRadiusPx: number;
  objectFit: "cover" | "fill";
}

export type SlideElement = TextElement | VectorElement | ImageElement;

/** Full spec for one slide. */
export interface SlideSpec {
  slideNumber: number;
  backgroundKey: "off_white_grid" | "sage_solid";
  backgroundColor: string;
  elements: {
    texts: TextElement[];
    vectors: VectorElement[];
    images: ImageElement[];
  };
}

// ── Default overflow behavior ────────────────────────────────────────────────
// Applies to all text elements per spec unless overridden.

export const DEFAULT_OVERFLOW: OverflowBehavior = {
  mode: "preserve_bbox_wrap_then_shrink",
  maxFontSizeDeltaPct: -18,
  maxLineHeightDeltaPct: -12,
  truncateAllowed: false,
};

// ── Slide specs ──────────────────────────────────────────────────────────────
// These are populated slide-by-slide as the renderer is rewritten.
// Each slide's texts/vectors/images are derived directly from spec_skeleton_v4.json.
// Population order per architect plan: Slides 5→6→1→2→3→4

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S5).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:5
 */
export const SLIDE5_SPEC: SlideSpec = {
  slideNumber: 5,
  backgroundKey: "sage_solid",
  backgroundColor: PALETTE.sage,
  elements: { texts: [], vectors: [], images: [] },
};

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S6).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:6
 */
export const SLIDE6_SPEC: SlideSpec = {
  slideNumber: 6,
  backgroundKey: "sage_solid",
  backgroundColor: PALETTE.sage,
  elements: { texts: [], vectors: [], images: [] },
};

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S1).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:1
 */
export const SLIDE1_SPEC: SlideSpec = {
  slideNumber: 1,
  backgroundKey: "off_white_grid",
  backgroundColor: PALETTE.off_white,
  elements: { texts: [], vectors: [], images: [] },
};

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S2).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:2
 */
export const SLIDE2_SPEC: SlideSpec = {
  slideNumber: 2,
  backgroundKey: "off_white_grid",
  backgroundColor: PALETTE.off_white,
  elements: { texts: [], vectors: [], images: [] },
};

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S3).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:3
 */
export const SLIDE3_SPEC: SlideSpec = {
  slideNumber: 3,
  backgroundKey: "off_white_grid",
  backgroundColor: PALETTE.off_white,
  elements: { texts: [], vectors: [], images: [] },
};

/**
 * Placeholder — will be populated during renderer rewrite (T_RENDER_S4).
 * See docs/slide-system/canonical/spec_skeleton_v4.json slide_number:4
 * Note: 94 vector paths — highest complexity. Rewrite last.
 */
export const SLIDE4_SPEC: SlideSpec = {
  slideNumber: 4,
  backgroundKey: "off_white_grid",
  backgroundColor: PALETTE.off_white,
  elements: { texts: [], vectors: [], images: [] },
};

export const ALL_SLIDE_SPECS: Record<number, SlideSpec> = {
  1: SLIDE1_SPEC,
  2: SLIDE2_SPEC,
  3: SLIDE3_SPEC,
  4: SLIDE4_SPEC,
  5: SLIDE5_SPEC,
  6: SLIDE6_SPEC,
};
