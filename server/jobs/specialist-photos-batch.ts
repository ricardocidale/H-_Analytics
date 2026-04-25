/**
 * Task #433 — Scheduled batch dispatch of the Photos & Renders specialist
 * (`photos.photo-enhancer`, persona Fernanda).
 *
 * What this job does on every cycle:
 *   1. Read `specialist_configs.runtimeConfig` for `photos.photo-enhancer`
 *      and look for a `batchSchedule` block. When absent or
 *      `enabled !== true` the cycle no-ops (admins enable it explicitly
 *      from the Specialist page, so a fresh install never starts
 *      generating renders unattended).
 *   2. Resolve the target property list — either an explicit
 *      `propertyIds` array or `"all"` to fan out across every property
 *      visible to the admin (capped by `maxPerCycle` so an oversized
 *      portfolio can't blow through the shared `generate-image` rate
 *      limit in one tick).
 *   3. Dispatch the engine evaluator
 *      (`evaluatePhotoEnhancerSpecialist`) — the same code path the
 *      manual `/api/specialists/photo-enhancer/dispatch` endpoint and
 *      future orchestrator steps use. The evaluator reads the admin
 *      promptTemplate / modelResourceId from the same config row.
 *   4. Record the cycle into `scheduler_runs` so the Observability page
 *      shows a row whose stale-warning kicks in at 2× the configured
 *      interval (matches the convention every other registered scheduler
 *      uses).
 *
 * Concurrency: a guard prevents two cycles from overlapping — a slow
 * Replicate call must not stack a second batch behind it. A manual
 * dispatch from the route is independent (different code path, but the
 * shared `generate-image` rate-limit bucket throttles it just as
 * tightly).
 *
 * Scheduling: hooked from `server/index.ts`. Polls `runtimeConfig` on
 * every cycle so the admin can re-tune `intervalHours` without a server
 * restart — the next tick honors the new value.
 */

import { storage } from "../storage";
import { logger, log as serverLog } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import {
  evaluatePhotoEnhancerSpecialist,
  type PhotoEnhancerBatchSummary,
} from "../../engine/analyst/surface/photos/photo-enhancer-evaluator";
import {
  PHOTO_ENHANCER_SPECIALIST_ID,
  PHOTO_ENHANCER_STYLES,
  type PhotoEnhancerStyle,
} from "../services/photo-enhancer-pipeline";

const SOURCE = "specialist-photos-batch-scheduler";

// Default interval the scheduler polls the config row at — the admin's
// `intervalHours` is checked relative to this tick, so a 6h cadence means
// "fire on whichever 30-minute tick falls past the 6h threshold".
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const STARTUP_DELAY_MS = 90 * 1000; // let migrations + other schedulers settle
const DEFAULT_MAX_PER_CYCLE = 10;
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 24 * 7;

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let lastDispatchAt: number | null = null;

interface BatchScheduleConfig {
  enabled: boolean;
  intervalHours: number;
  maxPerCycle: number;
  style: PhotoEnhancerStyle;
  prompt: string;
  /** Explicit list — wins over `"all"`. Empty/absent ⇒ check `targetMode`. */
  propertyIds: number[] | null;
  /** When `propertyIds` is null, `"all"` fans out across the admin portfolio. */
  targetMode: "explicit" | "all";
}

function isPhotoEnhancerStyle(value: unknown): value is PhotoEnhancerStyle {
  return typeof value === "string"
    && (PHOTO_ENHANCER_STYLES as readonly string[]).includes(value);
}

/**
 * Parse and clamp the batchSchedule block out of `runtimeConfig`. Anything
 * malformed falls back to a safe disabled-default — a corrupt config row
 * must not start firing renders.
 */
export function parseBatchScheduleConfig(
  runtimeConfig: Record<string, unknown> | null | undefined,
): BatchScheduleConfig {
  const block = runtimeConfig && typeof runtimeConfig === "object"
    ? (runtimeConfig as Record<string, unknown>).batchSchedule
    : null;
  if (!block || typeof block !== "object") {
    return {
      enabled: false,
      intervalHours: 24,
      maxPerCycle: DEFAULT_MAX_PER_CYCLE,
      style: "standard",
      prompt: "",
      propertyIds: null,
      targetMode: "explicit",
    };
  }
  const obj = block as Record<string, unknown>;
  const intervalRaw = Number(obj.intervalHours);
  const intervalHours = Number.isFinite(intervalRaw) && intervalRaw > 0
    ? Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, intervalRaw))
    : 24;
  const maxRaw = Number(obj.maxPerCycle);
  const maxPerCycle = Number.isFinite(maxRaw) && maxRaw > 0
    ? Math.min(50, Math.max(1, Math.floor(maxRaw)))
    : DEFAULT_MAX_PER_CYCLE;
  const style: PhotoEnhancerStyle = isPhotoEnhancerStyle(obj.style) ? obj.style : "standard";
  const prompt = typeof obj.prompt === "string" ? obj.prompt : "";
  const idsRaw = obj.propertyIds;
  const propertyIds = Array.isArray(idsRaw)
    ? idsRaw
        .map((v) => Number(v))
        .filter((n): n is number => Number.isInteger(n) && n > 0)
    : null;
  const targetMode: BatchScheduleConfig["targetMode"] = obj.targetMode === "all" ? "all" : "explicit";
  return {
    enabled: obj.enabled === true,
    intervalHours,
    maxPerCycle,
    style,
    prompt,
    propertyIds: propertyIds && propertyIds.length > 0 ? propertyIds : null,
    targetMode,
  };
}

/**
 * Resolve the property-id list to dispatch this cycle. `"all"` mode
 * pulls every non-archived admin-visible property and slices to
 * `maxPerCycle`; explicit mode honors the configured list (also sliced).
 */
async function resolveTargetIds(cfg: BatchScheduleConfig): Promise<number[]> {
  if (cfg.propertyIds && cfg.propertyIds.length > 0) {
    return cfg.propertyIds.slice(0, cfg.maxPerCycle);
  }
  if (cfg.targetMode !== "all") return [];
  const all = await storage.getAllPropertiesAdmin(false);
  return all.slice(0, cfg.maxPerCycle).map((p) => p.id);
}

export interface PhotosBatchCycleSummary extends PhotoEnhancerBatchSummary {
  /** False when the cycle short-circuited (disabled / not yet due / no targets). */
  dispatched: boolean;
  /** Reason a non-dispatch cycle ended — populated when `dispatched === false`. */
  skippedReason?: "disabled" | "interval-not-elapsed" | "no-targets";
}

/**
 * Check whether the scheduler should fire on this tick. Returns false when
 * the configured `intervalHours` has not elapsed since the last successful
 * dispatch (recorded in module-level `lastDispatchAt`).
 */
function intervalElapsed(intervalHours: number, now: number): boolean {
  if (lastDispatchAt === null) return true;
  return now - lastDispatchAt >= intervalHours * 60 * 60 * 1000;
}

export async function runPhotosBatchCycle(): Promise<PhotosBatchCycleSummary> {
  if (isRunning) {
    serverLog("Cycle already running, skipping tick", SOURCE, "warn");
    return {
      specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
      considered: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      style: "standard",
      promptTemplateApplied: false,
      modelResourceId: null,
      perProperty: [],
      dispatched: false,
      skippedReason: "interval-not-elapsed",
    };
  }
  isRunning = true;
  const cycleStart = Date.now();
  try {
    const config = await storage.getSpecialistConfig(PHOTO_ENHANCER_SPECIALIST_ID);
    const schedule = parseBatchScheduleConfig(config?.runtimeConfig ?? {});
    if (!schedule.enabled) {
      void recordSchedulerCycle({
        key: "specialist-photos-batch",
        considered: 0,
        succeeded: 0,
        failed: 0,
        status: "ok",
        notes: "disabled",
        durationMs: Date.now() - cycleStart,
      });
      return {
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
        considered: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        style: schedule.style,
        promptTemplateApplied: !!(config?.promptTemplate ?? "").trim(),
        modelResourceId: config?.modelResourceId ?? null,
        perProperty: [],
        dispatched: false,
        skippedReason: "disabled",
      };
    }
    if (!intervalElapsed(schedule.intervalHours, cycleStart)) {
      // Polling fires every 30 min; skip silently when admin's cadence is
      // longer than the poll. Don't write a scheduler_runs row for these
      // — they'd drown the Observability page.
      return {
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
        considered: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        style: schedule.style,
        promptTemplateApplied: !!(config?.promptTemplate ?? "").trim(),
        modelResourceId: config?.modelResourceId ?? null,
        perProperty: [],
        dispatched: false,
        skippedReason: "interval-not-elapsed",
      };
    }
    const targets = await resolveTargetIds(schedule);
    if (targets.length === 0) {
      void recordSchedulerCycle({
        key: "specialist-photos-batch",
        considered: 0,
        succeeded: 0,
        failed: 0,
        status: "warn",
        notes: "enabled but no target properties resolved",
        durationMs: Date.now() - cycleStart,
      });
      lastDispatchAt = cycleStart;
      return {
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
        considered: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        style: schedule.style,
        promptTemplateApplied: !!(config?.promptTemplate ?? "").trim(),
        modelResourceId: config?.modelResourceId ?? null,
        perProperty: [],
        dispatched: false,
        skippedReason: "no-targets",
      };
    }

    serverLog(
      `Dispatching Photos & Renders batch — ${targets.length} property(ies), style=${schedule.style}`,
      SOURCE,
    );
    const summary = await evaluatePhotoEnhancerSpecialist({
      propertyIds: targets,
      style: schedule.style,
      prompt: schedule.prompt,
      originatedFrom: "scheduled-batch",
      route: "scheduler:specialist-photos-batch",
    });
    lastDispatchAt = cycleStart;

    const status: "ok" | "warn" | "error" = summary.failed > 0
      ? (summary.succeeded > 0 ? "warn" : "error")
      : (summary.skipped > 0 ? "warn" : "ok");
    const noteParts: string[] = [];
    if (summary.skipped > 0) noteParts.push(`${summary.skipped} skipped`);
    if (summary.failed > 0) noteParts.push(`${summary.failed} failed`);
    void recordSchedulerCycle({
      key: "specialist-photos-batch",
      considered: summary.considered,
      succeeded: summary.succeeded,
      failed: summary.failed,
      status,
      notes: truncateNotes(noteParts.join(", ") || null),
      durationMs: Date.now() - cycleStart,
    });
    return { ...summary, dispatched: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Photos batch cycle failed: ${msg}`, SOURCE);
    void recordSchedulerCycle({
      key: "specialist-photos-batch",
      considered: 0,
      succeeded: 0,
      failed: 1,
      status: "error",
      notes: truncateNotes(msg),
      durationMs: Date.now() - cycleStart,
    });
    throw err;
  } finally {
    isRunning = false;
  }
}

export function startSpecialistPhotosBatchScheduler(): void {
  serverLog(
    `Starting — first poll in ${STARTUP_DELAY_MS / 1000}s, then every ${POLL_INTERVAL_MS / 60_000}min`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runPhotosBatchCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runPhotosBatchCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, POLL_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopSpecialistPhotosBatchScheduler(): void {
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

/** Test seam: reset module-level state between tests. */
export function __resetPhotosBatchStateForTest(): void {
  isRunning = false;
  lastDispatchAt = null;
}
