/**
 * Chiara swarm team — Slide 3 (Investment Model / Satellite Expansion).
 *
 * Orchestrates the Reader → Builder → Inspector triad:
 *   Chiara-01 (reader)    — deterministic input assembler
 *   Chiara-02 (builder)   — Sonnet LLM, maps Lucca drafts → Slide3Payload
 *   Chiara-03 (inspector) — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * Slide content: San Diego / Cartagena Duplex (Barrio San Diego, Cartagena,
 * Colombia). See attached_assets/canonical/briefs/Pasted-SLIDE-3-Cartagena-Duplex-...txt
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runChiaraReader } from "./reader";
import { runChiaraBuilder } from "./builder";
import { runChiaraInspector } from "./inspector";

export async function runChiaraTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[chiara] run ${input.runId} — starting slide 3 triad`, "slide-factory");

  // Chiara-01: Reader (deterministic)
  const readerOutput = runChiaraReader(input);

  // Chiara-02: Builder (LLM — Sonnet)
  let payload;
  try {
    payload = await runChiaraBuilder(readerOutput);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[chiara-02] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      notes: `Builder error: ${msg}`,
    };
  }

  // Chiara-03: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runChiaraInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[chiara-03] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[chiara] run ${input.runId} — slide 3 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    notes: verdict.notes,
  };
}
