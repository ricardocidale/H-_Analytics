/**
 * slide-factory-verification.ts — Bianca visual quality verification routes (T2-4)
 *
 * POST /api/slide-factory-runs/:id/verify
 *   Triggers Bianca verification on the run's PPTX. Updates the run row with
 *   verificationStatus and verificationLog. Returns the result immediately
 *   (synchronous — Bianca typically runs in 15–30 s).
 *
 * GET /api/slide-factory-runs/:id/verification
 *   Returns the last verification result for the run (null if not yet run).
 */
import { Router } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { logger } from "../logger";
import { parseRouteId, logActivity } from "./helpers";
import { getSlideFactoryRun, updateSlideFactoryRun } from "../storage/slide-factory-runs";
import { runBiancaVerification } from "../slides/bianca-verification";

const router = Router();

// ─── POST /api/slide-factory-runs/:id/verify ──────────────────────────────

router.post(
  "/api/slide-factory-runs/:id/verify",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;

    try {
      const runId = parseRouteId(req.params.id);
      if (!runId) {
        return res.status(400).json({ error: "Invalid run ID", code: "BVFY-001" });
      }

      const run = await getSlideFactoryRun(runId, userId);
      if (!run) {
        return res.status(404).json({ error: "Run not found", code: "BVFY-002" });
      }

      if (!run.pptxR2Key) {
        return res.status(422).json({
          error: "Run has no PPTX — verify requires a completed factory deck",
          code: "BVFY-003",
        });
      }

      // Mark running
      await updateSlideFactoryRun(runId, { verificationStatus: "running" });

      let result;
      try {
        result = await runBiancaVerification(run.pptxR2Key, String(runId));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[bianca] Verification failed for run ${runId}: ${message}`, "bianca-verification");
        await updateSlideFactoryRun(runId, {
          verificationStatus: "error",
          verificationLog: [
            {
              slideNumber: 0,
              severity: "block",
              category: "layout",
              description: `Verification failed: ${message}`,
            },
          ],
        });
        return res.status(500).json({ error: "Verification failed", detail: message, code: "BVFY-004" });
      }

      await updateSlideFactoryRun(runId, {
        verificationStatus: result.status,
        verificationLog: result.findings,
      });

      logActivity(req, "slide-factory-verify", "slide_factory_run", runId, undefined, {
        status: result.status,
        slideCount: result.slideCount,
        findings: result.findings.filter((f) => f.severity !== "ok").length,
      });

      res.json(result);
    } catch (error: unknown) {
      logger.error(`Slide factory verification route failed: ${error}`, "bianca-verification");
      res.status(500).json({ error: "Internal error", code: "BVFY-005" });
    }
  },
);

// ─── GET /api/slide-factory-runs/:id/verification ─────────────────────────

router.get(
  "/api/slide-factory-runs/:id/verification",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;

    try {
      const runId = parseRouteId(req.params.id);
      if (!runId) {
        return res.status(400).json({ error: "Invalid run ID", code: "BVFY-010" });
      }

      const run = await getSlideFactoryRun(runId, userId);
      if (!run) {
        return res.status(404).json({ error: "Run not found", code: "BVFY-011" });
      }

      res.json({
        runId,
        verificationStatus: run.verificationStatus ?? null,
        verificationLog: run.verificationLog ?? null,
      });
    } catch (error: unknown) {
      logger.error(`Slide factory verification GET failed: ${error}`, "bianca-verification");
      res.status(500).json({ error: "Internal error", code: "BVFY-012" });
    }
  },
);

export function register(app: { use: (router: Router) => void }) {
  app.use(router);
}

export { router as slideFactoryVerificationRoutes };
