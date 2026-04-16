import { storage } from "../../storage";
import { fetchAllBenchmarks } from "./fetchers";
import { checkAllSources } from "../source-health-checker";
import { refreshLlmRegistry } from "../llm-registry-manager";
import { log } from "../../logger";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function runRefreshCycle(): Promise<{ upserted: number; errors: string[] }> {
  if (isRunning) return { upserted: 0, errors: ["Cycle already in progress"] };
  isRunning = true;

  try {
    const result = await fetchAllBenchmarks();

    let upserted = 0;
    for (const snapshot of result.snapshots) {
      try {
        await storage.upsertBenchmarkSnapshot(snapshot);
        upserted++;
      } catch (err: unknown) {
        result.errors.push(`DB upsert ${snapshot.snapshotKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (result.errors.length > 0) {
      log(`Refresh complete: ${upserted} upserted, ${result.errors.length} errors`, "ambient-scheduler", "warn");
      for (const err of result.errors.slice(0, 5)) {
        log(`  - ${err}`, "ambient-scheduler", "warn");
      }
    } else {
      log(`Refresh complete: ${upserted} benchmarks upserted`, "ambient-scheduler");
    }

    // Run source health checks after data refresh (non-blocking)
    try {
      const healthResults = await checkAllSources();
      const healthy = healthResults.filter(r => r.healthy).length;
      log(`Source health check: ${healthy}/${healthResults.length} healthy`, "ambient-scheduler");
    } catch (healthErr: unknown) {
      log(`Source health check failed (non-blocking): ${healthErr instanceof Error ? healthErr.message : String(healthErr)}`, "ambient-scheduler", "warn");
    }

    // LLM registry refresh — probe vendors, compute recommendations, alert admin (non-blocking)
    try {
      const registryState = await refreshLlmRegistry();
      log(`LLM registry: ${registryState.models.length} models, ${registryState.recommendations.length} recommendations, ${registryState.adminIssues.length} issues`, "ambient-scheduler");
    } catch (registryErr: unknown) {
      log(`LLM registry refresh failed (non-blocking): ${registryErr instanceof Error ? registryErr.message : String(registryErr)}`, "ambient-scheduler", "warn");
    }

    // The Analyst: staleness check + portfolio consistency (non-blocking)
    try {
      const { checkStaleness, checkPortfolioConsistency } = await import("../analyst-watchdog");
      const staleCount = await checkStaleness();
      const warnings = await checkPortfolioConsistency();
      if (staleCount > 0 || warnings.length > 0) {
        log(`Analyst watchdog: ${staleCount} stale properties, ${warnings.length} portfolio warnings`, "ambient-scheduler");
      }
    } catch (watchdogErr: unknown) {
      log(`Analyst watchdog failed (non-blocking): ${watchdogErr instanceof Error ? watchdogErr.message : String(watchdogErr)}`, "ambient-scheduler", "warn");
    }

    // Cleanup old page visit records (rolling 12 months)
    try {
      const cleaned = await storage.cleanupOldVisits(12);
      if (cleaned > 0) log(`Cleaned ${cleaned} old page visit records`, "ambient-scheduler");
    } catch (cleanErr: unknown) {
      log(`Page visit cleanup failed (non-blocking): ${cleanErr instanceof Error ? cleanErr.message : String(cleanErr)}`, "ambient-scheduler", "warn");
    }

    return { upserted, errors: result.errors };
  } finally {
    isRunning = false;
  }
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 10 * 1000;

export function startAmbientScheduler(): void {
  log(`Starting — initial refresh in ${STARTUP_DELAY_MS / 1000}s, then every ${REFRESH_INTERVAL_MS / 3600000}h`, "ambient-scheduler");

  startupTimeout = setTimeout(async () => {
    startupTimeout = null;
    try {
      await runRefreshCycle();
    } catch (err: unknown) {
      log(`Initial refresh failed: ${err instanceof Error ? err.message : String(err)}`, "ambient-scheduler", "error");
    }

    schedulerInterval = setInterval(async () => {
      try {
        await runRefreshCycle();
      } catch (err: unknown) {
        log(`Periodic refresh failed: ${err instanceof Error ? err.message : String(err)}`, "ambient-scheduler", "error");
      }
    }, REFRESH_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopAmbientScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  log("Stopped", "ambient-scheduler");
}

export { runRefreshCycle };
