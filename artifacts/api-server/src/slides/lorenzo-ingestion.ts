/**
 * Lorenzo ingestion pipeline — Unit 3a stub.
 *
 * Implements the status flow: ingesting → ingested (or error).
 * Writes the existing canonical R2 PNG keys and a placeholder spec so that
 * downstream stages (Tab 3 property setup, Lucca, slide teams) can be
 * developed before real PDF extraction is wired in.
 *
 * Unit 3b will replace this stub with Lorenzo-01 (Aldo/pdfjs-dist) and
 * Lorenzo-02 (Bruno/Playwright PDF capture). Units 3c–3f will add Lorenzo-03
 * through Lorenzo-05 (vision + validation).
 */
import { logger } from "../logger";
import { updateSlideFactoryRun } from "../storage/slide-factory-runs";
import { CANONICAL_ASSETS } from "./canonical-assets";
import { TOTAL_SLIDES } from "./deck-render-constants";

function buildStubPngKeys(): string[] {
  return Array.from({ length: TOTAL_SLIDES }, (_, i) => CANONICAL_ASSETS.slide(i + 1, "png"));
}

export async function runLorenzoIngestion(runId: number): Promise<void> {
  try {
    await updateSlideFactoryRun(runId, {
      canonicalSpec: { stub: true, note: "Unit 3a placeholder — real extraction in 3b+" },
      canonicalPngKeys: buildStubPngKeys(),
      status: "ingested",
      startedAt: new Date(),
      completedAt: new Date(),
    });
    logger.info(`[lorenzo] run ${runId} ingested (stub)`, "slide-factory");
  } catch (err: unknown) {
    logger.error(`[lorenzo] run ${runId} ingestion failed: ${String(err)}`, "slide-factory");
    try {
      await updateSlideFactoryRun(runId, { status: "error" });
    } catch {
      // best-effort
    }
  }
}
