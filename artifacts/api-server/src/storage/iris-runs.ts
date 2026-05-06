/**
 * Iris backstage agent run log storage.
 *
 * One row per Iris execution. Inserted at "running", updated to "completed"
 * or "error" when the agent finishes. The Admin → Iris panel reads the
 * latest row via getLatestIrisRun().
 */
import { db } from "../db";
import { irisRuns, type IrisRunRow, type IrisRunStatus } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export type { IrisRunRow };

export interface InsertIrisRunInput {
  trigger: string;
  status: IrisRunStatus;
}

export interface UpdateIrisRunInput {
  status: IrisRunStatus;
  modelUsed?: string | null;
  chunksIndexed?: number;
  errorsEncountered?: number;
  durationMs?: number | null;
  healthSummary?: unknown;
}

export async function insertIrisRun(data: InsertIrisRunInput): Promise<IrisRunRow> {
  const [row] = await db
    .insert(irisRuns)
    .values({
      trigger: data.trigger,
      status: data.status,
    })
    .returning();
  return row;
}

export async function updateIrisRun(id: number, data: UpdateIrisRunInput): Promise<void> {
  await db
    .update(irisRuns)
    .set({
      status: data.status,
      modelUsed: data.modelUsed ?? null,
      chunksIndexed: data.chunksIndexed ?? 0,
      errorsEncountered: data.errorsEncountered ?? 0,
      durationMs: data.durationMs ?? null,
      healthSummary: data.healthSummary ?? null,
    })
    .where(eq(irisRuns.id, id));
}

export async function getLatestIrisRun(): Promise<IrisRunRow | null> {
  const [row] = await db
    .select()
    .from(irisRuns)
    .orderBy(desc(irisRuns.runAt))
    .limit(1);
  return row ?? null;
}
