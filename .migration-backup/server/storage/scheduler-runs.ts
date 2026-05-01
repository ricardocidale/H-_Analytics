/**
 * Task #542 — Storage for `scheduler_runs`.
 *
 * One row per background scheduler. Each scheduler upserts its row at
 * the end of every cycle so the Admin → Observability page can render
 * "last run, what happened, did it fail".
 *
 * Task #558 — `scheduler_run_history` companion writes: every call to
 * `recordSchedulerRun` also appends a row to `scheduler_run_history` and
 * trims that scheduler's history to the last `SCHEDULER_HISTORY_KEEP`
 * rows so the table stays bounded. The Observability page reads the
 * latest rows back via `listSchedulerRunHistory` to render a "recent
 * runs" status-dot strip per scheduler.
 */
import { db } from "../db";
import {
  schedulerRuns,
  schedulerRunHistory,
  SCHEDULER_HISTORY_KEEP,
  type SchedulerRun,
  type SchedulerRunHistoryRow,
} from "@shared/schema";
import { sql } from "drizzle-orm";

export interface RecordSchedulerRunInput {
  schedulerKey: string;
  schedulerLabel: string;
  cycleIntervalMs: number;
  considered: number;
  succeeded: number;
  failed: number;
  status: "ok" | "warn" | "error";
  notes?: string | null;
  durationMs?: number | null;
  lastRunAt?: Date;
}

export interface ListSchedulerRunHistoryOptions {
  /** Per-scheduler row cap. Defaults to `SCHEDULER_HISTORY_KEEP`. */
  limitPerScheduler?: number;
  /** Restrict the lookup to specific scheduler keys (defaults to all). */
  schedulerKeys?: string[];
}

export interface SchedulerRunsStorage {
  recordSchedulerRun(input: RecordSchedulerRunInput): Promise<SchedulerRun>;
  listSchedulerRuns(): Promise<SchedulerRun[]>;
  listSchedulerRunHistory(
    options?: ListSchedulerRunHistoryOptions,
  ): Promise<SchedulerRunHistoryRow[]>;
}

export class SchedulerRunsStorageImpl implements SchedulerRunsStorage {
  async recordSchedulerRun(input: RecordSchedulerRunInput): Promise<SchedulerRun> {
    const now = input.lastRunAt ?? new Date();
    const values = {
      schedulerKey: input.schedulerKey,
      schedulerLabel: input.schedulerLabel,
      lastRunAt: now,
      considered: input.considered,
      succeeded: input.succeeded,
      failed: input.failed,
      status: input.status,
      notes: input.notes ?? null,
      cycleIntervalMs: input.cycleIntervalMs,
      durationMs: input.durationMs ?? null,
      updatedAt: now,
    };
    const [row] = await db
      .insert(schedulerRuns)
      .values(values)
      .onConflictDoUpdate({
        target: schedulerRuns.schedulerKey,
        set: {
          schedulerLabel: values.schedulerLabel,
          lastRunAt: values.lastRunAt,
          considered: values.considered,
          succeeded: values.succeeded,
          failed: values.failed,
          status: values.status,
          notes: values.notes,
          cycleIntervalMs: values.cycleIntervalMs,
          durationMs: values.durationMs,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    // Append to the companion history table and trim. We do the trim with a
    // sub-select against the *same* schedulerKey so concurrent writes for
    // OTHER schedulers can't be deleted by accident. The trim step is a
    // best-effort follow-up — if it fails for any reason the append already
    // succeeded and the next cycle will trim it down.
    await db.insert(schedulerRunHistory).values({
      schedulerKey: input.schedulerKey,
      ranAt: now,
      considered: input.considered,
      succeeded: input.succeeded,
      failed: input.failed,
      status: input.status,
      notes: input.notes ?? null,
      durationMs: input.durationMs ?? null,
    });

    await db.execute(sql`
      DELETE FROM scheduler_run_history
      WHERE scheduler_key = ${input.schedulerKey}
        AND id NOT IN (
          SELECT id FROM scheduler_run_history
          WHERE scheduler_key = ${input.schedulerKey}
          ORDER BY ran_at DESC, id DESC
          LIMIT ${SCHEDULER_HISTORY_KEEP}
        )
    `);

    return row;
  }

  async listSchedulerRuns(): Promise<SchedulerRun[]> {
    return db
      .select()
      .from(schedulerRuns)
      .orderBy(sql`${schedulerRuns.schedulerLabel} ASC`);
  }

  async listSchedulerRunHistory(
    options: ListSchedulerRunHistoryOptions = {},
  ): Promise<SchedulerRunHistoryRow[]> {
    const limit = Math.max(1, options.limitPerScheduler ?? SCHEDULER_HISTORY_KEEP);
    const keys = options.schedulerKeys;

    // Single query that uses ROW_NUMBER() to keep the latest N per
    // schedulerKey — saves a per-scheduler round trip when the
    // Observability strip asks for many schedulers at once.
    const filterSql = keys && keys.length > 0
      ? sql`WHERE scheduler_key IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, scheduler_key, ran_at, considered, succeeded, failed,
             status, notes, duration_ms
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY scheduler_key
                 ORDER BY ran_at DESC, id DESC
               ) AS rn
        FROM scheduler_run_history
        ${filterSql}
      ) ranked
      WHERE rn <= ${limit}
      ORDER BY scheduler_key ASC, ran_at DESC, id DESC
    `);

    // Map snake_case → camelCase so callers see the Drizzle row shape.
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      schedulerKey: String(r.scheduler_key),
      ranAt: r.ran_at instanceof Date ? r.ran_at : new Date(String(r.ran_at)),
      considered: Number(r.considered ?? 0),
      succeeded: Number(r.succeeded ?? 0),
      failed: Number(r.failed ?? 0),
      status: String(r.status),
      notes: r.notes == null ? null : String(r.notes),
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    }));
  }
}

