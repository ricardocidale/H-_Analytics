/**
 * Chiara-01 — Reader.
 *
 * Deterministic input assembler: no LLM, no I/O. Splits incoming
 * slotDrafts into approved vs. pending so Chiara-02 Builder can reason
 * about provenance without parsing LuccaSlotDraft internals itself.
 *
 * Slide 3 slot keys produced by Lucca:
 *   "slide3.conceptParagraph"  → "The Concept" narrative paragraph (serialized string)
 *   "slide3.marketRationale"   → "Why This Property?" narrative paragraph (serialized string)
 *   "slide3.reasons"           → 3 reason/detail pairs serialized as JSON array string
 *   "slide3.closingLine"       → closing pull quote (serialized string)
 *
 * Human-only slot (interiorPhotoUrl) lives in property_deck_payloads.payload
 * — not in luccaDraft — and is NOT processed by the Chiara swarm team.
 */
import type { SlideTeamInput } from "../types";
import type { LuccaSlotDraft } from "@workspace/db";

/** Assembled context Chiara-02 Builder receives from Chiara-01. */
export interface ChiaraReaderOutput {
  runId: number;
  /** Slots the admin has explicitly approved (approved: true). */
  approvedDrafts: Record<string, LuccaSlotDraft>;
  /** All slide-3 drafts, regardless of approval state. */
  allDrafts: Record<string, LuccaSlotDraft>;
  /** R2 key for the slide-3 canonical PNG (used by Inspector Pass 2). */
  canonicalPngKey: string;
}

/**
 * Run Chiara-01: assemble reader context for Chiara-02.
 * Pure function — deterministic, no I/O.
 */
export function runChiaraReader(input: SlideTeamInput): ChiaraReaderOutput {
  const approvedDrafts: Record<string, LuccaSlotDraft> = {};
  for (const [key, draft] of Object.entries(input.slotDrafts)) {
    if (draft.approved) {
      approvedDrafts[key] = draft;
    }
  }
  return {
    runId: input.runId,
    approvedDrafts,
    allDrafts: input.slotDrafts,
    canonicalPngKey: input.canonicalPngKey,
  };
}
