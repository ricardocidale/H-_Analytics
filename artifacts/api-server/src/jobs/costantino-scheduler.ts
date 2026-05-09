/**
 * Costantino scheduler — periodic Data Custodian audit.
 *
 * Self-rescheduling setTimeout chain (NOT setInterval) so the cadence can be
 * adjusted at runtime via the admin_resources parameter row
 * 'costantino-health-cycle-interval-ms'. The scheduler reads this row at the
 * start of every cycle, clamps to [DEFAULT_MIN, DEFAULT_MAX], and uses the
 * default if the row is missing or malformed.
 *
 * Concurrency guard: a second tick that arrives while a cycle is running
 * is dropped (logged and skipped) — the next tick fires after the first
 * one finishes.
 */
import { storage } from "../storage";
import { logger } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import { runCostantinoCycle } from "../ai/costantino/agent";
import {
  COSTANTINO_CADENCE_PARAM_SLUG,
  DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS,
  DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS,
  DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS,
} from "@shared/constants";

let isRunning = false;
let nextTickHandle: NodeJS.Timeout | null = null;
let stopped = false;

/**
 * Read the runtime-editable cadence row, clamp to [min, max], and fall
 * back to the compile-time default on any error or invalid value.
 */
async function resolveCadenceMs(): Promise<number> {
  try {
    const row = await storage.getAdminResourceBySlug?.("parameter", COSTANTINO_CADENCE_PARAM_SLUG);
    const cfg = row?.config as Record<string, unknown> | undefined;
    const raw = cfg?.value_ms;
    const ms = typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? raw
      : DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS;
    const minRaw = cfg?.min_ms;
    const maxRaw = cfg?.max_ms;
    const min = typeof minRaw === "number" && minRaw > 0 ? minRaw : DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS;
    const max = typeof maxRaw === "number" && maxRaw > 0 ? maxRaw : DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS;
    return Math.max(min, Math.min(max, ms));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[costantino-scheduler] Failed to resolve cadence: ${msg}. Using default.`);
    return DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS;
  }
}

async function tick(): Promise<void> {
  if (stopped) return;
  if (isRunning) {
    logger.info("[costantino-scheduler] Skipping tick — previous cycle still running.");
    scheduleNext();
    return;
  }
  isRunning = true;
  try {
    logger.info("[costantino-scheduler] Cycle starting.");
    const result = await runCostantinoCycle();
    await recordSchedulerCycle({
      key: "costantino-data-custodian",
      considered: result.metrics.resourcesConsidered,
      succeeded: result.metrics.probesOk,
      failed: result.metrics.probesFailed,
      status: result.status,
      notes: truncateNotes(result.notes),
      durationMs: result.durationMs,
    });
    logger.info(
      `[costantino-scheduler] Cycle complete in ${result.durationMs}ms — ${result.notes}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[costantino-scheduler] Cycle threw: ${msg}`);
    await recordSchedulerCycle({
      key: "costantino-data-custodian",
      considered: 0,
      succeeded: 0,
      failed: 0,
      status: "error",
      notes: truncateNotes(`cycle threw: ${msg}`),
    });
  } finally {
    isRunning = false;
    scheduleNext();
  }
}

function scheduleNext(): void {
  if (stopped) return;
  if (nextTickHandle) {
    clearTimeout(nextTickHandle);
    nextTickHandle = null;
  }
  resolveCadenceMs()
    .then((cadence) => {
      if (stopped) return;
      logger.info(`[costantino-scheduler] Next cycle in ${cadence}ms.`);
      nextTickHandle = setTimeout(() => {
        void tick();
      }, cadence);
      // Don't keep the event loop alive purely for this scheduler.
      nextTickHandle.unref?.();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[costantino-scheduler] scheduleNext failed: ${msg}`);
    });
}

/**
 * Boot the Costantino scheduler. Defers the first cycle by one cadence so
 * server startup isn't blocked by a long agentic run.
 */
export function startCostantinoScheduler(): void {
  stopped = false;
  logger.info("[costantino-scheduler] Starting Data Custodian scheduler.");
  scheduleNext();
}

/** Test-only / shutdown helper. */
export function stopCostantinoScheduler(): void {
  stopped = true;
  if (nextTickHandle) {
    clearTimeout(nextTickHandle);
    nextTickHandle = null;
  }
}

/** Exposed for the SCHEDULER_DISPATCH "Run now" button and the dry-cycle script. */
export { runCostantinoCycle };
