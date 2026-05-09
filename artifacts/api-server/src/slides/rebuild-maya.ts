/**
 * rebuild-maya.ts
 *
 * After a Franco rebuild, re-run Maya for every slide that has at least one
 * slot entry in `luccaDraft` with `source === "admin-override"`. Slides whose
 * slots were not overridden by an admin keep their existing verdicts untouched.
 *
 * This module is called by the rebuild route after writing the new deckR2Key
 * so the deck is downloadable even if Maya is slow or fails. Maya failures per
 * slide are non-fatal: logged as a warning, then execution continues to the
 * next slide.
 *
 * Per CLAUDE.md §4 / ADR-007 §1 — no calc/engine imports; all DB I/O is done
 * via storage helpers passed from the route layer indirectly through the
 * storage module.
 */

import {
  getSlideFactoryRunById,
  updateAgentResult,
} from "../storage/slide-factory-runs";
import type { SlideAgentResult } from "../storage/slide-factory-runs";
import { buildFactoryPayload } from "./build-factory-payload";
import { runMaya } from "./maya";
import { logger } from "../logger";
import type { SlideNumber } from "./swarms/types";

/** Slide numbers supported by the factory pipeline. */
const ALL_SLIDE_NUMBERS: SlideNumber[] = [1, 2, 3, 4, 5, 6];

/**
 * Re-run Maya for every slide that has at least one `admin-override` slot in
 * `run.luccaDraft`. Preserves existing Dino pixelDiffPct and approvedAt on
 * each updated result. One Maya failure does not stop others.
 */
export async function runMayaForOverriddenSlides(runId: number): Promise<void> {
  const run = await getSlideFactoryRunById(runId);
  if (!run) {
    logger.warn(`[rebuild-maya] run ${runId} not found — skipping Maya pass`, "slide-factory");
    return;
  }

  const luccaDraft = run.luccaDraft ?? {};

  // Collect slide prefixes that have at least one admin-override slot.
  const affectedSlideNumbers = ALL_SLIDE_NUMBERS.filter((n) => {
    const prefix = `slide${n}.`;
    return Object.entries(luccaDraft).some(
      ([key, draft]) =>
        key.startsWith(prefix) &&
        draft !== null &&
        typeof draft === "object" &&
        (draft as { source?: string }).source === "admin-override",
    );
  });

  if (affectedSlideNumbers.length === 0) {
    logger.info(
      `[rebuild-maya] run ${runId}: no admin-override slots found — skipping Maya pass`,
      "slide-factory",
    );
    return;
  }

  logger.info(
    `[rebuild-maya] run ${runId}: running Maya for slides ${affectedSlideNumbers.join(", ")}`,
    "slide-factory",
  );

  // Build DeckPayloadV2 once — each slide extracts its sub-payload from it.
  const deckPayload = buildFactoryPayload(run);

  for (const slideN of affectedSlideNumbers) {
    try {
      const slideKey = `slide${slideN}` as keyof typeof deckPayload;
      const perSlidePayload = deckPayload[slideKey] as unknown;

      const prefix = `slide${slideN}.`;
      const slotDrafts = Object.fromEntries(
        Object.entries(luccaDraft).filter(([k]) => k.startsWith(prefix)),
      );

      const result = await runMaya(slideN, perSlidePayload, slotDrafts);

      // Retrieve existing result to preserve Dino pixelDiffPct and approvedAt.
      const existingResults = (run.agentResults ?? {}) as Record<string, SlideAgentResult>;
      const existingResult: SlideAgentResult = existingResults[`slide${slideN}`] ?? {
        status: "pending",
        pixelDiffPct: null,
        mayaVerdict: null,
        mayaNotes: null,
        approvedAt: null,
        errorMessage: null,
      };

      await updateAgentResult(runId, slideN, {
        status: "approved",
        pixelDiffPct: existingResult.pixelDiffPct,
        mayaVerdict: result.verdict,
        mayaNotes: result.notes ?? null,
        approvedAt: existingResult.approvedAt,
        errorMessage: null,
      });

      logger.info(
        `[rebuild-maya] run ${runId} slide${slideN}: Maya verdict=${result.verdict}`,
        "slide-factory",
      );
    } catch (err) {
      logger.warn(
        `[rebuild-maya] run ${runId} slide${slideN}: Maya failed (non-fatal) — ${String(err)}`,
        "slide-factory",
      );
    }
  }
}
