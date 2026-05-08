/**
 * Bianca-01 — Reader.
 *
 * Deterministic input assembler: no LLM, no I/O. Splits incoming
 * slotDrafts into approved vs. pending so Bianca-02 Builder can reason
 * about provenance without parsing LuccaSlotDraft internals itself.
 *
 * Slide 2 slot keys produced by Lucca:
 *   "slide2.operationalModelText" → "Operational Model: …" italic serif line
 *   "slide2.revenueBullet"        → revenue / rate strategy bullet
 *   "slide2.programmingBullet"    → programming / amenity strategy bullet
 *
 * Photos (2×2 grid) and financial stats are deterministic — not processed
 * by the swarm team.
 */
import type { SlideTeamInput } from "../types";
import type { LuccaSlotDraft } from "@workspace/db";

/** Assembled context Bianca-02 Builder receives from Bianca-01. */
export interface BiancaReaderOutput {
  runId: number;
  /** Slots the admin has explicitly approved (approved: true). */
  approvedDrafts: Record<string, LuccaSlotDraft>;
  /** All slide-2 drafts, regardless of approval state. */
  allDrafts: Record<string, LuccaSlotDraft>;
  /** R2 key for the slide-2 canonical PNG (used by Inspector Pass 2). */
  canonicalPngKey: string;
}

/**
 * Run Bianca-01: assemble reader context for Bianca-02.
 * Pure function — deterministic, no I/O.
 */
export function runBiancaReader(input: SlideTeamInput): BiancaReaderOutput {
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
