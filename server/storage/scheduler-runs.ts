/**
 * Task #542 — Storage for `scheduler_runs`.
 *
 * One row per background scheduler. Each scheduler upserts its row at
 * the end of every cycle so the Admin → Observability page can render
 * "last run, what happened, did it fail".
 */
import { db } from "../db";
import { schedulerRuns, type SchedulerRun } from "@shared/schema";
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

export interface SchedulerRunsStorage {
  recordSchedulerRun(input: RecordSchedulerRunInput): Promise<SchedulerRun>;
  listSchedulerRuns(): Promise<SchedulerRun[]>;
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
    return row;
  }

  async listSchedulerRuns(): Promise<SchedulerRun[]> {
    return db
      .select()
      .from(schedulerRuns)
      .orderBy(sql`${schedulerRuns.schedulerLabel} ASC`);
  }
}
