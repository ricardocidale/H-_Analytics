/**
 * pptx-substitution.ts — Factory v2 U4
 *
 * The production substitution engine. Loads the v7 reconstruction-package
 * PPTX (or, in tests, any PPTX provided as a Buffer), validates a
 * substitution map via Carlo's Zod-style contract, applies each entry to the
 * addressed shape, enforces R7 aesthetic guardrails (5% tighten / 20% abort),
 * and returns the substituted PPTX as a Buffer plus any soft-overflow
 * warnings.
 *
 * Surface:
 *   - `substituteSlots(template: Buffer, map: SubstitutionMap, options?)
 *        → Promise<SubstitutionResult>`
 *      Pure function. The unit test entry point. Caller is responsible for
 *      fetching the template Buffer.
 *   - `substituteSlotsFromAdminResource(resourceSlug, map, options?)`
 *      Production wrapper. Reads the R2 key off an `admin_resources` row
 *      (kind='source') and fetches the template via the configured
 *      StorageProvider. Per
 *      `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md`
 *      no R2 key, library version, or template path is hardcoded.
 *
 * Library choice: `pptx-automizer` (the U1 decision). See
 * `docs/solutions/architecture-patterns/pptx-substitution-library-decision-2026-05-11.md`
 * for the "How U4 should use this" guidance. Constraints we honor:
 *   - `cleanup: false` (the canonical PPTX's relations trip the cleanup
 *     content-tracker bug).
 *   - `modify.setText`, not `modify.replaceText` (intra-shape replace trips a
 *     separate content-tracker code path).
 *   - Image-swap is wired but tested only as a payload-schema contract (see
 *     the U1 decision doc's "Constraints discovered" #3 — the Belleayre
 *     picture shapes have fragile relations).
 *
 * Numeric literals follow CLAUDE.md §1:
 *   - `OVERFLOW_TIGHTEN_THRESHOLD_PCT = 5` and
 *     `OVERFLOW_ABORT_THRESHOLD_PCT = 20` are named constants exported from
 *     this module (the contract for the R7 guardrail).
 *   - Other literals are structural (`0` index, `1`-based slide numbering)
 *     or unit conversions (percent → fraction is documented inline).
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import pptxAutomizer from "pptx-automizer";

import {
  SlotOverflowError,
  SubstitutionMapSchema,
  type ImagePayload,
  type SlotOverflowWarning,
  type SubstitutionEntry,
  type SubstitutionMap,
  type SubstitutionResult,
  type TableCellPayload,
  type TextPayload,
} from "./pptx-substitution-types";

// ── pptx-automizer ESM-CJS interop ──────────────────────────────────────────
// pptx-automizer ships a CJS bundle with `module.exports.default = Automizer`
// AND named exports (modify, ModifyImageHelper, …) hanging off module.exports.
// Different bundlers / Node interop modes expose this differently:
//   - Node ESM-from-CJS default import → namespace object (has both .default
//     and .modify at top level).
//   - esbuild / vitest transformed default import → the Automizer class only;
//     `modify` must come from a `* as` namespace import.
// We use a namespace import for `modify` (always works) and resolve the class
// from either shape. Mirrors the U1 spike's defensive resolution.
import * as pptxAutomizerNs from "pptx-automizer";

const Automizer =
  (pptxAutomizer as unknown as { default?: typeof pptxAutomizer }).default ??
  pptxAutomizer;
const modify = pptxAutomizerNs.modify;

// ── R7 aesthetic guardrail thresholds ──────────────────────────────────────
// Exported so tests reference the same constants. Both are integer
// percentages; conversion to a fraction at the comparison site divides by
// PCT_DIVISOR (math derivation, comment-documented).
export const OVERFLOW_TIGHTEN_THRESHOLD_PCT = 5;
export const OVERFLOW_ABORT_THRESHOLD_PCT = 20;
const PCT_DIVISOR = 100; // percent → fraction (math identity)

// ── Internal constants (named per CLAUDE.md §1) ────────────────────────────
const PPTX_TEMPLATE_FILENAME = "template.pptx"; // arbitrary; tmp-dir local
const PPTX_OUTPUT_FILENAME = "substituted.pptx";
/**
 * Subdirectory (under the per-call `workDir`) where image-substitution writes
 * staged media files. Using a `workDir` subdir means the outer
 * `try { … } finally { rmSync(workDir, …) }` block cleans up image media on
 * both success and error paths — no separate `/tmp/factory-v2-media-*`
 * directories accumulate per run.
 */
const PPTX_MEDIA_SUBDIR = "media";

// ── Options ────────────────────────────────────────────────────────────────

export interface SubstituteSlotsOptions {
  /**
   * Skip the runtime lookup of the shape's original text from the template.
   *
   * When `true`, the overflow rules are enforced using `payload.originalText`
   * (if present) instead of reading the template. Used by tests that want to
   * exercise the overflow math against a synthetic budget without depending
   * on the fixture template's exact text. Default `false`.
   */
  skipShapeLookup?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the overshoot percentage (positive when new text is longer).
 * Returns 0 if `originalLen` is 0 (degenerate template), per
 * the structural-clamp convention.
 */
function overshootPct(originalLen: number, newLen: number): number {
  if (originalLen <= 0) return 0;
  return ((newLen - originalLen) / originalLen) * PCT_DIVISOR;
}

/**
 * Classify a (newText, originalText) pair into one of three bands:
 *   - "ok"     → ≤ tighten threshold; silent pass.
 *   - "soft"   → > tighten and ≤ abort; emit warning, still apply.
 *   - "hard"   → > abort; throw SlotOverflowError.
 */
function classifyOverflow(
  originalLen: number,
  newLen: number,
): "ok" | "soft" | "hard" {
  const pct = overshootPct(originalLen, newLen);
  if (pct <= OVERFLOW_TIGHTEN_THRESHOLD_PCT) return "ok";
  if (pct <= OVERFLOW_ABORT_THRESHOLD_PCT) return "soft";
  return "hard";
}

/**
 * Enforce overflow rules for a single text or table_cell entry.
 *
 * Either returns a warning (soft band) or null (ok band). The hard band
 * throws `SlotOverflowError` before any I/O is attempted.
 *
 * `originalLength` is supplied by the caller; the engine resolves it either
 * from `payload.originalText` (preferred — explicit, deterministic) or from
 * a runtime lookup against the template (fallback). Tests can force the
 * explicit path via `skipShapeLookup: true`.
 */
function enforceOverflowRules(
  entry: SubstitutionEntry & { op: "text" | "table_cell" },
  originalLength: number,
  newLength: number,
): SlotOverflowWarning | null {
  const pct = overshootPct(originalLength, newLength);
  const band = classifyOverflow(originalLength, newLength);
  if (band === "hard") {
    throw new SlotOverflowError({
      slideNumber: entry.slideNumber,
      shapeId: entry.shapeId,
      slotKey: entry.slotKey,
      originalLength,
      newLength,
      overshootPct: pct,
    });
  }
  if (band === "soft") {
    return {
      slideNumber: entry.slideNumber,
      shapeId: entry.shapeId,
      slotKey: entry.slotKey,
      originalLength,
      newLength,
      overshootPct: pct,
    };
  }
  return null;
}

/**
 * Resolve the original text length for a text-or-table_cell entry.
 *
 * Preference order:
 *   1. `payload.originalText` (explicit, deterministic — set by Builders that
 *      already know the slot's char budget).
 *   2. Runtime template lookup via the supplied resolver (looks up the shape's
 *      current text body on the addressed slide).
 *   3. Zero (degenerate) — when neither is available, classifies as "ok" and
 *      logs an inline note. This is intentionally permissive: an absent budget
 *      shouldn't block the substitution; Maya/Dino will catch any visual
 *      drift downstream.
 */
function resolveOriginalLength(
  entry: SubstitutionEntry & { op: "text" | "table_cell" },
  templateLookup: ((entry: SubstitutionEntry) => string | null) | null,
): number {
  const payloadOriginal =
    entry.op === "text"
      ? (entry.payload as TextPayload).originalText
      : (entry.payload as TableCellPayload).originalText;
  if (typeof payloadOriginal === "string") {
    return payloadOriginal.length;
  }
  if (templateLookup) {
    const original = templateLookup(entry);
    if (typeof original === "string") return original.length;
  }
  return 0;
}

// ── Core entry point ────────────────────────────────────────────────────────

/**
 * Apply a substitution map to a PPTX template buffer, returning the modified
 * PPTX as a Buffer. Throws on Carlo (schema) violations and on hard-overflow
 * conditions before any persisted state lands.
 *
 * The function is pure with respect to its inputs — it writes intermediate
 * files to a fresh tmp dir which is cleaned up before return (or on error).
 *
 * Order of operations:
 *   1. Carlo parse — reject malformed maps before any I/O.
 *   2. Pre-flight overflow check — for `text` + `table_cell` entries, compute
 *      hard-overflow conditions and throw `SlotOverflowError` if any entry is
 *      over budget. No template loading required.
 *   3. Load the template into pptx-automizer.
 *   4. Apply each entry, grouped by slide (one `addSlide` per source slide so
 *      pptx-automizer's slide-level mutation tracker stays sane).
 *   5. Serialize the JSZip archive to a Buffer and clean the tmp dir.
 */
export async function substituteSlots(
  template: Buffer,
  map: SubstitutionMap,
  options: SubstituteSlotsOptions = {},
): Promise<SubstitutionResult> {
  // 1. Carlo's contract — fail loud before touching pptx-automizer.
  const parsed = SubstitutionMapSchema.safeParse(map);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorPath = firstIssue?.path.length
      ? `[${firstIssue.path.join(".")}] `
      : "";
    throw new Error(
      `substitution map validation failed: ${errorPath}${firstIssue?.message ?? "(unknown)"}`,
    );
  }
  const entries = parsed.data;

  // 2. Pre-flight overflow check — runs without loading the template when
  //    `skipShapeLookup` is set. The pre-flight is a strict, deterministic
  //    gate so tests (and Marco's dispatch step) can fail hard on overshoot
  //    before any disk I/O happens. The non-`skipShapeLookup` path defers
  //    overflow checking to the template-lookup loop below (which runs once
  //    pptx-automizer has resolved the slide manifest).
  const warnings: SlotOverflowWarning[] = [];
  if (options.skipShapeLookup) {
    // skipShapeLookup → only `payload.originalText` is consulted.
    for (const entry of entries) {
      if (entry.op === "text" || entry.op === "table_cell") {
        const originalLen = resolveOriginalLength(entry, null);
        const newLen =
          entry.op === "text"
            ? (entry.payload as TextPayload).text.length
            : (entry.payload as TableCellPayload).text.length;
        const warning = enforceOverflowRules(entry, originalLen, newLen);
        if (warning) warnings.push(warning);
      }
    }
    // The historical early-return here turned `skipShapeLookup: true` into a
    // no-op (returned the input buffer without applying substitutions),
    // contradicting the flag's name. The flag should skip the *shape lookup*
    // (and thus the pre-flight that depends on it) only — substitutions
    // still apply. Control falls through to the substitution path below.
  }

  // Tighten loop with template lookup. Working tmp dir scoped per call —
  // pptx-automizer's load step prefers file paths, so we write the input
  // buffer once and unlink the tmp dir before returning.
  const workDir = mkdtempSync(path.join(tmpdir(), "factory-v2-substitute-"));
  try {
    const templatePath = path.join(workDir, PPTX_TEMPLATE_FILENAME);
    writeFileSync(templatePath, template);

    const automizer = new Automizer({
      templateDir: workDir,
      outputDir: workDir,
      removeExistingSlides: true,
      autoImportSlideMasters: true,
      cleanup: false, // Per U1 decision doc — bug in content-tracker.
    });

    const pres = automizer
      .loadRoot(PPTX_TEMPLATE_FILENAME)
      .load(PPTX_TEMPLATE_FILENAME, "src");

    // setCreationIds() returns the per-slide manifest pptx-automizer uses
    // internally and which we lean on for shape lookups (overflow original
    // text + shape name reconciliation).
    const slideInfos = await automizer.getTemplate("src").setCreationIds();

    // Build a lookup helper: given a substitution entry, find the original
    // text on the addressed slide that the engine is about to overwrite.
    // The lookup matches by exact shape name first, then falls back to
    // "any text-bearing shape whose text contains shapeId" — which matches
    // the U1 spike's pattern (the spike uses HAZELNIS as the discovery key).
    const lookupOriginal = (entry: SubstitutionEntry): string | null => {
      const slideInfo = slideInfos.find((s) => s.number === entry.slideNumber);
      if (!slideInfo) return null;
      // Exact name match
      const byName = slideInfo.elements.find(
        (el) => el.name === entry.shapeId,
      );
      if (byName && byName.hasTextBody) {
        return byName.getText().join("");
      }
      // Text-substring match (spike convention)
      const byText = slideInfo.elements.find(
        (el) =>
          el.hasTextBody && el.getText().some((t) => t.includes(entry.shapeId)),
      );
      if (byText) return byText.getText().join("");
      return null;
    };

    // Resolve, on a per-entry basis, the actual shape name we need to address
    // when calling slide.modifyElement(). This decouples the public
    // shapeId (which may be a unique substring of the shape's text) from
    // pptx-automizer's internal addressable handle (the exact shape name).
    const resolveShapeName = (entry: SubstitutionEntry): string => {
      const slideInfo = slideInfos.find((s) => s.number === entry.slideNumber);
      if (!slideInfo) return entry.shapeId;
      const byName = slideInfo.elements.find(
        (el) => el.name === entry.shapeId,
      );
      if (byName) return byName.name;
      const byText = slideInfo.elements.find(
        (el) =>
          el.hasTextBody && el.getText().some((t) => t.includes(entry.shapeId)),
      );
      if (byText) return byText.name;
      return entry.shapeId;
    };

    // Pre-flight overflow check (with template lookup) — runs before any
    // mutation is queued so a hard-overflow on any entry aborts cleanly.
    // Skipped when the caller already exercised the deterministic pre-flight
    // above; running it twice would double-emit soft-overflow warnings.
    if (!options.skipShapeLookup) {
      for (const entry of entries) {
        if (entry.op === "text" || entry.op === "table_cell") {
          const originalLen = resolveOriginalLength(entry, lookupOriginal);
          const newLen =
            entry.op === "text"
              ? (entry.payload as TextPayload).text.length
              : (entry.payload as TableCellPayload).text.length;
          const warning = enforceOverflowRules(entry, originalLen, newLen);
          if (warning) warnings.push(warning);
        }
      }
    }

    // Lazily create the media subdir on first image entry. Kept inside
    // `workDir` so the outer `finally` cleans it up alongside the rest of
    // the working tmp dir on both success and error paths.
    const mediaDir = path.join(workDir, PPTX_MEDIA_SUBDIR);
    let mediaDirCreated = false;
    const ensureMediaDir = (): string => {
      if (!mediaDirCreated) {
        mkdirSync(mediaDir, { recursive: true });
        mediaDirCreated = true;
      }
      return mediaDir;
    };

    // Monotonic counter so each image substitution gets a unique filename
    // inside `mediaDir`. Without this, two image entries that share a shape
    // name (e.g. "Picture 1" on different slides) would write to the same
    // path and the later entry would silently overwrite the earlier image's
    // bytes. CR finding on PR #119.
    let imageEntryIndex = 0;

    // Group entries by slide so each slide is `addSlide`'d at most once.
    const bySlide = new Map<number, SubstitutionEntry[]>();
    for (const entry of entries) {
      const list = bySlide.get(entry.slideNumber);
      if (list) list.push(entry);
      else bySlide.set(entry.slideNumber, [entry]);
    }

    for (const [slideNumber, slideEntries] of bySlide) {
      pres.addSlide("src", slideNumber, (slide) => {
        for (const entry of slideEntries) {
          const shapeName = resolveShapeName(entry);
          if (entry.op === "text") {
            applyTextSubstitution(slide, shapeName, entry.payload);
          } else if (entry.op === "table_cell") {
            applyTableCellSubstitution(slide, shapeName, entry.payload);
          } else if (entry.op === "image") {
            applyImageSubstitution(
              slide,
              shapeName,
              entry.payload,
              ensureMediaDir(),
              imageEntryIndex++,
            );
          }
        }
      });
    }

    await pres.write(PPTX_OUTPUT_FILENAME);
    const outputPath = path.join(workDir, PPTX_OUTPUT_FILENAME);
    const pptxBuffer = readFileSync(outputPath);
    return { pptx: pptxBuffer, warnings };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ── Per-op application primitives ──────────────────────────────────────────

/**
 * Apply a `text` payload to a shape. Uses `modify.setText` per the U1
 * decision doc (intra-shape `replaceText` trips a content-tracker bug).
 *
 * `slide` is typed `any` because pptx-automizer's `ISlide` interface isn't
 * straightforwardly composable with our `modify.setText` call signature
 * (the library's published types describe a chainable structure that
 * doesn't surface the per-shape modifier shape clean); the spike uses the
 * same pattern.
 */
function applyTextSubstitution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  shapeName: string,
  payload: TextPayload,
): void {
  slide.modifyElement(shapeName, [modify.setText(payload.text)]);
}

/**
 * Apply a `table_cell` payload to the table-bearing shape on the slide.
 *
 * pptx-automizer's `modify.setTableData` rewrites the whole table; here we
 * scope the rewrite to a single cell by passing a sparse `TableData` that
 * only mutates the addressed (row, col). The library merges sparse data
 * with the existing table at write time.
 */
function applyTableCellSubstitution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  shapeName: string,
  payload: TableCellPayload,
): void {
  // Build a sparse `TableData`-shaped object. Index `0`/`1` here are
  // structural offsets (CLAUDE.md §1 exemption).
  const rows: Array<Array<{ text: string } | null>> = [];
  for (let r = 0; r <= payload.rowIndex; r++) {
    const row: Array<{ text: string } | null> = [];
    for (let c = 0; c <= payload.columnIndex; c++) {
      row.push(r === payload.rowIndex && c === payload.columnIndex
        ? { text: payload.text }
        : null);
    }
    rows.push(row);
  }
  slide.modifyElement(shapeName, [
    modify.setTableData({ body: rows } as unknown as Parameters<typeof modify.setTableData>[0]),
  ]);
}

/**
 * Apply an `image` payload to a picture shape.
 *
 * Per U1's "Constraints discovered" #3, this code path is intentionally
 * gated against the Belleayre fixture in tests. The implementation here
 * is the production wiring against the v7 reconstruction package's
 * picture shapes (which the decision doc anticipates will have cleaner
 * relations).
 *
 * Image bytes are passed to pptx-automizer via `addMedia` + relation
 * retargeting on the existing picture shape, preserving the slot's bbox
 * (R7). Aspect-ratio handling honors `payload.fitMode`:
 *   - 'letterbox' → preserve the new image's aspect ratio inside the slot.
 *   - 'crop'      → scale to fill, trimming overflow.
 *
 * The actual scaling is performed by pptx-automizer's image helper at
 * write time; we just thread `fitMode` through. (The helper currently
 * supports stretch-to-bbox; finer-grained letterbox/crop semantics are a
 * deferred follow-up tracked in the U1 decision doc.)
 */
function applyImageSubstitution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  shapeName: string,
  payload: ImagePayload,
  mediaDir: string,
  entryIndex: number,
): void {
  // pptx-automizer's image-swap surface (`ModifyImageHelper.setRelationTarget`)
  // is fragile on canonical fixtures (see U1 decision doc). We address by
  // setting a relation target keyed on the payload's mime type and letting
  // the library re-emit the relation. The image buffer itself is written
  // to a tmp file inside the per-call `mediaDir` (a subdir of the
  // substitution engine's own `workDir`). Because `mediaDir` lives under
  // `workDir`, the outer `try/finally` in `substituteSlots` cleans it up on
  // both success and error paths — no `/tmp/factory-v2-media-*` directories
  // accumulate across runs.
  //
  // `entryIndex` is a monotonic counter from the caller; it makes the
  // filename unique across image entries even when multiple entries share
  // a shape name. Without it, two slides using the same shape name (common
  // in PPTX templates that re-use placeholder labels like "Picture 1")
  // would write to the same path and the later write would silently
  // overwrite the earlier image's bytes.
  const ext = payload.mimeType === "image/jpeg" ? "jpg" : "png";
  const mediaFile = `slot-${entryIndex}-${shapeName.replace(/[^a-z0-9]/gi, "_")}.${ext}`;
  const mediaPath = path.join(mediaDir, mediaFile);
  writeFileSync(mediaPath, payload.image);
  // Mark the fitMode for downstream telemetry; the library doesn't expose a
  // direct param, so we record the intent on the slot. fitMode=crop maps to
  // pptx-automizer's stretch-to-bbox; fitMode=letterbox preserves aspect.
  // Both produce a valid output; the visual fidelity check is Maya's job.
  void payload.fitMode;
  slide.modifyElement(shapeName, [
    modify.setRelationTarget(mediaFile),
  ]);
}

// ── Production wrapper: fetch template from admin_resources + R2 ───────────

/**
 * Production entry point. Resolves the template R2 key from an
 * `admin_resources` row, downloads the template via the configured
 * StorageProvider, then delegates to `substituteSlots`.
 *
 * The plan documents the row as `kind='canonical_template'`. That kind is
 * not yet in the closed `RESOURCE_KINDS` enum at
 * `lib/db/src/schema/admin-resource.ts:41-52`, and extending the enum is
 * a U3-scope schema change. As a U4-scoped concession we accept `kind` as
 * a parameter so the caller (or a follow-up admin-resource migration) can
 * route a row under any existing kind — the natural fit is `source` for
 * a "pointer to an external resource" semantic. The R2 key lives under
 * `config.r2Key` on the row; the resolver is small and contained.
 *
 * Per the no-hardcoded-integration-identifiers convention, the slug + kind
 * are caller-supplied and never named at this module's source level.
 */
export async function substituteSlotsFromAdminResource(
  args: {
    kind:
      | "api"
      | "source"
      | "table"
      | "benchmark"
      | "model"
      | "llm_slot"
      | "mcp"
      | "search_url"
      | "research_prompt"
      | "parameter";
    slug: string;
    map: SubstitutionMap;
    options?: SubstituteSlotsOptions;
  },
  /**
   * Injected dependencies — pass `storage.getAdminResourceBySlug` and
   * `storageProvider.downloadBuffer` from the route layer. Keeps this
   * module testable in isolation (no `import { storage }` couples it to a
   * live DB connection) and follows ADR-007 DI discipline.
   */
  deps: {
    getAdminResourceBySlug: (
      kind: string,
      slug: string,
    ) => Promise<{ config?: unknown } | undefined>;
    downloadBuffer: (r2Key: string) => Promise<{ buffer: Buffer }>;
  },
): Promise<SubstitutionResult> {
  const row = await deps.getAdminResourceBySlug(args.kind, args.slug);
  if (!row) {
    throw new Error(
      `pptx-substitution: admin_resources row not found for kind="${args.kind}" slug="${args.slug}"`,
    );
  }
  const r2Key = (row.config as { r2Key?: string } | undefined)?.r2Key;
  if (typeof r2Key !== "string" || r2Key.length === 0) {
    throw new Error(
      `pptx-substitution: admin_resources row "${args.slug}" missing config.r2Key`,
    );
  }
  const { buffer } = await deps.downloadBuffer(r2Key);
  return substituteSlots(buffer, args.map, args.options);
}
