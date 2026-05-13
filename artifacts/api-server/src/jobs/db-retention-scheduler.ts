/**
 * DB retention scheduler — DB audit fix 2026-05-14
 *
 * Two retention jobs triggered from a single daily scheduler:
 *
 * 1. resource_health_checks — delete rows older than 7 days.
 *    Growing at ~56K rows/day (Costantino probe cycles). 7 days is
 *    sufficient — Costantino uses current-state data only.
 *
 * 2. specialist_research_quality_snapshots — delete rows older than 30 days
 *    per specialist. Append-only history; latest snapshot per specialist is
 *    the only operationally used row.
 *
 * Pattern: vito-compliance-scheduler (startup delay → setInterval).
 * No admin-editable cadence — daily cleanup is not a tunable parameter.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";

const SOURCE = "db-retention-scheduler";

/** Run once per day. */
const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Startup delay: let migrations and seeds settle first. */
const STARTUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

export async function runDbRetentionCycle(): Promise<void> {
  if (isRunning) {
    logger.info(`[${SOURCE}] Cycle already in progress — skipping`);
    return;
  }
  isRunning = true;
  const cycleStart = Date.now();
  let totalDeleted = 0;
  let cycleThrew = false;
  let errorMessage = "";

  try {
    // 1. resource_health_checks — keep last 7 days
    const r1 = await db.execute(sql`
      DELETE FROM resource_health_checks
      WHERE checked_at < NOW() - INTERVAL '7 days'
    `);
    const deleted1 = (r1 as { rowCount?: number }).rowCount ?? 0;
    totalDeleted += deleted1;
    if (deleted1 > 0) {
      logger.info(`[${SOURCE}] resource_health_checks: deleted ${deleted1} rows older than 7 days`);
    }

    // 2. specialist_research_quality_snapshots — keep last 30 days per specialist
    const r2 = await db.execute(sql`
      DELETE FROM specialist_research_quality_snapshots
      WHERE computed_at < NOW() - INTERVAL '30 days'
    `);
    const deleted2 = (r2 as { rowCount?: number }).rowCount ?? 0;
    totalDeleted += deleted2;
    if (deleted2 > 0) {
      logger.info(`[${SOURCE}] specialist_research_quality_snapshots: deleted ${deleted2} rows older than 30 days`);
    }

    logger.info(`[${SOURCE}] Cycle complete — ${totalDeleted} total rows deleted`);
  } catch (err: unknown) {
    cycleThrew = true;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[${SOURCE}] Cycle failed: ${errorMessage}`);
  } finally {
    isRunning = false;
    void recordSchedulerCycle({
      key: SOURCE,
      considered: 2,
      succeeded: cycleThrew ? 0 : 2,
      failed: cycleThrew ? 1 : 0,
      status: cycleThrew ? "error" : totalDeleted > 0 ? "ok" : "ok",
      notes: cycleThrew ? truncateNotes(errorMessage) : totalDeleted > 0 ? truncateNotes(`${totalDeleted} rows deleted`) : null,
      durationMs: Date.now() - cycleStart,
    });
  }
}

export function startDbRetentionScheduler(): void {
  logger.info(`[${SOURCE}] Starting — first cycle in ${STARTUP_DELAY_MS / 1000}s, then every 24h`);
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runDbRetentionCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[${SOURCE}] Initial cycle failed: ${msg}`);
    });
    schedulerInterval = setInterval(() => {
      runDbRetentionCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[${SOURCE}] Periodic cycle failed: ${msg}`);
      });
    }, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopDbRetentionScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
