/**
 * Sofia-01 — Reader.
 *
 * Deterministic input assembler: no LLM, no I/O. Splits incoming
 * slotDrafts into approved vs. pending so Sofia-02 Builder can reason
 * about provenance without parsing LuccaSlotDraft internals itself.
 *
 * Slide 1 slot keys produced by Lucca:
 *   "slide1.headerSubtitle"  → one-line tagline (serialized string)
 *   "slide1.visionBullets"   → 3 bullets serialized as "• text\n• text\n• text"
 *
 * Human-only slots (propertySubtitle, closingTagline, photoCaptions) live in
 * property_deck_payloads.payload — not in luccaDraft — and are not processed
 * by the swarm team.
 */
import type { SlideTeamInput } from "../types";
import type { LuccaSlotDraft } from "@workspace/db";

/** Assembled context Sofia-02 Builder receives from Sofia-01. */
export interface SofiaReaderOutput {
  runId: number;
  /** Slots the admin has explicitly approved (approved: true). */
  approvedDrafts: Record<string, LuccaSlotDraft>;
  /** All slide-1 drafts, regardless of approval state. */
  allDrafts: Record<string, LuccaSlotDraft>;
  /** R2 key for the slide-1 canonical PNG (used by Inspector Pass 2). */
  canonicalPngKey: string;
}

/**
 * Run Sofia-01: assemble reader context for Sofia-02.
 * Pure function — deterministic, no I/O.
 */
export function runSofiaReader(input: SlideTeamInput): SofiaReaderOutput {
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
