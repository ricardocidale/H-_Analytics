import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import { SCHEDULER_REGISTRY } from "../../jobs/scheduler-run-tracker";

/**
 * Task #528 — How long after the last sweep we flag the drift panel as stale.
 *
 * The sweep workflow runs nightly (cron `0 9 * * *`), so a healthy run lands
 * roughly every 24h. 36h is "you've missed at least one nightly window" — long
 * enough to absorb a single retry/backoff but short enough that a paused
 * scheduler is visibly broken before the next deploy needs it.
 */
const STORAGE_DRIFT_SWEEP_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function registerObservabilityRoutes(app: Express) {
  app.get("/api/admin/scheduler-runs", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listSchedulerRuns();
      const byKey = new Map(rows.map((r) => [r.schedulerKey, r] as const));
      const runs = SCHEDULER_REGISTRY.map((entry) => {
        const row = byKey.get(entry.key);
        const lastRunAt = row?.lastRunAt
          ? (row.lastRunAt instanceof Date ? row.lastRunAt.toISOString() : new Date(row.lastRunAt as unknown as string).toISOString())
          : null;
        const cycleIntervalMs = row?.cycleIntervalMs != null
          ? Number(row.cycleIntervalMs)
          : entry.cycleIntervalMs;
        const ageMs = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
        const isStale = ageMs == null ? true : ageMs > cycleIntervalMs * 2;
        return {
          schedulerKey: entry.key,
          schedulerLabel: row?.schedulerLabel ?? entry.label,
          lastRunAt,
          considered: row?.considered ?? null,
          succeeded: row?.succeeded ?? null,
          failed: row?.failed ?? null,
          status: row?.status ?? null,
          notes: row?.notes ?? null,
          cycleIntervalMs,
          durationMs: row?.durationMs ?? null,
          isStale,
        };
      });
      res.json({ runs, staleMultiplier: 2 });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scheduler runs", error);
    }
  });

  // Task #528 — last storage-drift sweep result for the Observability panel.
  app.get("/api/admin/storage-drift-sweep", requireAdmin, async (_req, res) => {
    try {
      const row = await storage.getLastStorageDriftSweepRun();
      if (!row) {
        res.json({
          lastRun: null,
          staleAfterMs: STORAGE_DRIFT_SWEEP_STALE_AFTER_MS,
        });
        return;
      }
      const finishedAtIso =
        row.finishedAt instanceof Date
          ? row.finishedAt.toISOString()
          : new Date(row.finishedAt as unknown as string).toISOString();
      const ageMs = Date.now() - new Date(finishedAtIso).getTime();
      const isStale = ageMs > STORAGE_DRIFT_SWEEP_STALE_AFTER_MS;
      res.json({
        lastRun: {
          finishedAt: finishedAtIso,
          exitCode: row.exitCode,
          status: row.status,
          rewroteCount: row.rewroteCount,
          copiedCount: row.copiedCount,
          skippedCount: row.skippedCount,
          failedCount: row.failedCount,
          residualCount: row.residualCount,
          runId: row.runId,
          runUrl: row.runUrl,
          trigger: row.trigger,
          triggerReason: row.triggerReason,
          notes: row.notes,
          isStale,
        },
        staleAfterMs: STORAGE_DRIFT_SWEEP_STALE_AFTER_MS,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch last storage drift sweep", error);
    }
  });
}
