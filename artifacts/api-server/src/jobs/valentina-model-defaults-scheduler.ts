/**
 * Valentina Model Defaults Scheduler — D3 continuous research.
 *
 * Runs Valentina's model-defaults research automatically on a quarterly
 * cadence (90 days) so proposed_* columns stay fresh without requiring
 * an admin to click the manual research button.
 *
 * Cadence guard: at startup the scheduler queries `scheduler_runs` for
 * the last recorded run. If it ran within the last 90 days, the first
 * cycle is deferred until the next eligible time rather than firing
 * again immediately. This means server restarts do not cause spurious
 * LLM spend.
 *
 * Feature-flag gate: if the `valentina-enabled` parameter row is not set
 * to 1, every cycle is a no-op. The admin enables the feature exactly
 * once; the scheduler honours it on every subsequent tick.
 *
 * Observability: every cycle (including skipped ones) records a row in
 * `scheduler_runs` via `recordSchedulerCycle` so the Admin → Observability
 * page can show "last ran, proposed N, skipped M".
 */

import { db } from "../db";
import { modelDefaults, schedulerRuns } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { storage } from "../storage";
import {
  runValentinaResearch,
  VALENTINA_ENABLED_PARAM,
  type ValentinaInputRow,
} from "../ai/valentina-model-defaults";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";

export const VALENTINA_SCHEDULER_KEY = "valentina-model-defaults";

// 90 days × 24h × 60min × 60s × 1000ms — quarterly cadence
const QUARTERLY_CADENCE_MS = 90 * 24 * 60 * 60 * 1000;

// Give migrations and seeds time to settle before first research tick.
const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes

let isRunning = false;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let schedulerTimeout: ReturnType<typeof setTimeout> | null = null;

/** Return the lastRunAt timestamp for this scheduler key, or null if never run. */
async function lastRunAt(): Promise<Date | null> {
  const rows = await db
    .select({ lastRunAt: schedulerRuns.lastRunAt })
    .from(schedulerRuns)
    .where(eq(schedulerRuns.schedulerKey, VALENTINA_SCHEDULER_KEY))
    .limit(1);
  return rows[0]?.lastRunAt ?? null;
}

export async function runValentinaModelDefaultsCycle(): Promise<{
  proposed: number;
  skipped: number;
  flagDisabled: boolean;
}> {
  if (isRunning) {
    logger.info(`[${VALENTINA_SCHEDULER_KEY}] Cycle already in progress — skipping`);
    return { proposed: 0, skipped: 0, flagDisabled: false };
  }
  isRunning = true;
  const cycleStart = Date.now();
  let proposed = 0;
  let skipped = 0;
  let flagDisabled = false;
  let cycleThrew = false;
  let errorMessage = "";

  try {
    // Feature-flag gate — same check as the manual admin route.
    const flagRow = await storage.getAdminResourceBySlug("parameter", VALENTINA_ENABLED_PARAM);
    const flagValue = (flagRow?.config as { value?: number } | undefined)?.value ?? 0;
    if (flagValue !== 1) {
      logger.info(`[${VALENTINA_SCHEDULER_KEY}] Feature flag disabled — skipping cycle`);
      flagDisabled = true;
      return { proposed: 0, skipped: 0, flagDisabled: true };
    }

    // Fetch seed rows from property and management_company categories.
    const rows = await db
      .select()
      .from(modelDefaults)
      .then((all) =>
        all.filter(
          (r) =>
            r.lastSetSource === "seed" &&
            ["property", "management_company"].includes(r.category),
        ),
      );

    if (rows.length === 0) {
      logger.info(`[${VALENTINA_SCHEDULER_KEY}] No eligible rows — skipping cycle`);
      return { proposed: 0, skipped: 0, flagDisabled: false };
    }

    const inputRows: ValentinaInputRow[] = rows.map((r) => ({
      id: r.id,
      defaultKey: r.defaultKey,
      label: r.label,
      unit: r.unit ?? null,
      value: r.value,
      category: r.category,
      subTab: r.subTab,
    }));

    const proposals = await runValentinaResearch(inputRows);

    for (const proposal of proposals) {
      if (proposal.skipped) {
        skipped++;
        continue;
      }

      await db
        .update(modelDefaults)
        .set({
          proposedValue: proposal.proposedValue as never,
          proposedRangeLow: proposal.proposedRangeLow as never,
          proposedRangeHigh: proposal.proposedRangeHigh as never,
          proposedAuthority: proposal.proposedAuthority ?? null,
          proposedReferenceUrl: proposal.proposedReferenceUrl ?? null,
          proposedConviction: proposal.proposedConviction ?? null,
          proposedAt: new Date(),
        })
        .where(eq(modelDefaults.id, proposal.id));

      proposed++;
    }

    logger.info(`[${VALENTINA_SCHEDULER_KEY}] Cycle complete — proposed ${proposed}, skipped ${skipped}`);
    return { proposed, skipped, flagDisabled: false };
  } catch (err: unknown) {
    cycleThrew = true;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[${VALENTINA_SCHEDULER_KEY}] Cycle failed: ${errorMessage}`);
    return { proposed, skipped, flagDisabled };
  } finally {
    isRunning = false;
    void recordSchedulerCycle({
      key: VALENTINA_SCHEDULER_KEY,
      considered: proposed + skipped,
      succeeded: proposed,
      failed: cycleThrew ? 1 : 0,
      status: cycleThrew ? "error" : proposed > 0 ? "ok" : "warn",
      notes: cycleThrew
        ? truncateNotes(errorMessage)
        : flagDisabled
          ? "Feature flag disabled"
          : truncateNotes(`proposed ${proposed}, skipped ${skipped}`),
      durationMs: Date.now() - cycleStart,
    });
  }
}

/** Schedule the next cycle delay and return the timeout handle. */
function scheduleNextCycle(): ReturnType<typeof setTimeout> {
  return setTimeout(async () => {
    schedulerTimeout = null;
    try {
      await runValentinaModelDefaultsCycle();
    } catch (err: unknown) {
      logger.error(
        `[${VALENTINA_SCHEDULER_KEY}] Periodic cycle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Re-schedule after each run so the next run is always QUARTERLY_CADENCE_MS
    // from the CURRENT run, not from server start.
    schedulerTimeout = scheduleNextCycle();
  }, QUARTERLY_CADENCE_MS);
}

export async function startValentinaModelDefaultsScheduler(): Promise<void> {
  logger.info(`[${VALENTINA_SCHEDULER_KEY}] Starting quarterly Valentina research scheduler`);

  startupTimeout = setTimeout(async () => {
    startupTimeout = null;

    // Cadence guard: check when we last ran and delay accordingly.
    let initialDelayMs = 0;
    try {
      const last = await lastRunAt();
      if (last) {
        const elapsedMs = Date.now() - last.getTime();
        if (elapsedMs < QUARTERLY_CADENCE_MS) {
          initialDelayMs = QUARTERLY_CADENCE_MS - elapsedMs;
          const daysUntil = Math.ceil(initialDelayMs / (24 * 60 * 60 * 1000));
          logger.info(
            `[${VALENTINA_SCHEDULER_KEY}] Last run was ${Math.floor(elapsedMs / (24 * 60 * 60 * 1000))}d ago — next run in ~${daysUntil}d`,
          );
        }
      }
    } catch (err: unknown) {
      // Best-effort — if we can't read last run, proceed immediately.
      logger.warn(
        `[${VALENTINA_SCHEDULER_KEY}] Could not read last run time: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (initialDelayMs > 0) {
      // Defer the first cycle; periodic cycles are scheduled from within
      // scheduleNextCycle after each run completes.
      schedulerTimeout = setTimeout(async () => {
        schedulerTimeout = null;
        try {
          await runValentinaModelDefaultsCycle();
        } catch (err: unknown) {
          logger.error(
            `[${VALENTINA_SCHEDULER_KEY}] Deferred initial cycle failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        schedulerTimeout = scheduleNextCycle();
      }, initialDelayMs);
    } else {
      // Run immediately, then schedule quarterly repeats.
      try {
        await runValentinaModelDefaultsCycle();
      } catch (err: unknown) {
        logger.error(
          `[${VALENTINA_SCHEDULER_KEY}] Initial cycle failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      schedulerTimeout = scheduleNextCycle();
    }
  }, STARTUP_DELAY_MS);
}

export function stopValentinaModelDefaultsScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  logger.info(`[${VALENTINA_SCHEDULER_KEY}] Stopped`);
}
