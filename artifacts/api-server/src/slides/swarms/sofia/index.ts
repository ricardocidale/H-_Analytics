/**
 * Sofia swarm team — Slide 1 (Investment Spotlight).
 *
 * Orchestrates the Reader → Builder → Inspector triad:
 *   Sofia-01 (reader)    — deterministic input assembler
 *   Sofia-02 (builder)   — Sonnet LLM, maps Lucca drafts → Slide1Payload
 *   Sofia-03 (inspector) — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * Slide content: Belleayre Mountain (owner-nicknamed "Sul Monte"). See
 * attached_assets/canonical/briefs/Pasted-SLIDE-1-Sul-Monte-...txt
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runSofiaReader } from "./reader";
import { runSofiaBuilder } from "./builder";
import { runSofiaInspector } from "./inspector";
import { buildSlide1SubstitutionEntries } from "../../builder-substitution-entries";

export async function runSofiaTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[sofia] run ${input.runId} — starting slide 1 triad`, "slide-factory");

  // Sofia-01: Reader (deterministic)
  const readerOutput = runSofiaReader(input);

  // Sofia-02: Builder (LLM — Sonnet)
  let payload;
  try {
    payload = await runSofiaBuilder(readerOutput);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[sofia-02] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      substitutionEntries: [],
      notes: `Builder error: ${msg}`,
    };
  }

  // Sofia-03: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runSofiaInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[sofia-03] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      substitutionEntries: buildSlide1SubstitutionEntries(payload),
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[sofia] run ${input.runId} — slide 1 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    substitutionEntries: buildSlide1SubstitutionEntries(payload),
    notes: verdict.notes,
  };
}
