import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import {
  SCHEDULER_REGISTRY,
  SCHEDULER_DISPATCH,
  type SchedulerKey,
} from "../../jobs/scheduler-run-tracker";
import { logger } from "../../logger";
import { SCHEDULER_HISTORY_STRIP } from "@shared/schema";

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
      const [rows, historyRows] = await Promise.all([
        storage.listSchedulerRuns(),
        // Task #558 — recent-runs strip: latest N cycles per scheduler.
        storage.listSchedulerRunHistory({ limitPerScheduler: SCHEDULER_HISTORY_STRIP }),
      ]);
      const byKey = new Map(rows.map((r) => [r.schedulerKey, r] as const));

      // Bucket history rows by schedulerKey so we can attach a small array
      // to each row in registry order. listSchedulerRunHistory already
      // returns per-scheduler chunks ordered DESC, so this preserves that.
      const historyByKey = new Map<string, Array<{
        ranAt: string;
        status: "ok" | "warn" | "error";
        considered: number;
        succeeded: number;
        failed: number;
        durationMs: number | null;
        notes: string | null;
      }>>();
      for (const h of historyRows) {
        const list = historyByKey.get(h.schedulerKey) ?? [];
        const ranAtIso = h.ranAt instanceof Date
          ? h.ranAt.toISOString()
          : new Date(h.ranAt as unknown as string).toISOString();
        list.push({
          ranAt: ranAtIso,
          status: h.status as "ok" | "warn" | "error",
          considered: h.considered,
          succeeded: h.succeeded,
          failed: h.failed,
          durationMs: h.durationMs,
          notes: h.notes,
        });
        historyByKey.set(h.schedulerKey, list);
      }

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
          recentRuns: historyByKey.get(entry.key) ?? [],
        };
      });
      res.json({ runs, staleMultiplier: 2, recentRunsLimit: SCHEDULER_HISTORY_STRIP });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scheduler runs", error);
    }
  });

  // Task #556 — admin "Run now" button. Triggers one cycle of the named
  // scheduler immediately, instead of waiting up to 24h for the next tick.
  // The cycle runs in the background (fire-and-forget) so the request
  // returns promptly even for long-running cycles like the nightly
  // specialist-quality recompute. Each cycle function records its own
  // `scheduler_runs` row, which the GET endpoint above will surface on
  // the next refetch. Concurrent clicks are debounced by the per-scheduler
  // `isRunning` guards inside each cycle function.
  app.post("/api/admin/scheduler-runs/:key/run", requireAdmin, async (req, res) => {
    const key = req.params.key;
    const dispatcher = SCHEDULER_DISPATCH[key as SchedulerKey];
    const def = SCHEDULER_REGISTRY.find((s) => s.key === key);
    if (!dispatcher || !def) {
      res.status(404).json({ error: `Unknown scheduler: ${key}` });
      return;
    }
    // Fire-and-forget. Errors are recorded by the cycle's own
    // `recordSchedulerCycle` call (status: "error"); we additionally log
    // here so an admin click that fails is visible in the server log.
    void Promise.resolve()
      .then(() => dispatcher())
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[observability] Run-now failed for ${key}: ${msg}`);
      });
    res.status(202).json({ accepted: true, schedulerKey: key, schedulerLabel: def.label });
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
