/**
 * Task #528 — Storage for `storage_drift_sweep_runs`.
 *
 * One row, keyed on `STORAGE_DRIFT_SWEEP_SINGLETON_ID`. The
 * `.github/workflows/storage-reconcile-remediate.yml` workflow's final
 * step upserts this row at the end of every run (success or failure)
 * via `script/record-storage-drift-sweep.ts`. The Admin → Observability
 * page reads it back through `getLastStorageDriftSweepRun()`.
 */
import { db } from "../db";
import {
  storageDriftSweepRuns,
  STORAGE_DRIFT_SWEEP_SINGLETON_ID,
  type StorageDriftSweepRun,
  type StorageDriftSweepStatus,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export interface RecordStorageDriftSweepRunInput {
  finishedAt: Date;
  exitCode: number;
  status: StorageDriftSweepStatus;
  rewroteCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  residualCount: number;
  runId?: string | null;
  runUrl?: string | null;
  trigger?: string | null;
  triggerReason?: string | null;
  notes?: string | null;
}

export interface StorageDriftSweepRunsStorage {
  recordStorageDriftSweepRun(input: RecordStorageDriftSweepRunInput): Promise<StorageDriftSweepRun>;
  getLastStorageDriftSweepRun(): Promise<StorageDriftSweepRun | null>;
}

export class StorageDriftSweepRunsStorageImpl implements StorageDriftSweepRunsStorage {
  async recordStorageDriftSweepRun(
    input: RecordStorageDriftSweepRunInput,
  ): Promise<StorageDriftSweepRun> {
    const now = new Date();
    const values = {
      id: STORAGE_DRIFT_SWEEP_SINGLETON_ID,
      finishedAt: input.finishedAt,
      exitCode: input.exitCode,
      status: input.status,
      rewroteCount: input.rewroteCount,
      copiedCount: input.copiedCount,
      skippedCount: input.skippedCount,
      failedCount: input.failedCount,
      residualCount: input.residualCount,
      runId: input.runId ?? null,
      runUrl: input.runUrl ?? null,
      trigger: input.trigger ?? null,
      triggerReason: input.triggerReason ?? null,
      notes: input.notes ?? null,
      updatedAt: now,
    };
    const [row] = await db
      .insert(storageDriftSweepRuns)
      .values(values)
      .onConflictDoUpdate({
        target: storageDriftSweepRuns.id,
        set: {
          finishedAt: values.finishedAt,
          exitCode: values.exitCode,
          status: values.status,
          rewroteCount: values.rewroteCount,
          copiedCount: values.copiedCount,
          skippedCount: values.skippedCount,
          failedCount: values.failedCount,
          residualCount: values.residualCount,
          runId: values.runId,
          runUrl: values.runUrl,
          trigger: values.trigger,
          triggerReason: values.triggerReason,
          notes: values.notes,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    return row;
  }

  async getLastStorageDriftSweepRun(): Promise<StorageDriftSweepRun | null> {
    const [row] = await db
      .select()
      .from(storageDriftSweepRuns)
      .where(eq(storageDriftSweepRuns.id, STORAGE_DRIFT_SWEEP_SINGLETON_ID))
      .limit(1);
    return row ?? null;
  }
}
