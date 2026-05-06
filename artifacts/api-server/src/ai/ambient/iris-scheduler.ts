/**
 * Iris backstage agent scheduler.
 *
 * Runs the Iris agent on two independent cadences:
 *   • Daily health check  — light probe of workspace health state.
 *   • Weekly reindex      — full re-index of stale or missing chunks.
 *
 * Each cycle is guarded against concurrent execution: if a run is already
 * in progress (status "running" in `iris_runs`), the scheduled trigger is
 * skipped and the outcome is recorded with notes explaining the skip.
 *
 * Cycle outcomes are persisted via `recordSchedulerCycle` so the Admin →
 * Observability page can surface freshness and health dots for both keys.
 */

import { log } from "../../logger";
import { recordSchedulerCycle } from "../../jobs/scheduler-run-tracker";
import { runIrisAgent } from "../iris/agent";
import { getLatestIrisRun } from "../../storage/iris-runs";

// ---------------------------------------------------------------------------
// Named constants (Category 2 — DEFAULT VARIABLE, admin-controlled starting values)
// ---------------------------------------------------------------------------

/** Daily health-check cadence: 24 hours in ms (hours → ms derivation). */
const IRIS_HEALTH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h × 60m × 60s × 1000ms

/** Weekly reindex cadence: 7 days in ms (days → ms derivation). */
const IRIS_REINDEX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7d × 24h × 60m × 60s × 1000ms

/** Startup delay before the first health check fires: 30 seconds in ms (s → ms derivation). */
const IRIS_STARTUP_DELAY_MS = 30 * 1000; // 30s × 1000ms

// ---------------------------------------------------------------------------
// Module-level handle storage (cleared on stop)
// ---------------------------------------------------------------------------

let startupHandle: ReturnType<typeof setTimeout> | null = null;
let healthHandle: ReturnType<typeof setInterval> | null = null;
let reindexHandle: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Internal cycle runners
// ---------------------------------------------------------------------------

async function runHealthCycle(): Promise<void> {
  const cycleStart = Date.now();
  let succeeded = 0;
  let failed = 0;
  let status: "ok" | "warn" | "error" = "ok";
  let notes: string | null = null;

  try {
    // Concurrency guard: skip if a run is already in progress.
    const latest = await getLatestIrisRun();
    if (latest?.status === "running") {
      log("iris run already in progress — skipping scheduled health check", "iris-scheduler", "warn");
      notes = "iris run already in progress";
      status = "ok";
      succeeded = 0;
      failed = 0;
      void recordSchedulerCycle({
        key: "iris-health",
        considered: 1,
        succeeded: 0,
        failed: 0,
        status,
        notes,
        durationMs: Date.now() - cycleStart,
      });
      return;
    }

    const result = await runIrisAgent("scheduled-health");
    succeeded = 1;
    status = result.errorsEncountered > 0 ? "warn" : "ok";
    notes = `health check complete; ${result.chunksIndexed} chunk(s) indexed, ${result.errorsEncountered} error(s)`;
    log(`Iris health check complete: ${result.chunksIndexed} chunks indexed, ${result.errorsEncountered} errors`, "iris-scheduler");
  } catch (err: unknown) {
    failed = 1;
    status = "error";
    notes = err instanceof Error ? err.message : String(err);
    log(`Iris health check failed: ${notes}`, "iris-scheduler", "error");
  } finally {
    void recordSchedulerCycle({
      key: "iris-health",
      considered: 1,
      succeeded,
      failed,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

async function runReindexCycle(): Promise<void> {
  const cycleStart = Date.now();
  let succeeded = 0;
  let failed = 0;
  let status: "ok" | "warn" | "error" = "ok";
  let notes: string | null = null;

  try {
    // Concurrency guard: skip if a run is already in progress.
    const latest = await getLatestIrisRun();
    if (latest?.status === "running") {
      log("iris run already in progress — skipping scheduled reindex", "iris-scheduler", "warn");
      notes = "iris run already in progress";
      status = "ok";
      void recordSchedulerCycle({
        key: "iris-reindex",
        considered: 1,
        succeeded: 0,
        failed: 0,
        status,
        notes,
        durationMs: Date.now() - cycleStart,
      });
      return;
    }

    const result = await runIrisAgent("scheduled-reindex");
    succeeded = 1;
    status = result.errorsEncountered > 0 ? "warn" : "ok";
    notes = `reindex complete; ${result.chunksIndexed} chunk(s) indexed, ${result.errorsEncountered} error(s)`;
    log(`Iris reindex complete: ${result.chunksIndexed} chunks indexed, ${result.errorsEncountered} errors`, "iris-scheduler");
  } catch (err: unknown) {
    failed = 1;
    status = "error";
    notes = err instanceof Error ? err.message : String(err);
    log(`Iris reindex failed: ${notes}`, "iris-scheduler", "error");
  } finally {
    void recordSchedulerCycle({
      key: "iris-reindex",
      considered: 1,
      succeeded,
      failed,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startIrisScheduler(): void {
  log(
    `Starting — initial health check in ${IRIS_STARTUP_DELAY_MS / 1000}s, then every ${IRIS_HEALTH_INTERVAL_MS / (60 * 60 * 1000)}h; reindex every ${IRIS_REINDEX_INTERVAL_MS / (24 * 60 * 60 * 1000)}d`,
    "iris-scheduler",
  );

  startupHandle = setTimeout(async () => {
    startupHandle = null;
    try {
      await runHealthCycle();
    } catch (err: unknown) {
      log(`Initial health check failed: ${err instanceof Error ? err.message : String(err)}`, "iris-scheduler", "error");
    }

    healthHandle = setInterval(async () => {
      try {
        await runHealthCycle();
      } catch (err: unknown) {
        log(`Periodic health check failed: ${err instanceof Error ? err.message : String(err)}`, "iris-scheduler", "error");
      }
    }, IRIS_HEALTH_INTERVAL_MS);
  }, IRIS_STARTUP_DELAY_MS);

  // Reindex runs on its own independent weekly cadence, starting immediately
  // after the startup delay so the two cycles are phase-locked at startup.
  reindexHandle = setInterval(async () => {
    try {
      await runReindexCycle();
    } catch (err: unknown) {
      log(`Periodic reindex failed: ${err instanceof Error ? err.message : String(err)}`, "iris-scheduler", "error");
    }
  }, IRIS_REINDEX_INTERVAL_MS);
}

export function stopIrisScheduler(): void {
  if (startupHandle) {
    clearTimeout(startupHandle);
    startupHandle = null;
  }
  if (healthHandle) {
    clearInterval(healthHandle);
    healthHandle = null;
  }
  if (reindexHandle) {
    clearInterval(reindexHandle);
    reindexHandle = null;
  }
  log("Stopped", "iris-scheduler");
}
