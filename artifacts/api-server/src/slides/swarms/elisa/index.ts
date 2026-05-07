/**
 * Elisa swarm team — Slide 5 (Financial Snapshot / Transformation Plan).
 *
 * Orchestrates the Reader → Builder → Inspector triad:
 *   Elisa-01 (reader)    — deterministic input assembler
 *   Elisa-02 (builder)   — Sonnet LLM, maps Lucca drafts → Slide5Payload
 *   Elisa-03 (inspector) — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * Slide content: portfolio-level transformation narrative. Left panel has
 * an intro paragraph + before/after comparison table (Feature | Existing |
 * Proposed). Right panel financial snapshot is deterministic (not authored
 * by this team).
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runElisaReader } from "./reader";
import { runElisaBuilder } from "./builder";
import { runElisaInspector } from "./inspector";

export async function runElisaTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[elisa] run ${input.runId} — starting slide 5 triad`, "slide-factory");

  // Elisa-01: Reader (deterministic)
  const readerOutput = runElisaReader(input);

  // Elisa-02: Builder (LLM — Sonnet)
  let payload;
  try {
    payload = await runElisaBuilder(readerOutput);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[elisa-02] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      notes: `Builder error: ${msg}`,
    };
  }

  // Elisa-03: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runElisaInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[elisa-03] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[elisa] run ${input.runId} — slide 5 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    notes: verdict.notes,
  };
}
