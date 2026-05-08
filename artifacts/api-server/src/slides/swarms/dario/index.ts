/**
 * Dario swarm team — Slide 4 (Portfolio Overview).
 *
 * Orchestrates the collapsed-to-2 exception (no Reader):
 *   Dario-01 (builder)   — Sonnet LLM, reads slotDrafts directly → Slide4Payload
 *   Dario-02 (inspector) — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * Slide 4 content is fully deterministic (property cards, city/state, purchase
 * prices, acquisition statuses all come from live DB queries). The only authored
 * slot is the optional sectionSubtitle, which is human-only and never drafted
 * by Lucca. Because there is no editorial assembly work, no Reader step is
 * needed — the Builder reads slotDrafts directly. See
 * docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md
 * for the exception structure.
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runDarioBuilder } from "./builder";
import { runDarioInspector } from "./inspector";

export async function runDarioTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[dario] run ${input.runId} — starting slide 4 (collapsed to 2)`, "slide-factory");

  // Dario-01: Builder (LLM — Sonnet, reads SlideTeamInput directly)
  let payload;
  try {
    payload = await runDarioBuilder(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[dario-01] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      notes: `Builder error: ${msg}`,
    };
  }

  // Dario-02: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runDarioInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[dario-02] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[dario] run ${input.runId} — slide 4 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    notes: verdict.notes,
  };
}
