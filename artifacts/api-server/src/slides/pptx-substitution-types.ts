/**
 * pptx-substitution-types.ts — Factory v2 U4
 *
 * Zod schema + TypeScript types for the per-slot substitution map consumed by
 * `pptx-substitution.ts`. The map is the contract between Marco's per-slide
 * Builders (which emit slot-level intentions) and the substitution engine
 * (which writes them into a copy of the v7 canonical PPTX template).
 *
 * Carlo (the deterministic Zod-validator minion, see
 * `artifacts/api-server/src/slides/minions/carlo.ts`) parses the map with
 * `SubstitutionMapSchema` before any I/O happens — invalid maps abort the run
 * without ever touching pptx-automizer.
 *
 * Shape (per the plan, U4):
 *   { slideNumber: number; shapeId: string; op: 'text' | 'image' | 'table_cell'; payload: ... }
 *
 * `shapeId` is the human-readable shape name that pptx-automizer exposes via
 * `slideInfo.elements[].name` (e.g., "Text 3", "Picture 35"). The plan uses
 * "shape identifier" loosely; in `pptx-automizer` the addressable handle is
 * the shape `name`, so that's what we ship as `shapeId`.
 *
 * Numeric literals in this file are limited to:
 *   - structural minima (`min(1)` for "non-empty") which CLAUDE.md §1 classifies
 *     as structural clamps,
 *   - the named-constant overflow thresholds re-exported from
 *     `pptx-substitution.ts` (5% tighten / 20% abort) which the type
 *     definitions reference only by name, and
 *   - the named table-index bounds `MAX_TABLE_ROW_INDEX` /
 *     `MAX_TABLE_COLUMN_INDEX` defined below as pragmatic guards against
 *     adversarial or malformed substitution maps triggering oversized
 *     nested-array allocations in the per-cell `setTableData` path.
 */
import { z } from "zod";

// ── Image codec enum ────────────────────────────────────────────────────────

/**
 * MIME types the substitution engine accepts on image payloads.
 *
 * The engine's image path only branches JPEG vs non-JPEG (see
 * `applyImageSubstitution` in `pptx-substitution.ts`). Restricting the enum to
 * the codecs we actively support means Carlo rejects unsupported MIME strings
 * at parse time instead of routing them to the JPEG-vs-other fallback. Grow
 * the enum when a real caller needs a new codec, not speculatively.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
] as const;
export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

// ── Table-index bounds (R2 — pragmatic allocation guard) ────────────────────

/**
 * Pragmatic maximum for `TableCellPayloadSchema.rowIndex`. Generous enough
 * that no realistic slide-3 / slide-5 table approaches it; tight enough that
 * an adversarial substitution map cannot drive
 * `applyTableCellSubstitution`'s nested-array allocation into pathological
 * sizes.
 */
export const MAX_TABLE_ROW_INDEX = 200;

/**
 * Pragmatic maximum for `TableCellPayloadSchema.columnIndex`. See
 * `MAX_TABLE_ROW_INDEX` for the rationale.
 */
export const MAX_TABLE_COLUMN_INDEX = 50;

// ── Per-op payload schemas ──────────────────────────────────────────────────

/**
 * Text payload — replaces the full text content of the addressed shape.
 *
 * Lucca emits final slot text; Marco/Builders pass it through unchanged.
 * pptx-automizer's `modify.setText` overwrites the entire text body of the
 * shape — there is no intra-shape find/replace path (the U1 decision doc
 * documents why `replaceText` was rejected). This payload mirrors that.
 *
 * `originalText` is optional but recommended — when present, the substitution
 * engine compares its length against `text.length` to enforce the R7 overflow
 * guardrails (5% tighten / 20% abort). When absent, the engine falls back to
 * reading the original text from the template at substitute time.
 */
export const TextPayloadSchema = z.object({
  text: z.string().min(1, "text payload must be a non-empty string"),
  originalText: z.string().optional(),
});
export type TextPayload = z.infer<typeof TextPayloadSchema>;

/**
 * Image payload — replaces the image binary in the addressed picture shape.
 *
 * `image` is the raw image bytes (PNG/JPEG); `mimeType` advertises the codec
 * so the engine can attach the correct relation type and content-type metadata.
 *
 * `fitMode` controls aspect-ratio handling when the new image's intrinsic
 * dimensions differ from the slot's bbox: `letterbox` preserves the new
 * image's aspect ratio (with margin); `crop` fills the slot and trims the new
 * image. Defaults to `letterbox` (safer for hero photos where cropping
 * faces or buildings is the worse failure mode).
 */
export const ImagePayloadSchema = z.object({
  image: z.instanceof(Buffer, { message: "image payload must be a Buffer" }),
  mimeType: z.enum(SUPPORTED_IMAGE_MIME_TYPES, {
    message: `image payload mimeType must be one of: ${SUPPORTED_IMAGE_MIME_TYPES.join(", ")}`,
  }),
  fitMode: z.enum(["letterbox", "crop"]).default("letterbox"),
});
export type ImagePayload = z.infer<typeof ImagePayloadSchema>;

/**
 * Table-cell payload — replaces the text in a single cell of a PPTX table.
 *
 * `rowIndex` / `columnIndex` are zero-based offsets into the table on the
 * addressed shape. Used for the slide-3 reasons table and slide-5
 * transformation rows. pptx-automizer exposes a `modify.setTableData` surface
 * but we keep the per-cell op so Builders can address individual cells
 * without rebuilding the full row.
 */
export const TableCellPayloadSchema = z.object({
  rowIndex: z
    .number()
    .int()
    .min(0)
    .max(
      MAX_TABLE_ROW_INDEX,
      `rowIndex exceeds MAX_TABLE_ROW_INDEX (${MAX_TABLE_ROW_INDEX})`,
    ),
  columnIndex: z
    .number()
    .int()
    .min(0)
    .max(
      MAX_TABLE_COLUMN_INDEX,
      `columnIndex exceeds MAX_TABLE_COLUMN_INDEX (${MAX_TABLE_COLUMN_INDEX})`,
    ),
  text: z.string().min(1, "table_cell text must be a non-empty string"),
  originalText: z.string().optional(),
});
export type TableCellPayload = z.infer<typeof TableCellPayloadSchema>;

// ── Top-level entry schema (discriminated union by `op`) ────────────────────

/**
 * A single substitution map entry, addressed by (slideNumber, shapeId, op).
 *
 * The op + payload fields are a discriminated union: each `op` literal
 * unlocks exactly one payload shape. Carlo's parse step rejects mismatches
 * (e.g., an `op: 'image'` entry carrying a `text` payload).
 *
 * `slotKey` is an optional human-readable label propagated into overflow
 * errors so admins see "slide3.conceptParagraph" rather than just
 * "slide 3 / Text 14".
 */
const baseEntry = {
  slideNumber: z.number().int().min(1, "slideNumber is 1-based"),
  shapeId: z.string().min(1, "shapeId is required"),
  slotKey: z.string().optional(),
};

export const SubstitutionEntrySchema = z.discriminatedUnion("op", [
  z.object({
    ...baseEntry,
    op: z.literal("text"),
    payload: TextPayloadSchema,
  }),
  z.object({
    ...baseEntry,
    op: z.literal("image"),
    payload: ImagePayloadSchema,
  }),
  z.object({
    ...baseEntry,
    op: z.literal("table_cell"),
    payload: TableCellPayloadSchema,
  }),
]);
export type SubstitutionEntry = z.infer<typeof SubstitutionEntrySchema>;

/**
 * The full substitution map — an ordered array of entries. Order matters for
 * overlapping table-cell writes; otherwise the engine groups by slide.
 */
export const SubstitutionMapSchema = z.array(SubstitutionEntrySchema);
export type SubstitutionMap = z.infer<typeof SubstitutionMapSchema>;

// ── Overflow warning + error shapes (R7 aesthetic guardrails) ──────────────

/**
 * Soft overflow — text is in the (>5%, ≤20%) band over the original char
 * budget. The engine still applies the substitution but emits this warning
 * so upstream (Maya/Dino/the run record) can surface the tightening event.
 *
 * Font-tightening or actual run-property mutation is out of scope for U4;
 * the warning is the contract. See the inline comment in
 * `pptx-substitution.ts`'s `enforceOverflowRules` for the rationale.
 */
export interface SlotOverflowWarning {
  slideNumber: number;
  shapeId: string;
  slotKey?: string;
  originalLength: number;
  newLength: number;
  overshootPct: number;
}

/**
 * Hard overflow — text exceeds the original char budget by >20%. The engine
 * throws a `SlotOverflowError` to abort the substitution before any partial
 * state lands in the template.
 */
export class SlotOverflowError extends Error {
  readonly code = "SLOT_OVERFLOW" as const;
  readonly slideNumber: number;
  readonly shapeId: string;
  readonly slotKey?: string;
  readonly originalLength: number;
  readonly newLength: number;
  readonly overshootPct: number;

  constructor(detail: {
    slideNumber: number;
    shapeId: string;
    slotKey?: string;
    originalLength: number;
    newLength: number;
    overshootPct: number;
  }) {
    super(
      `SLOT_OVERFLOW: slide ${detail.slideNumber} / shape "${detail.shapeId}"` +
        (detail.slotKey ? ` (slot ${detail.slotKey})` : "") +
        ` — new text ${detail.newLength} chars is ${detail.overshootPct.toFixed(1)}% over the original ${detail.originalLength}-char budget`,
    );
    this.name = "SlotOverflowError";
    this.slideNumber = detail.slideNumber;
    this.shapeId = detail.shapeId;
    this.slotKey = detail.slotKey;
    this.originalLength = detail.originalLength;
    this.newLength = detail.newLength;
    this.overshootPct = detail.overshootPct;
  }
}

/**
 * Result envelope returned by `substituteSlots`. Always includes the PPTX
 * buffer; `warnings` is non-empty only when the soft-overflow band fired.
 */
export interface SubstitutionResult {
  pptx: Buffer;
  warnings: SlotOverflowWarning[];
}
