/**
 * Lorenzo ingestion pipeline — Unit 3b + Units 3c–3f.
 *
 * Status flow: ingesting → ingested (or error).
 *
 * Lorenzo-01: downloads canonical PDF from R2 and calls Aldo (minion) to
 *   extract a flat + per-slide word-level array of positioned text elements.
 *
 * Lorenzo-02: canonical PNGs are pre-rendered at stable R2 keys and do not
 *   need per-run regeneration. canonicalPngKeys references those paths.
 *
 * Lorenzo-03: vision reconciler — calls Opus 4.7 with each canonical PNG +
 *   the corresponding Aldo word elements; groups words into line-level blocks
 *   and enriches each block with font metrics and semantic metadata.
 *
 * Lorenzo-04: validation — Carlo (Zod) validates the enriched blocksBySlide
 *   array for type correctness and in-range values.
 *
 * Lorenzo-05: holistic inspector — calls Opus 4.7 with all 6 PNGs + the
 *   enriched spec and asks "could someone rebuild this deck from this spec?".
 *   Rejection gates the run at "error" status.
 */
import { logger } from "../logger";
import { updateSlideFactoryRun } from "../storage/slide-factory-runs";
import { getStorageProviderAsync } from "../providers/storage";
import { CANONICAL_ASSETS } from "./canonical-assets";
import { TOTAL_SLIDES } from "./deck-render-constants";
import { runAldo } from "./minions/aldo";
import { runCarlo } from "./minions/carlo";
import { runLorenzoVision } from "./lorenzo-vision";
import { runLorenzoInspector } from "./lorenzo-inspector";
import { LORENZO_SCHEMA_VERSION, CARLO_MAX_ERRORS_IN_MSG } from "./deck-render-constants";
import type { LorenzoCanonicalSpec } from "./canonical-spec-types";

function buildCanonicalPngKeys(): string[] {
  return Array.from({ length: TOTAL_SLIDES }, (_, i) => CANONICAL_ASSETS.slide(i + 1, "png"));
}

export async function runLorenzoIngestion(runId: number): Promise<void> {
  try {
    // Lorenzo-01: extract word-level primitives from canonical PDF via Aldo
    const storageProvider = await getStorageProviderAsync();
    const { buffer: pdfBuffer } = await storageProvider.downloadBuffer(CANONICAL_ASSETS.fullPdf);
    const aldoResult = await runAldo(pdfBuffer);

    logger.info(
      `[lorenzo-01] run ${runId} — ${aldoResult.elements.length} word elements across ${aldoResult.slideCount} slides`,
      "slide-factory",
    );

    // Lorenzo-02: canonical PNGs are pre-uploaded at invariant R2 keys
    const canonicalPngKeys = buildCanonicalPngKeys();

    // Lorenzo-03: vision enrichment — Opus 4.7 per-slide
    const blocksBySlide = await runLorenzoVision(aldoResult);

    // Lorenzo-04: Carlo schema validation
    const carloResult = runCarlo(blocksBySlide);
    if (!carloResult.valid) {
      const errorList = carloResult.blockingErrors.slice(0, CARLO_MAX_ERRORS_IN_MSG).join("; ");
      throw new Error(`Lorenzo-04/Carlo: ${carloResult.blockingErrors.length} blocking error(s): ${errorList}`);
    }
    if (carloResult.advisoryWarnings.length > 0) {
      logger.warn(
        `[lorenzo-04] ${carloResult.advisoryWarnings.length} advisory warning(s)`,
        "slide-factory",
      );
    }

    // Lorenzo-05: holistic inspector — Opus 4.7 with all 6 PNGs
    const inspectorVerdict = await runLorenzoInspector(blocksBySlide);

    if (!inspectorVerdict.approved) {
      throw new Error(
        `Lorenzo-05 rejected spec: ${inspectorVerdict.notes ?? "no detail provided"}`,
      );
    }

    const canonicalSpec: LorenzoCanonicalSpec = {
      schemaVersion: LORENZO_SCHEMA_VERSION,
      documentType: aldoResult.documentType,
      slideCount: aldoResult.slideCount,
      blocksBySlide,
      inspectorApproved: true,
      inspectorNotes: null,
    };

    await updateSlideFactoryRun(runId, {
      canonicalSpec,
      canonicalPngKeys,
      status: "ingested",
      completedAt: new Date(),
    });

    const totalBlocks = blocksBySlide.reduce((sum, s) => sum + s.length, 0);
    logger.info(
      `[lorenzo] run ${runId} ingested — ${totalBlocks} text blocks across ${aldoResult.slideCount} slides`,
      "slide-factory",
    );
  } catch (err: unknown) {
    logger.error(`[lorenzo] run ${runId} ingestion failed: ${String(err)}`, "slide-factory");
    try {
      await updateSlideFactoryRun(runId, { status: "error" });
    } catch {
      // best-effort
    }
  }
}
