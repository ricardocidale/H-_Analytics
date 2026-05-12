/**
 * builder-substitution-entries.ts — Factory v2 U8.
 *
 * Translates each per-slide Builder's `Slide{N}Payload` into the U4
 * `SubstitutionEntry[]` shape consumed by `substituteSlots`. Each per-slide
 * helper is pure: it reads the Builder's existing payload (no LLM, no DB)
 * and emits a list of `{ slideNumber, shapeId, op, payload, slotKey }`
 * entries that the substitution engine writes into the v7 template.
 *
 * Dual-output rationale (deviation from the literal plan, called out in
 * the U8 PR description): the U8 plan reads "Builders emit SubstitutionEntry[]
 * INSTEAD OF React-component payloads". Literally swapping the return type
 * would break `runSofiaInspector`, the `dispatchedPayloads` cache in
 * `marco-tools.ts`, and `runMaya`'s content judgment, all of which consume
 * the Slide{N}Payload shape. Instead, we keep the existing payload pipeline
 * intact and additively translate to substitution entries in this module.
 * Marco's U8 assembly step is the only new consumer.
 *
 * Shape names (U4 contract):
 *   - The v7 PPTX's exact shape names per slot are not yet enumerated in
 *     this worktree (the v7 template lives in R2 and is fetched at runtime).
 *   - `pptx-substitution.ts#resolveShapeName` accepts EITHER an exact shape
 *     name (e.g., "Text 14") OR a unique substring of the shape's text body
 *     (per the U1 spike's pattern).
 *   - We therefore default each slot to a placeholder built from the slot
 *     key (e.g., `slide1.headerSubtitle` → `"Slide1HeaderSubtitle"`).
 *     Callers / future units that know the exact shape name can supply
 *     overrides via the `shapeNameOverrides` argument.
 *   - The slide-6 image entry uses `SLIDE_6_PICTURE_SHAPE_NAME` from
 *     `slide-6-report-builder.ts` and is composed at Marco's assembly step,
 *     not here.
 *
 * Numeric literals (CLAUDE.md §1): no numeric literals in this file. Slide
 * numbers come from the Builder name; row indices come from the existing
 * SLIDE5_TRANSFORMATION_ROWS_COUNT loop bound; column indices are
 * documented inline as canonical-table-column indices.
 */
import type {
  Slide1Payload,
  Slide2Payload,
  Slide3Payload,
  Slide4Payload,
  Slide5Payload,
  Slide6Payload,
} from "@shared/deck-payload-v2";

import type { SubstitutionEntry } from "./pptx-substitution-types";

// ── Slide-number constants (one per Builder) ────────────────────────────────

const SLIDE_1_NUMBER = 1;
const SLIDE_2_NUMBER = 2;
const SLIDE_3_NUMBER = 3;
const SLIDE_4_NUMBER = 4;
const SLIDE_5_NUMBER = 5;
const SLIDE_6_NUMBER = 6;

// ── Canonical-table column indices (slide-3 reasons, slide-5 rows) ──────────
// These reflect the v7 template's table layout per the canonical brief.
// They live as named constants because numeric column indices in a row of
// table_cell ops would otherwise trip the magic-number ratchet.

/** Slide 3 reasons table: column 0 holds the bold label. */
const SLIDE_3_REASONS_LABEL_COL = 0;
/** Slide 3 reasons table: column 1 holds the supporting detail. */
const SLIDE_3_REASONS_DETAIL_COL = 1;

/** Slide 5 transformation table: column 0 = feature, 1 = existing, 2 = proposed. */
const SLIDE_5_ROWS_FEATURE_COL = 0;
const SLIDE_5_ROWS_EXISTING_COL = 1;
const SLIDE_5_ROWS_PROPOSED_COL = 2;

// ── Default shape names per slot (overridable) ──────────────────────────────

/**
 * Default shape-name placeholders per slot. Builders translate slot keys
 * into these names; the substitution engine's `resolveShapeName` accepts
 * either the exact shape name (when known) or a unique substring of the
 * shape's text body (the U1 spike's pattern). Callers can override any of
 * these via `shapeNameOverrides`.
 *
 * The naming convention strips the dot and lowercases the first char so
 * the value reads as a "shape id" rather than a slot key.
 */
export const DEFAULT_SHAPE_NAMES = {
  slide1HeaderSubtitle: "Slide1HeaderSubtitle",
  slide1VisionBullets: "Slide1VisionBullets",
  slide2OperationalModelText: "Slide2OperationalModelText",
  slide2RevenueBullet: "Slide2RevenueBullet",
  slide2ProgrammingBullet: "Slide2ProgrammingBullet",
  slide3ConceptParagraph: "Slide3ConceptParagraph",
  slide3MarketRationale: "Slide3MarketRationale",
  slide3ReasonsTable: "Slide3ReasonsTable",
  slide3ClosingLine: "Slide3ClosingLine",
  slide4SectionSubtitle: "Slide4SectionSubtitle",
  slide5TransformationDescription: "Slide5TransformationDescription",
  slide5TransformationRowsTable: "Slide5TransformationRowsTable",
  slide6Disclaimer: "Slide6Disclaimer",
} as const;

export type ShapeNameKey = keyof typeof DEFAULT_SHAPE_NAMES;
export type ShapeNameOverrides = Partial<Record<ShapeNameKey, string>>;

function resolveShape(
  key: ShapeNameKey,
  overrides: ShapeNameOverrides | undefined,
): string {
  return overrides?.[key] ?? DEFAULT_SHAPE_NAMES[key];
}

// ── Per-slide builders ──────────────────────────────────────────────────────

/**
 * Build Slide 1 substitution entries from Sofia's payload. Header subtitle
 * → single text op; vision bullets → single text op (the v7 template's
 * bullet block is one shape; pptx-automizer's `setText` overwrites the
 * whole text body, mirroring how the existing build-lb-payload joins
 * bullets with newlines).
 */
export function buildSlide1SubstitutionEntries(
  payload: Slide1Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.headerSubtitle?.text) {
    entries.push({
      slideNumber: SLIDE_1_NUMBER,
      shapeId: resolveShape("slide1HeaderSubtitle", overrides),
      op: "text",
      slotKey: "slide1.headerSubtitle",
      payload: { text: payload.headerSubtitle.text },
    });
  }

  if (payload.visionBullets && payload.visionBullets.length > 0) {
    // Join with newlines — the v7 template renders each line as a bullet
    // (the bullet style is baked into the shape's paragraph properties).
    const text = payload.visionBullets.map((b) => b.text).join("\n");
    if (text.length > 0) {
      entries.push({
        slideNumber: SLIDE_1_NUMBER,
        shapeId: resolveShape("slide1VisionBullets", overrides),
        op: "text",
        slotKey: "slide1.visionBullets",
        payload: { text },
      });
    }
  }

  return entries;
}

/** Build Slide 2 substitution entries from Bianca's payload. All three slots
 *  are single text fields, so each maps to one `text` op. */
export function buildSlide2SubstitutionEntries(
  payload: Slide2Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.operationalModelText?.text) {
    entries.push({
      slideNumber: SLIDE_2_NUMBER,
      shapeId: resolveShape("slide2OperationalModelText", overrides),
      op: "text",
      slotKey: "slide2.operationalModelText",
      payload: { text: payload.operationalModelText.text },
    });
  }

  if (payload.revenueBullet?.text) {
    entries.push({
      slideNumber: SLIDE_2_NUMBER,
      shapeId: resolveShape("slide2RevenueBullet", overrides),
      op: "text",
      slotKey: "slide2.revenueBullet",
      payload: { text: payload.revenueBullet.text },
    });
  }

  if (payload.programmingBullet?.text) {
    entries.push({
      slideNumber: SLIDE_2_NUMBER,
      shapeId: resolveShape("slide2ProgrammingBullet", overrides),
      op: "text",
      slotKey: "slide2.programmingBullet",
      payload: { text: payload.programmingBullet.text },
    });
  }

  return entries;
}

/**
 * Build Slide 3 substitution entries from Chiara's payload. Concept,
 * market rationale, and closing line → single text ops. Reasons →
 * per-cell `table_cell` ops addressing the canonical 2-column table
 * (column 0 label, column 1 detail) one row per reason.
 */
export function buildSlide3SubstitutionEntries(
  payload: Slide3Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.conceptParagraph?.text) {
    entries.push({
      slideNumber: SLIDE_3_NUMBER,
      shapeId: resolveShape("slide3ConceptParagraph", overrides),
      op: "text",
      slotKey: "slide3.conceptParagraph",
      payload: { text: payload.conceptParagraph.text },
    });
  }

  if (payload.marketRationale?.text) {
    entries.push({
      slideNumber: SLIDE_3_NUMBER,
      shapeId: resolveShape("slide3MarketRationale", overrides),
      op: "text",
      slotKey: "slide3.marketRationale",
      payload: { text: payload.marketRationale.text },
    });
  }

  if (payload.reasons && payload.reasons.length > 0) {
    const tableShape = resolveShape("slide3ReasonsTable", overrides);
    payload.reasons.forEach((reason, rowIndex) => {
      if (reason.label?.text) {
        entries.push({
          slideNumber: SLIDE_3_NUMBER,
          shapeId: tableShape,
          op: "table_cell",
          slotKey: `slide3.reasons.row${rowIndex}.label`,
          payload: {
            rowIndex,
            columnIndex: SLIDE_3_REASONS_LABEL_COL,
            text: reason.label.text,
          },
        });
      }
      if (reason.detail?.text) {
        entries.push({
          slideNumber: SLIDE_3_NUMBER,
          shapeId: tableShape,
          op: "table_cell",
          slotKey: `slide3.reasons.row${rowIndex}.detail`,
          payload: {
            rowIndex,
            columnIndex: SLIDE_3_REASONS_DETAIL_COL,
            text: reason.detail.text,
          },
        });
      }
    });
  }

  if (payload.closingLine?.text) {
    entries.push({
      slideNumber: SLIDE_3_NUMBER,
      shapeId: resolveShape("slide3ClosingLine", overrides),
      op: "text",
      slotKey: "slide3.closingLine",
      payload: { text: payload.closingLine.text },
    });
  }

  return entries;
}

/**
 * Build Slide 4 substitution entries from Dario's payload. Section
 * subtitle is the only LLM-authored slot — all other Slide 4 content
 * (property cards, prices, statuses) is rendered deterministically by
 * the template based on the run's portfolio assignments.
 */
export function buildSlide4SubstitutionEntries(
  payload: Slide4Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.sectionSubtitle?.text) {
    entries.push({
      slideNumber: SLIDE_4_NUMBER,
      shapeId: resolveShape("slide4SectionSubtitle", overrides),
      op: "text",
      slotKey: "slide4.sectionSubtitle",
      payload: { text: payload.sectionSubtitle.text },
    });
  }

  return entries;
}

/**
 * Build Slide 5 substitution entries from Elisa's payload. Description →
 * single text op; rows → per-cell `table_cell` ops addressing the
 * canonical 3-column table (feature | existing | proposed).
 */
export function buildSlide5SubstitutionEntries(
  payload: Slide5Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.transformationDescription?.text) {
    entries.push({
      slideNumber: SLIDE_5_NUMBER,
      shapeId: resolveShape("slide5TransformationDescription", overrides),
      op: "text",
      slotKey: "slide5.transformationDescription",
      payload: { text: payload.transformationDescription.text },
    });
  }

  if (payload.transformationRows && payload.transformationRows.length > 0) {
    const tableShape = resolveShape("slide5TransformationRowsTable", overrides);
    payload.transformationRows.forEach((row, rowIndex) => {
      if (row.feature?.text) {
        entries.push({
          slideNumber: SLIDE_5_NUMBER,
          shapeId: tableShape,
          op: "table_cell",
          slotKey: `slide5.transformationRows.row${rowIndex}.feature`,
          payload: {
            rowIndex,
            columnIndex: SLIDE_5_ROWS_FEATURE_COL,
            text: row.feature.text,
          },
        });
      }
      if (row.existing?.text) {
        entries.push({
          slideNumber: SLIDE_5_NUMBER,
          shapeId: tableShape,
          op: "table_cell",
          slotKey: `slide5.transformationRows.row${rowIndex}.existing`,
          payload: {
            rowIndex,
            columnIndex: SLIDE_5_ROWS_EXISTING_COL,
            text: row.existing.text,
          },
        });
      }
      if (row.proposed?.text) {
        entries.push({
          slideNumber: SLIDE_5_NUMBER,
          shapeId: tableShape,
          op: "table_cell",
          slotKey: `slide5.transformationRows.row${rowIndex}.proposed`,
          payload: {
            rowIndex,
            columnIndex: SLIDE_5_ROWS_PROPOSED_COL,
            text: row.proposed.text,
          },
        });
      }
    });
  }

  return entries;
}

/**
 * Build Slide 6 substitution entries from Felix's payload. The income-
 * statement image is composed separately by `buildSlide6ImageSubstitutionEntry`
 * (U6) and concatenated into the final map at Marco's assembly step.
 * Felix's only LLM-authored slot is the optional disclaimer.
 */
export function buildSlide6SubstitutionEntries(
  payload: Slide6Payload,
  overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  const entries: SubstitutionEntry[] = [];

  if (payload.disclaimer?.text) {
    entries.push({
      slideNumber: SLIDE_6_NUMBER,
      shapeId: resolveShape("slide6Disclaimer", overrides),
      op: "text",
      slotKey: "slide6.disclaimer",
      payload: { text: payload.disclaimer.text },
    });
  }

  return entries;
}
