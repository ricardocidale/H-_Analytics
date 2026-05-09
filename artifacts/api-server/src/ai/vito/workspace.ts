/**
 * Vito workspace — DB helpers for vito_runs rows.
 *
 * Mirrors the iris-runs storage pattern: plain functions over Drizzle
 * that the agent and scheduler call directly.
 */
import { db } from "../../db";
import { vitoRuns } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export interface FinalizeVitoRunInput {
  passesCompleted: number;
  blockCount: number;
  warningCount: number;
  advisoryCount: number;
  infoCount: number;
  status: string;
  notes?: string;
  durationMs?: number;
}

/**
 * Inserts a new vito_runs row and returns its id.
 * The row starts with all counters at zero; call finalizeVitoRun to update
 * them when the agent finishes.
 */
export async function createVitoRun(
  trigger: string,
  mode: string,
): Promise<number> {
  const [row] = await db
    .insert(vitoRuns)
    .values({ trigger, mode })
    .returning({ id: vitoRuns.id });
  return row.id;
}

/**
 * Updates the vito_runs row with the agent's final metrics.
 */
export async function finalizeVitoRun(
  runId: number,
  summary: FinalizeVitoRunInput,
): Promise<void> {
  await db
    .update(vitoRuns)
    .set({
      passesCompleted: summary.passesCompleted,
      blockCount: summary.blockCount,
      warningCount: summary.warningCount,
      advisoryCount: summary.advisoryCount,
      infoCount: summary.infoCount,
      status: summary.status,
      notes: summary.notes ?? null,
      durationMs: summary.durationMs ?? null,
    })
    .where(eq(vitoRuns.id, runId));
}

/**
 * Returns the most-recent vito_runs row, or null if none exists.
 */
export async function getLatestVitoRun(): Promise<{
  id: number;
  createdAt: Date;
  mode: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      id: vitoRuns.id,
      createdAt: vitoRuns.createdAt,
      mode: vitoRuns.mode,
      status: vitoRuns.status,
    })
    .from(vitoRuns)
    .orderBy(desc(vitoRuns.createdAt))
    .limit(1);
  return row ?? null;
}
