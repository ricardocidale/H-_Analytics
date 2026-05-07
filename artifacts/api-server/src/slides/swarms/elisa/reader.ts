/**
 * Elisa-01 — Reader.
 *
 * Deterministic input assembler: no LLM, no I/O. Splits incoming
 * slotDrafts into approved vs. pending so Elisa-02 Builder can reason
 * about provenance without parsing LuccaSlotDraft internals itself.
 *
 * Slide 5 slot keys produced by Lucca:
 *   "slide5.transformationDescription" → intro paragraph (plain string)
 *   "slide5.transformationRows"         → JSON array string:
 *                                         '[{"feature":"...","existing":"...","proposed":"..."},...]'
 *
 * The right panel (financial snapshot, financing summary) is deterministic
 * and is not processed by the swarm team.
 */
import type { SlideTeamInput } from "../types";
import type { LuccaSlotDraft } from "@workspace/db";

/** Assembled context Elisa-02 Builder receives from Elisa-01. */
export interface ElisaReaderOutput {
  runId: number;
  /** Slots the admin has explicitly approved (approved: true). */
  approvedDrafts: Record<string, LuccaSlotDraft>;
  /** All slide-5 drafts, regardless of approval state. */
  allDrafts: Record<string, LuccaSlotDraft>;
  /** R2 key for the slide-5 canonical PNG (used by Inspector Pass 2). */
  canonicalPngKey: string;
}

/**
 * Run Elisa-01: assemble reader context for Elisa-02.
 * Pure function — deterministic, no I/O.
 */
export function runElisaReader(input: SlideTeamInput): ElisaReaderOutput {
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
