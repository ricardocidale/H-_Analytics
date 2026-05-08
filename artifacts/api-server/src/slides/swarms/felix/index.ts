/**
 * Felix swarm team — Slide 6 (10-year USALI Income Statement).
 *
 * Orchestrates the expanded-to-5 exception:
 *   Felix-01 (aggregator) — deterministic: processes financial data with USALI mode
 *   Felix-02 (builder)    — Sonnet LLM: assembles Slide6Payload from slotDrafts
 *   Felix-03 (validator)  — deterministic: validates aggregated data structure
 *   Felix-04 (formatter)  — deterministic: applies USALI formatting labels
 *   Felix-05 (inspector)  — Hybrid: Zod Pass 1 + Opus vision Pass 2
 *
 * The expanded structure exists because USALI row-mapping + multi-year
 * aggregation + validate-before-format ordering cannot collapse to a triad
 * without losing the validate-gates-format invariant. See
 * docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md
 * for the exception structure.
 *
 * Slide content: USALI 10-year income statement aggregate; income statement
 * table is fully deterministic. The only authored slot is an optional
 * disclaimer (human-only).
 */
import { logger } from "../../../logger";
import type { SlideTeamInput, SlideTeamOutput } from "../types";
import { runFelixAggregate } from "./aggregate";
import { runFelixValidate } from "./validate";
import { runFelixFormat } from "./format";
import { runFelixBuilder } from "./builder";
import { runFelixInspector } from "./inspector";

export async function runFelixTeam(input: SlideTeamInput): Promise<SlideTeamOutput> {
  logger.info(`[felix] run ${input.runId} — starting slide 6 (expanded to 5)`, "slide-factory");

  // Felix-01: Aggregator (deterministic)
  const agg = runFelixAggregate(input.financialInputs);

  // Felix-03: Validator (deterministic) — must pass before formatting or building
  const validResult = runFelixValidate(agg);
  if (!validResult.valid) {
    logger.warn(`[felix-03] validation block: ${validResult.error}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "block",
      payloadV2: null,
      notes: validResult.error,
    };
  }

  // Felix-04: Formatter (deterministic) — format validated aggregation
  runFelixFormat(agg);

  // Felix-02: Builder (LLM — Sonnet)
  let payload;
  try {
    payload = await runFelixBuilder(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[felix-02] builder failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: null,
      notes: `Builder error: ${msg}`,
    };
  }

  // Felix-05: Inspector (Hybrid)
  let verdict;
  try {
    verdict = await runFelixInspector(payload, input.canonicalPngKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[felix-05] inspector failed: ${msg}`, "slide-factory");
    return {
      slideNumber: input.slideNumber,
      status: "fail",
      payloadV2: payload,
      notes: `Inspector error: ${msg}`,
    };
  }

  logger.info(
    `[felix] run ${input.runId} — slide 6 ${verdict.status.toUpperCase()}`,
    "slide-factory",
  );

  return {
    slideNumber: input.slideNumber,
    status: verdict.status,
    payloadV2: payload,
    notes: verdict.notes,
  };
}
