/**
 * Weekly Vito compliance audit scheduler.
 *
 * Runs the Vito compliance audit once per week. Mirrors the pattern of
 * specialist-quality-recompute.ts: startup delay, then setInterval.
 * Concurrency-guarded via a simple boolean to prevent overlapping cycles.
 */
import { runVitoAgent } from "../ai/vito/agent";
import { log as serverLog } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";

const SOURCE = "vito-compliance-scheduler";

/** Cycle cadence — weekly. */
const VITO_CYCLE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Startup delay: let migrations, seeds, and other schedulers settle first. */
const VITO_STARTUP_DELAY_MS = 90 * 1000; // 90 seconds

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Run one full Vito compliance audit cycle.
 * Safe to call concurrently with itself — a second invocation no-ops while the
 * first is still in flight.
 */
export async function runVitoComplianceCycle(): Promise<void> {
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE);
    return;
  }
  isRunning = true;
  const cycleStart = Date.now();
  let cycleThrew = false;
  let cycleErrorMessage = "";
  let blockCount = 0;
  let warningCount = 0;
  let advisoryCount = 0;
  let violationTotal = 0;

  try {
    serverLog("Starting scheduled compliance audit", SOURCE);
    const result = await runVitoAgent("scheduled-audit");
    blockCount = result.blockCount;
    warningCount = result.warningCount;
    advisoryCount = result.advisoryCount;
    violationTotal =
      result.blockCount + result.warningCount + result.advisoryCount + result.infoCount;
    serverLog(
      `Cycle complete — ${violationTotal} violation(s) found (block=${blockCount} warning=${warningCount})`,
      SOURCE,
    );
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    serverLog(`Cycle failed: ${cycleErrorMessage}`, SOURCE, "error");
  } finally {
    isRunning = false;
    const status = cycleThrew ? "error" : blockCount > 0 || warningCount > 0 || advisoryCount > 0 ? "warn" : "ok";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : violationTotal > 0
        ? truncateNotes(`${violationTotal} violation(s) found (block=${blockCount} warning=${warningCount})`)
        : null;
    void recordSchedulerCycle({
      key: "vito-compliance-audit",
      considered: 1,
      succeeded: cycleThrew ? 0 : 1,
      failed: cycleThrew ? 1 : 0,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

export function startVitoComplianceScheduler(): void {
  serverLog(
    `Starting — initial audit in ${VITO_STARTUP_DELAY_MS / 1000}s, then every ${VITO_CYCLE_INTERVAL_MS / (24 * 60 * 60 * 1000)} day(s)`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runVitoComplianceCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runVitoComplianceCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, VITO_CYCLE_INTERVAL_MS);
  }, VITO_STARTUP_DELAY_MS);
}

export function stopVitoComplianceScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  serverLog("Stopped", SOURCE);
}
