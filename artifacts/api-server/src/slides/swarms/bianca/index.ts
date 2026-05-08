/**
 * Bianca swarm team — Slide 2 (Alt View / Photo Gallery).
 *
 * Orchestrates the Reader → Builder → Inspector triad:
 *   Bianca-01 (reader)    — deterministic input assembler
 *   Bianca-02 (builder)   — Sonnet LLM, maps Lucca drafts → Slide2Payload
 *   Bianca-03 (inspector) — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * Slide content: Loch Sheldrake (owner-nicknamed "Hazelnis Retreat"). See
 * attached_assets/canonical/briefs/Pasted-SLIDE-2-Hazelnis-Retreat-...txt
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runBiancaReader } from "./reader";
import { runBiancaBuilder } from "./builder";
import { runBiancaInspector } from "./inspector";

export async function runBiancaTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[bianca] run ${input.runId} — starting slide 2 triad`, "slide-factory");

  // Bianca-01: Reader (deterministic)
  const readerOutput = runBiancaReader(input);

  // Bianca-02: Builder (LLM — Sonnet)
  let payload;
  try {
    payload = await runBiancaBuilder(readerOutput);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[bianca-02] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      notes: `Builder error: ${msg}`,
    };
  }

  // Bianca-03: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runBiancaInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[bianca-03] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[bianca] run ${input.runId} — slide 2 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    notes: verdict.notes,
  };
}
