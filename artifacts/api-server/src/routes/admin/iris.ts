import type { Express } from "express";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import { logAndSendError, sendError } from "../helpers";
import { logger } from "../../logger";
import { runIrisAgent } from "../../ai/iris/agent";
import { readIrisGaps, clearIrisGaps } from "../../ai/iris/workspace";
import { capErrors, IRIS_HEALTH_SUMMARY_MAX_ERRORS } from "../../ai/iris/format";
import { insertIrisRun, updateIrisRun, getLatestIrisRun } from "../../storage/iris-runs";
import { HTTP_400_BAD_REQUEST, HTTP_409_CONFLICT } from "../../constants";

// In-process concurrency guard for Iris runs.
// Eliminates the TOCTOU window that exists between the async DB check and the
// async insertIrisRun write on single-instance deployments. A DB advisory lock
// would be needed for multi-instance deployments; H+ Analysis runs as a
// single Docker container so this boolean is sufficient for the common case.
let irisRunInProgress = false;

const IRIS_TRIGGER_VALUES = [
  "manual",
  "scheduled-health",
  "scheduled-reindex",
  "gap-signal",
] as const;

const triggerBodySchema = z.object({
  trigger: z.enum(IRIS_TRIGGER_VALUES).default("manual"),
});

export function registerIrisRoutes(app: Express) {
  /**
   * POST /api/admin/iris/run
   * Trigger an Iris agent run. Returns immediately with the new run id;
   * the agent runs in the background and updates the row on completion.
   */
  app.post("/api/admin/iris/run", requireAdmin, async (req, res) => {
    const parsed = triggerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, HTTP_400_BAD_REQUEST, "Invalid request body");
    }

    const { trigger } = parsed.data;

    // Fast synchronous in-process check — closes the TOCTOU window for
    // concurrent requests on the same server instance.
    if (irisRunInProgress) {
      return sendError(res, HTTP_409_CONFLICT, "An Iris run is already in progress");
    }

    // DB guard: catches the case where the flag was cleared by a restart
    // but the DB still shows a run as "running" (e.g., after a crash).
    try {
      const latest = await getLatestIrisRun();
      if (latest?.status === "running") {
        return sendError(res, HTTP_409_CONFLICT, "An Iris run is already in progress");
      }
    } catch (error: unknown) {
      return logAndSendError(res, "Failed to check Iris run status", error);
    }

    irisRunInProgress = true;

    let run;
    try {
      run = await insertIrisRun({ trigger, status: "running" });
    } catch (error: unknown) {
      irisRunInProgress = false;
      return logAndSendError(res, "Failed to create Iris run record", error);
    }

    const runId = run.id;
    const startTs = Date.now();

    // Fire-and-forget: launch the agent without awaiting
    void runIrisAgent(trigger)
      .then((result) =>
        updateIrisRun(runId, {
          status: "completed",
          modelUsed: result.model,
          chunksIndexed: result.chunksIndexed,
          errorsEncountered: result.errorsEncountered,
          durationMs: result.durationMs,
          healthSummary: {
            summary: result.summary,
            toolsInvoked: result.toolsInvoked,
            runId: result.runId,
            errors: capErrors(result.errors, IRIS_HEALTH_SUMMARY_MAX_ERRORS),
          },
        }),
      )
      .catch((err: unknown) => {
        const durationMs = Date.now() - startTs;
        logger.error(
          `Iris run ${runId} failed: ${err instanceof Error ? err.message : String(err)}`,
          "iris",
        );
        return updateIrisRun(runId, {
          status: "error",
          durationMs,
          healthSummary: { error: String(err) },
        }).catch((updateErr: unknown) => {
          logger.error(
            `Failed to update Iris run ${runId} to error status: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
            "iris",
          );
        });
      })
      .finally(() => {
        irisRunInProgress = false;
      });

    res.json({ runId, status: "started" });
  });

  /**
   * GET /api/admin/iris/status
   * Returns the last Iris run and the current gaps count.
   */
  app.get("/api/admin/iris/status", requireAdmin, async (_req, res) => {
    try {
      const [lastRun, gaps] = await Promise.all([
        getLatestIrisRun(),
        readIrisGaps(),
      ]);
      res.json({ lastRun, gapsCount: gaps.length });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch Iris status", error);
    }
  });

  /**
   * DELETE /api/admin/iris/gaps
   * Clears the iris/gaps.md file.
   */
  app.delete("/api/admin/iris/gaps", requireAdmin, async (_req, res) => {
    try {
      await clearIrisGaps();
      res.json({ cleared: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to clear Iris gaps", error);
    }
  });
}
