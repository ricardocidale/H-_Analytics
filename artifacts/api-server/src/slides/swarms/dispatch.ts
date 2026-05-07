/**
 * dispatchSlideTeam — Unit 4.
 *
 * Marco's `dispatch_slide_team` primitive routes here. Pure dispatcher: looks
 * up the team module by slide number and delegates to its `runTeam` entry.
 * No orchestration logic, no fanout — Marco's system prompt drives sequencing.
 *
 * Phase 1 ships with stub team modules under each `swarms/{name}/index.ts`.
 * Stubs return `{ status: 'ok', payloadV2: { stubbed: true }, notes: ... }`
 * so the end-to-end flow Marco → dispatch → team → Marco can be exercised
 * before U5/U6 land real team implementations. The stub seam is where
 * U5/U6 implementers swap in real code without touching this dispatcher
 * or Marco's tools.
 */
import { runSofiaTeam } from "./sofia";
import { runBiancaTeam } from "./bianca";
import { runChiaraTeam } from "./chiara";
import { runDarioTeam } from "./dario";
import { runElisaTeam } from "./elisa";
import { runFelixTeam } from "./felix";
import type { SlideTeamInput, SlideTeamOutput } from "./types";
import { TOTAL_SLIDES } from "../deck-render-constants";

/**
 * Team modules indexed by `slideNumber - 1`. Array form (rather than an
 * object keyed by literal slide numbers 1..6) keeps slide indices off the
 * source — the magic-number ratchet flags repeated literal keys.
 */
const TEAMS_BY_INDEX: Array<(input: SlideTeamInput) => Promise<SlideTeamOutput>> = [
  runSofiaTeam,
  runBiancaTeam,
  runChiaraTeam,
  runDarioTeam,
  runElisaTeam,
  runFelixTeam,
];

export async function dispatchSlideTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  const idx = input.slideNumber - 1;
  const team = TEAMS_BY_INDEX[idx];
  if (!team) {
    throw new Error(
      `dispatchSlideTeam: invalid slideNumber ${input.slideNumber}; expected 1..${TOTAL_SLIDES}`,
    );
  }
  return team(input);
}
