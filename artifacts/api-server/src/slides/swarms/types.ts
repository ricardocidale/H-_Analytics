/**
 * Per-slide swarm team interfaces — Unit 4.
 *
 * Defines the shared shape Marco (orchestrator) uses to dispatch each slide
 * team and consume its output. The six teams (Sofia / Bianca / Chiara / Dario /
 * Elisa / Felix) each implement `runTeam(input): Promise<SlideTeamOutput>`
 * via their respective `index.ts`. Members within a team follow the
 * Reader→Builder→Inspector triad with documented exceptions (Dario collapses
 * to 2, Felix expands to 5) per
 * docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md.
 *
 * Identity strings (Name-NN form per CLAUDE.md §10) live in each member's
 * system prompt; filenames stay function-suffixed (reader.ts / builder.ts /
 * inspector.ts) per existing Lorenzo convention.
 */
import type { SlideAgentResult } from "@workspace/db";
import type { LuccaSlotDraft } from "@workspace/db";

/**
 * Slide-number union — pinned to TOTAL_SLIDES (6). Centralized here so
 * every consumer imports the one definition; declaring the union literal
 * inline at multiple call sites would trip the magic-number ratchet on
 * the slide indices.
 */
export type SlideNumber = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Input passed to a per-slide team's `runTeam` entry point.
 *
 * `slotDrafts` is the subset of `slide_factory_runs.luccaDraft` that belongs
 * to this slide (keys like "slide1.headerSubtitle" → LuccaSlotDraft).
 * `financialInputs` is sourced from Davide via the route handler that
 * dispatches Marco — Marco itself does not import lib/engine (ADR-007).
 * `canonicalPngKey` is the R2 key for the slide's reference PNG (used by
 * Inspector Pass 2 LLM-vision and by Dino in U7).
 * `briefR2Key` is the run's brief upload from Tab 1 (per-slide briefs
 * extracted by Lorenzo are inside `canonicalSpec`, but raw brief is kept
 * available for teams that want it).
 */
export interface SlideTeamInput {
  runId: number;
  slideNumber: SlideNumber;
  slotDrafts: Record<string, LuccaSlotDraft>;
  financialInputs: unknown;
  canonicalPngKey: string;
  briefR2Key: string | null;
}

/**
 * Output a per-slide team returns to Marco.
 *
 * `status` is the team's own Inspector verdict. Maya/Dino layer additional
 * verification on top in U7 — the team's verdict is the team-internal
 * Reader→Builder→Inspector outcome, not the cross-app cross-check.
 *
 * `payloadV2` is the slot-specific DeckPayloadV2 fragment for this slide.
 * Typed as unknown here to keep the swarm framework decoupled from
 * @shared/deck-payload-v2 — each team's implementation uses the strict type
 * from that module.
 *
 * `notes` carries the Inspector's reasoning when status is `block` or `fail`.
 */
export interface SlideTeamOutput {
  slideNumber: SlideNumber;
  status: "ok" | "block" | "fail";
  payloadV2: unknown;
  notes: string | null;
}

/**
 * One member of a per-slide team. `identity` is the Name-NN form (e.g.,
 * "Sofia-01") used in system prompts and log lines. `role` distinguishes
 * Reader / Builder / Inspector; teams that deviate (Dario, Felix) widen this.
 */
export interface SlideTeamMember {
  identity: string;
  role: "reader" | "builder" | "inspector" | "aggregator" | "validator" | "formatter";
}

/**
 * Maps a SlideTeamOutput status to the SlideAgentResult.status the storage
 * layer writes. `ok` → `approved`, anything else → `rejected`. Marco uses
 * this when calling `update_agent_result`.
 */
export function teamOutputToAgentStatus(
  status: SlideTeamOutput["status"],
): SlideAgentResult["status"] {
  return status === "ok" ? "approved" : "rejected";
}
