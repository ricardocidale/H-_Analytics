/**
 * build-factory-payload.ts
 *
 * Deterministic assembly of `DeckPayloadV2` (slot copy only) from a slide
 * factory run's persisted state. This is the post-completion replay path —
 * Marco's `dispatchedPayloads` in-memory cache is a transient optimization,
 * not a durable contract. After a run reaches `complete`, any caller
 * (Franco the deck-render minion, Rebecca-triggered manual retry, future
 * operators) can rebuild the per-slide editorial payload from
 * `slide_factory_runs.luccaDraft` without rerunning any LLM.
 *
 * What this module produces is **only** the `DeckPayloadV2` slot copy — the
 * 6 slide sub-objects with their `AuthoredString` text fields. It does NOT
 * fetch property data, photos, or financials. Stitching those into a full
 * composite payload happens at the route layer (U4) when the internal
 * deck route serves Playwright's request.
 *
 * The Lucca slot serialization conventions mirrored here come from each
 * swarm's Builder. The original Builder runs an Anthropic Sonnet call that
 * just echoes the parsed shape back; the parsing itself is deterministic,
 * so post-completion we can skip the LLM round-trip entirely.
 *
 * Per CLAUDE.md §4 / ADR-007 §1 — this module lives at the route/service
 * layer and does not import anything from `lib/calc/` or `lib/engine/`.
 *
 * Per CLAUDE.md §1 — all numeric literals in this file are character-budget
 * constants imported from `@shared/deck-payload-v2`, plus structural
 * indices (`0`, `1`).
 */

import type { LuccaSlotDraft, SlideFactoryRun } from "@workspace/db";
import {
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  SLIDE4_SECTION_SUBTITLE_MAX,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
  LUCCA_PIPE_FORMAT_COLUMNS,
  SLIDE6_DISCLAIMER_MAX,
  type AuthoredString,
  type DeckPayloadV2,
  type Slide1Payload,
  type Slide2Payload,
  type Slide3Payload,
  type Slide4Payload,
  type Slide5Payload,
  type Slide6Payload,
} from "@shared/deck-payload-v2";
import { makeProvenance } from "./swarms/provenance";

// ── Slot key helpers ─────────────────────────────────────────────────────────
// Slot keys live as `slide<N>.<field>` strings inside `luccaDraft`. Lucca
// authored them; the swarm Readers split them by slide prefix. We address
// them by their full key here — same shape, no slide-number iteration
// required since each slide has its own static field list.

interface ReasonShape {
  label: string;
  detail: string;
}

interface TransformationRowShape {
  feature: string;
  existing: string;
  proposed: string;
}

// ── Deterministic parsers (ported from swarm Builders) ───────────────────────
// Each parser returns null if the draft string is empty or malformed — the
// downstream slot is then omitted, matching the canonical-contract empty-state
// behavior the live swarm Builders implement.

/**
 * Parse Lucca's bullet serialization — "• text\n• text\n• text" — into a
 * plain string array. Strips the leading "• " marker and trims whitespace.
 * Mirrors `runSofiaBuilder.parseBullets` exactly.
 */
function parseBullets(raw: string): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^•\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : null;
}

/**
 * Parse Lucca's reasons serialization.
 *
 * Accepts two formats:
 *   1. JSON array of `{label, detail}` — produced by direct JSON.stringify paths
 *   2. Lucca text format — `"Label: detail\n\nLabel: detail"` produced by
 *      `lucca-draft.ts#serializeReasons`. The text format is the live path;
 *      JSON is kept as a forward-compat fallback.
 */
function parseReasons(raw: string): ReasonShape[] | null {
  // Try JSON first
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const result: ReasonShape[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).label === "string" &&
        typeof (item as Record<string, unknown>).detail === "string"
      ) {
        result.push({
          label: (item as Record<string, unknown>).label as string,
          detail: (item as Record<string, unknown>).detail as string,
        });
      }
    }
    return result.length > 0 ? result : null;
  } catch {
    // Fall through to Lucca text format: "Label: detail\n\nLabel: detail"
  }
  const blocks = raw.split("\n\n").filter((b) => b.trim().length > 0);
  if (blocks.length === 0) return null;
  const result: ReasonShape[] = [];
  for (const block of blocks) {
    const colonIdx = block.indexOf(": ");
    if (colonIdx === -1) continue;
    result.push({
      label: block.slice(0, colonIdx).trim(),
      detail: block.slice(colonIdx + ": ".length).trim(),
    });
  }
  return result.length > 0 ? result : null;
}

/**
 * Parse Lucca's transformation-rows serialization.
 *
 * Accepts two formats:
 *   1. JSON array of `{feature, existing, proposed}` — produced by direct JSON.stringify paths
 *   2. Lucca pipe format — `"feature | existing | proposed\n..."` produced by
 *      `lucca-draft.ts#serializeRows`. The pipe format is the live path; JSON
 *      is kept as a forward-compat fallback.
 */
function parseRows(raw: string): TransformationRowShape[] | null {
  // Try JSON first
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows: TransformationRowShape[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).feature === "string" &&
        typeof (item as Record<string, unknown>).existing === "string" &&
        typeof (item as Record<string, unknown>).proposed === "string"
      ) {
        rows.push({
          feature: (item as TransformationRowShape).feature,
          existing: (item as TransformationRowShape).existing,
          proposed: (item as TransformationRowShape).proposed,
        });
      }
    }
    return rows.length > 0 ? rows : null;
  } catch {
    // Fall through to Lucca pipe format: "feature | existing | proposed\n..."
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const rows: TransformationRowShape[] = [];
  for (const line of lines) {
    const parts = line.split(" | ");
    if (parts.length < LUCCA_PIPE_FORMAT_COLUMNS) continue;
    rows.push({
      feature: parts[0].trim(),
      existing: parts[1].trim(),
      // Join remaining parts in case "proposed" itself contains " | "
      proposed: parts.slice(2).join(" | ").trim(),
    });
  }
  return rows.length > 0 ? rows : null;
}

// ── AuthoredString builder ───────────────────────────────────────────────────

/**
 * Build an AuthoredString from a draft, slicing the text to the slot's
 * char budget and stamping provenance from the draft's `source` and
 * `approvedAt`. Matches the shape every swarm Builder emits.
 */
function authoredFrom(draft: LuccaSlotDraft, max: number, text?: string): AuthoredString {
  const raw = text ?? draft.value;
  return {
    text: raw.slice(0, max),
    provenance: makeProvenance(draft.source, draft.approvedAt),
  };
}

// ── Per-slide builders (deterministic) ───────────────────────────────────────

function buildSlide1(luccaDraft: Record<string, LuccaSlotDraft>): Slide1Payload {
  const payload: Slide1Payload = {};

  const headerDraft = luccaDraft["slide1.headerSubtitle"];
  if (headerDraft && headerDraft.value.length > 0) {
    payload.headerSubtitle = authoredFrom(headerDraft, SLIDE1_HEADER_SUBTITLE_MAX);
  }

  const bulletsDraft = luccaDraft["slide1.visionBullets"];
  if (bulletsDraft) {
    const parsed = parseBullets(bulletsDraft.value);
    if (parsed) {
      const prov = makeProvenance(bulletsDraft.source, bulletsDraft.approvedAt);
      payload.visionBullets = parsed
        .slice(0, SLIDE1_VISION_BULLETS_COUNT)
        .map((text) => ({
          text: text.slice(0, SLIDE1_VISION_BULLET_MAX),
          provenance: prov,
        }));
    }
  }

  return payload;
}

function buildSlide2(luccaDraft: Record<string, LuccaSlotDraft>): Slide2Payload {
  const payload: Slide2Payload = {};

  const opDraft = luccaDraft["slide2.operationalModelText"];
  if (opDraft && opDraft.value.length > 0) {
    payload.operationalModelText = authoredFrom(opDraft, SLIDE2_OPERATIONAL_MODEL_MAX);
  }

  const revDraft = luccaDraft["slide2.revenueBullet"];
  if (revDraft && revDraft.value.length > 0) {
    payload.revenueBullet = authoredFrom(revDraft, SLIDE2_REVENUE_BULLET_MAX);
  }

  const progDraft = luccaDraft["slide2.programmingBullet"];
  if (progDraft && progDraft.value.length > 0) {
    payload.programmingBullet = authoredFrom(progDraft, SLIDE2_PROGRAMMING_BULLET_MAX);
  }

  return payload;
}

function buildSlide3(luccaDraft: Record<string, LuccaSlotDraft>): Slide3Payload {
  const payload: Slide3Payload = {};

  const conceptDraft = luccaDraft["slide3.conceptParagraph"];
  if (conceptDraft && conceptDraft.value.length > 0) {
    payload.conceptParagraph = authoredFrom(conceptDraft, SLIDE3_CONCEPT_PARAGRAPH_MAX);
  }

  const rationaleDraft = luccaDraft["slide3.marketRationale"];
  if (rationaleDraft && rationaleDraft.value.length > 0) {
    payload.marketRationale = authoredFrom(rationaleDraft, SLIDE3_MARKET_RATIONALE_MAX);
  }

  const reasonsDraft = luccaDraft["slide3.reasons"];
  if (reasonsDraft) {
    const parsed = parseReasons(reasonsDraft.value);
    if (parsed) {
      const prov = makeProvenance(reasonsDraft.source, reasonsDraft.approvedAt);
      payload.reasons = parsed
        .slice(0, SLIDE3_REASONS_COUNT)
        .map((r) => ({
          label: {
            text: r.label.slice(0, SLIDE3_REASON_LABEL_MAX),
            provenance: prov,
          },
          detail: {
            text: r.detail.slice(0, SLIDE3_REASON_DETAIL_MAX),
            provenance: prov,
          },
        }));
    }
  }

  const closingDraft = luccaDraft["slide3.closingLine"];
  if (closingDraft && closingDraft.value.length > 0) {
    payload.closingLine = authoredFrom(closingDraft, SLIDE3_CLOSING_LINE_MAX);
  }

  return payload;
}

function buildSlide4(luccaDraft: Record<string, LuccaSlotDraft>): Slide4Payload {
  const payload: Slide4Payload = {};

  const subtitleDraft = luccaDraft["slide4.sectionSubtitle"];
  if (subtitleDraft && subtitleDraft.value.length > 0) {
    payload.sectionSubtitle = authoredFrom(subtitleDraft, SLIDE4_SECTION_SUBTITLE_MAX);
  }

  return payload;
}

function buildSlide5(luccaDraft: Record<string, LuccaSlotDraft>): Slide5Payload {
  const payload: Slide5Payload = {};

  const descriptionDraft = luccaDraft["slide5.transformationDescription"];
  if (descriptionDraft && descriptionDraft.value.length > 0) {
    payload.transformationDescription = authoredFrom(
      descriptionDraft,
      SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
    );
  }

  const rowsDraft = luccaDraft["slide5.transformationRows"];
  if (rowsDraft) {
    const parsed = parseRows(rowsDraft.value);
    if (parsed) {
      const prov = makeProvenance(rowsDraft.source, rowsDraft.approvedAt);
      payload.transformationRows = parsed
        .slice(0, SLIDE5_TRANSFORMATION_ROWS_COUNT)
        .map((row) => ({
          feature: {
            text: row.feature.slice(0, SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
            provenance: prov,
          },
          existing: {
            text: row.existing.slice(0, SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
            provenance: prov,
          },
          proposed: {
            text: row.proposed.slice(0, SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
            provenance: prov,
          },
        }));
    }
  }

  return payload;
}

function buildSlide6(luccaDraft: Record<string, LuccaSlotDraft>): Slide6Payload {
  const payload: Slide6Payload = {};

  const disclaimerDraft = luccaDraft["slide6.disclaimer"];
  if (disclaimerDraft && disclaimerDraft.value.length > 0) {
    payload.disclaimer = authoredFrom(disclaimerDraft, SLIDE6_DISCLAIMER_MAX);
  }

  return payload;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Assemble a `DeckPayloadV2` from a slide-factory run's persisted state.
 *
 * Deterministic — no LLM, no I/O, no Marco-internal cache. Reads only
 * `run.luccaDraft`. Property assignments (`slide<N>PropertyId`) and Marco's
 * per-slide approval gate (`agentResults`) live elsewhere in `SlideFactoryRun`
 * but are NOT part of `DeckPayloadV2`'s shape — slot text comes purely from
 * Lucca's drafted/approved copy. The route layer (U4) stitches property
 * data + financials onto the slot copy when serving the internal deck route.
 *
 * Slots without a draft are omitted (matches the canonical-contract empty-
 * state behavior of every swarm Builder). Slots whose serialized value can't
 * be parsed (malformed JSON for `reasons` / `transformationRows` / bullets)
 * are likewise omitted.
 *
 * Synchronous because the input is already-loaded run state; no fetches are
 * needed to produce the slot copy. If the caller has a runId only, they
 * should resolve it via `getSlideFactoryRunById` before calling this.
 */
export function buildFactoryPayload(run: SlideFactoryRun): DeckPayloadV2 {
  const luccaDraft = run.luccaDraft ?? {};

  return {
    schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
    slide1: buildSlide1(luccaDraft),
    slide2: buildSlide2(luccaDraft),
    slide3: buildSlide3(luccaDraft),
    slide4: buildSlide4(luccaDraft),
    slide5: buildSlide5(luccaDraft),
    slide6: buildSlide6(luccaDraft),
  };
}
