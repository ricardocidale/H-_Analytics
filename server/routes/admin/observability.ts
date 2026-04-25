import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import { SCHEDULER_REGISTRY } from "../../jobs/scheduler-run-tracker";

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
}
