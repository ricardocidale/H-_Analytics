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
// These are TEMPLATE slide numbers, not code/PDF slide numbers.
// The v7 PPTX template slide order does not match the code's 1–6 ordering:
//   Code slide 1 (Sofia / Investment Spotlight) → template slide 2
//   Code slide 2 (Bianca / Hazelnis)            → template slide 4
//   Code slide 3 (Chiara / Concept)             → template slide 5
//   Code slide 4 (Dario / Pipeline Overview)    → template slide 1
//   Code slide 5 (Elisa / Transformation Plan)  → template slide 3
//   Code slide 6 (Felix / Pro Forma)            → template slide 6

const SLIDE_1_NUMBER = 2; // Sofia → template slide 2
const SLIDE_2_NUMBER = 4; // Bianca → template slide 4
const SLIDE_3_NUMBER = 5; // Chiara → template slide 5
const SLIDE_4_NUMBER = 1; // Dario → template slide 1
const SLIDE_5_NUMBER = 3; // Elisa → template slide 3
const SLIDE_6_NUMBER = 6; // Felix → template slide 6 (unchanged)

// ── Canonical-table column indices (slide-5 rows) ───────────────────────────
// Template slide 3 (code slide 5 — Transformation Plan) has Table 4 (5r × 3c).
// Slide 3 (code slide 3 — Concept) has NO table; reasons are individual text shapes.

/** Slide 5 transformation table: column 0 = feature, 1 = existing, 2 = proposed. */
const SLIDE_5_ROWS_FEATURE_COL = 0;
const SLIDE_5_ROWS_EXISTING_COL = 1;
const SLIDE_5_ROWS_PROPOSED_COL = 2;

/** Number of reason text shapes available on template slide 5 (code slide 3). */
const SLIDE_3_REASON_SHAPE_COUNT = 5;

// ── Default shape names per slot (overridable) ──────────────────────────────

/**
 * Actual shape names in the v7 PPTX template, enumerated via python-pptx
 * inspection of `canonical/lb-6-slide/templates/lb-v7-template.pptx`.
 *
 * Shape names reference the TEMPLATE slide number (see SLIDE_N_NUMBER
 * constants above for the code→template mapping).
 *
 * Slide 3 (code) / template slide 5 (Global Expansion): reasons are
 * individual text shapes, NOT a table. Each reason gets its own shape.
 *
 * Slide 6 (code) / template slide 6 (Pro Forma): no disclaimer text shape
 * exists; the slide carries only `Rectangle 1` (title) and picture shapes.
 */
export const DEFAULT_SHAPE_NAMES = {
  // Template slide 2 — Investment Spotlight (code slide 1, Sofia)
  slide1HeaderSubtitle:  "Text 1",
  slide1VisionBullet1:   "Text 18",
  slide1VisionBullet2:   "Text 19",
  slide1VisionBullet3:   "Text 20",

  // Template slide 4 — Hazelnis Spotlight (code slide 2, Bianca)
  slide2OperationalModelText: "Text 18",
  slide2RevenueBullet:        "Text 19",
  slide2ProgrammingBullet:    "Text 20",

  // Template slide 5 — Global Expansion / Concept (code slide 3, Chiara)
  // Reasons are individual text shapes; no table on this slide.
  slide3ConceptParagraph: "Text 7",
  slide3MarketRationale:  "Text 8",
  slide3Reason1:          "Text 18",
  slide3Reason2:          "Text 19",
  slide3Reason3:          "Text 20",
  slide3Reason4:          "Text 22",
  slide3Reason5:          "Text 23",
  slide3ClosingLine:      "Text 24",

  // Template slide 1 — Pipeline Overview (code slide 4, Dario)
  slide4SectionSubtitle: "Text 34",

  // Template slide 3 — Transformation Plan (code slide 5, Elisa)
  slide5TransformationDescription: "TextBox 2",
  slide5TransformationRowsTable:   "Table 4",
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
 * → single text op; vision bullets → one text op per bullet shape
 * (template slide 2 has Text 18 / Text 19 / Text 20 as separate shapes).
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
    const bulletShapeKeys = [
      "slide1VisionBullet1",
      "slide1VisionBullet2",
      "slide1VisionBullet3",
    ] as const;
    payload.visionBullets.forEach((bullet, idx) => {
      if (idx < bulletShapeKeys.length && bullet.text) {
        entries.push({
          slideNumber: SLIDE_1_NUMBER,
          shapeId: resolveShape(bulletShapeKeys[idx], overrides),
          op: "text",
          slotKey: `slide1.visionBullet${idx + 1}`,
          payload: { text: bullet.text },
        });
      }
    });
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
 * individual text ops (template slide 5 has no table; reasons occupy
 * separate Text N shapes: Text 18–20 + Text 22–23, up to 5 reasons).
 * Each reason's label and detail are combined into one string.
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
    const reasonShapeKeys = [
      "slide3Reason1",
      "slide3Reason2",
      "slide3Reason3",
      "slide3Reason4",
      "slide3Reason5",
    ] as const;
    const count = Math.min(payload.reasons.length, SLIDE_3_REASON_SHAPE_COUNT);
    for (let i = 0; i < count; i++) {
      const reason = payload.reasons[i];
      const label = reason.label?.text ?? "";
      const detail = reason.detail?.text ?? "";
      const combined = detail ? `${label}: ${detail}` : label;
      if (combined.trim()) {
        entries.push({
          slideNumber: SLIDE_3_NUMBER,
          shapeId: resolveShape(reasonShapeKeys[i], overrides),
          op: "text",
          slotKey: `slide3.reason${i + 1}`,
          payload: { text: combined },
        });
      }
    }
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
 *
 * Template slide 6 (Pro Forma) has no disclaimer text shape — only
 * `Rectangle 1` (title) and picture shapes. The disclaimer slot is not
 * substituted; Felix's payload is accepted for editorial inspection only.
 */
export function buildSlide6SubstitutionEntries(
  _payload: Slide6Payload,
  _overrides?: ShapeNameOverrides,
): SubstitutionEntry[] {
  return [];
}
