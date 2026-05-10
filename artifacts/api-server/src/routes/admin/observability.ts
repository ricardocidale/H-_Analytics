import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import {
  SCHEDULER_REGISTRY,
  SCHEDULER_DISPATCH,
  SCHEDULER_STALE_MULTIPLIER,
  type SchedulerKey,
} from "../../jobs/scheduler-run-tracker";
import { logger } from "../../logger";
import { SCHEDULER_HISTORY_STRIP } from "@workspace/db";
import { HTTP_202_ACCEPTED } from "../../constants";

// ---------------------------------------------------------------------------
// Check-timing history helpers (mirrors scripts/src/lib/check-trend.ts so
// the admin UI uses exactly the same p75 / regression logic as the CLI report)
// ---------------------------------------------------------------------------

const CHECK_TIMING_FILE = path.resolve(process.cwd(), ".cache/check-timing.jsonl");

/** Fraction above the p75 baseline that counts as a regression (20 %). */
const REGRESSION_THRESHOLD = 0.2;

/** Default number of prior runs used as the p75 baseline window. */
const TREND_WINDOW = 5;

/** Default number of recent runs to return. */
const CHECK_TIMING_DEFAULT_N = 20;

type TrendDirection = "up" | "down" | "flat" | "unknown";

function p75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, idx)];
}

function classifyTrend(priorWindow: number[], currentMs: number): TrendDirection {
  if (priorWindow.length === 0) return "unknown";
  const baseline = p75(priorWindow);
  if (baseline <= 0) return "unknown";
  const ratio = currentMs / baseline;
  if (ratio > 1 + REGRESSION_THRESHOLD) return "up";
  if (ratio < 1 - REGRESSION_THRESHOLD) return "down";
  return "flat";
}

interface CheckEntry {
  label: string;
  durationMs: number;
  slow: boolean;
  exitCode: number;
}

interface TimingRecord {
  ts: string;
  totalMs: number;
  passed: boolean;
  checks: CheckEntry[];
}

function loadTimingRecords(): TimingRecord[] {
  if (!fs.existsSync(CHECK_TIMING_FILE)) return [];
  const lines = fs.readFileSync(CHECK_TIMING_FILE, "utf8").split("\n").filter(Boolean);
  const records: TimingRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as TimingRecord);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

function computeLabelTrends(
  allRecords: TimingRecord[],
  labels: string[],
  trendWindow: number,
): Map<string, { direction: TrendDirection; latestMs: number | null; baselineP75: number | null; pctDelta: number | null }> {
  const result = new Map<string, { direction: TrendDirection; latestMs: number | null; baselineP75: number | null; pctDelta: number | null }>();

  for (const label of labels) {
    const durations: number[] = [];
    for (const rec of allRecords) {
      const entry = rec.checks.find((c) => c.label === label && c.exitCode === 0);
      if (entry) durations.push(entry.durationMs);
    }
    if (durations.length <= trendWindow) {
      result.set(label, { direction: "unknown", latestMs: durations.length > 0 ? durations[durations.length - 1] : null, baselineP75: null, pctDelta: null });
      continue;
    }
    const current = durations[durations.length - 1];
    const prior = durations.slice(-(trendWindow + 1), -1);
    const baseline = p75(prior);
    const direction = classifyTrend(prior, current);
    const pctDelta = baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : null;
    result.set(label, { direction, latestMs: current, baselineP75: baseline, pctDelta });
  }

  return result;
}

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
  // Task #1270 — per-check trend history for the admin Observability tab.
  // Reads .cache/check-timing.jsonl (same file the CLI timing report uses),
  // applies identical p75 trend logic, and returns the last N runs with
  // per-check durations and trend classifications.
  app.get("/api/admin/check-timing", requireAdmin, (req, res) => {
    try {
      const rawN = typeof req.query.n === "string" ? parseInt(req.query.n, 10) : NaN;
      const n = !isNaN(rawN) && rawN > 0 ? rawN : CHECK_TIMING_DEFAULT_N;

      const all = loadTimingRecords();

      if (all.length === 0) {
        res.json({ runs: [], labels: [], trends: {}, totalRecords: 0, trendWindow: TREND_WINDOW });
        return;
      }

      const displayed = all.slice(-n);

      const labelSet = new Set<string>();
      for (const rec of displayed) {
        for (const c of rec.checks) labelSet.add(c.label);
      }
      const labels = [...labelSet].sort();

      const trendMap = computeLabelTrends(all, labels, TREND_WINDOW);
      const trends: Record<string, { direction: TrendDirection; latestMs: number | null; baselineP75: number | null; pctDelta: number | null }> = {};
      for (const [label, data] of trendMap.entries()) {
        trends[label] = data;
      }

      const runs = displayed.map((rec) => {
        const byLabel: Record<string, { durationMs: number; slow: boolean; exitCode: number }> = {};
        for (const c of rec.checks) {
          byLabel[c.label] = { durationMs: c.durationMs, slow: c.slow, exitCode: c.exitCode };
        }
        return {
          ts: rec.ts,
          totalMs: rec.totalMs,
          passed: rec.passed,
          checks: byLabel,
        };
      });

      res.json({ runs, labels, trends, totalRecords: all.length, trendWindow: TREND_WINDOW });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to read check-timing history", error);
    }
  });

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
        const isStale = ageMs == null ? true : ageMs > cycleIntervalMs * SCHEDULER_STALE_MULTIPLIER;
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
      res.json({ runs, staleMultiplier: SCHEDULER_STALE_MULTIPLIER, recentRunsLimit: SCHEDULER_HISTORY_STRIP });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scheduler runs", error);
    }
  });

  // Task #1142 — per-run detail endpoint: returns the latest scheduler-run
  // record for a given key, plus per-workflow probe results for the
  // `research-workflows` key so the UnifiedRunsPage AnalystDetail panel
  // can show model output and error messages without opening a separate
  // Specialist admin page.
  app.get("/api/admin/scheduler-runs/:key/last-run", requireAdmin, async (req, res) => {
    try {
      const key = req.params.key;
      const rows = await storage.listSchedulerRuns();
      const row = rows.find((r) => r.schedulerKey === key);

      type WorkflowDetail = {
        workflowKey: string;
        name: string;
        lastRunStatus: string | null;
        lastRunError: string | null;
        lastRunAt: string | null;
        lastRunDurationMs: number | null;
      };
      let workflows: WorkflowDetail[] | undefined;

      if (key === "research-workflows") {
        const wfs = await storage.getScheduledResearchWorkflows();
        workflows = wfs
          .filter((w) => w.lastRunAt != null || w.lastRunStatus != null)
          .map((w) => ({
            workflowKey: w.workflowKey,
            name: w.name,
            lastRunStatus: w.lastRunStatus,
            lastRunError: w.lastRunError ?? null,
            lastRunAt: w.lastRunAt
              ? (w.lastRunAt instanceof Date
                  ? w.lastRunAt.toISOString()
                  : new Date(w.lastRunAt as unknown as string).toISOString())
              : null,
            lastRunDurationMs: w.lastRunDurationMs ?? null,
          }));
      }

      if (!row && !workflows) {
        res.status(404).json({ error: "No run data found for scheduler key" });
        return;
      }

      const lastRunAt = row?.lastRunAt
        ? (row.lastRunAt instanceof Date
            ? row.lastRunAt.toISOString()
            : new Date(row.lastRunAt as unknown as string).toISOString())
        : null;

      res.json({
        schedulerKey: key,
        schedulerLabel: row?.schedulerLabel ?? null,
        lastRunAt,
        status: row?.status ?? null,
        notes: row?.notes ?? null,
        durationMs: row?.durationMs ?? null,
        considered: row?.considered ?? null,
        succeeded: row?.succeeded ?? null,
        failed: row?.failed ?? null,
        ...(workflows !== undefined ? { workflows } : {}),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scheduler run detail", error);
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
    res.status(HTTP_202_ACCEPTED).json({ accepted: true, schedulerKey: key, schedulerLabel: def.label });
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
