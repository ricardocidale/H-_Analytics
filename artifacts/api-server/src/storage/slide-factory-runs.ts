/**
 * Slide factory run storage.
 *
 * CRUD layer for slide_factory_runs. The slide factory pipeline writes to this
 * table at every tab gate — callers are responsible for passing valid status
 * transitions (see SlideFactoryRunStatus). No transition guard here; route
 * handlers enforce state machine rules.
 */
import { db } from "../db";
import {
  slideFactoryRuns,
  type SlideFactoryRun,
  type SlideFactoryRunStatus,
  type LuccaSlotDraft,
  type SlideAgentResult,
} from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { SLIDE_FACTORY_RUNS_LIST_LIMIT } from "../constants";

export type { SlideFactoryRun, SlideFactoryRunStatus, LuccaSlotDraft, SlideAgentResult };

export async function createSlideFactoryRun(userId: number): Promise<SlideFactoryRun> {
  const [row] = await db
    .insert(slideFactoryRuns)
    .values({ userId, status: "new" })
    .returning();
  return row;
}

export async function getSlideFactoryRun(
  id: number,
  userId: number,
): Promise<SlideFactoryRun | null> {
  const [row] = await db
    .select()
    .from(slideFactoryRuns)
    .where(and(eq(slideFactoryRuns.id, id), eq(slideFactoryRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Pipeline-level read — no userId filter. For use by background jobs only. */
export async function getSlideFactoryRunById(id: number): Promise<SlideFactoryRun | null> {
  const [row] = await db
    .select()
    .from(slideFactoryRuns)
    .where(eq(slideFactoryRuns.id, id))
    .limit(1);
  return row ?? null;
}

export async function listSlideFactoryRuns(userId: number): Promise<SlideFactoryRun[]> {
  return db
    .select()
    .from(slideFactoryRuns)
    .where(eq(slideFactoryRuns.userId, userId))
    .orderBy(desc(slideFactoryRuns.createdAt))
    .limit(SLIDE_FACTORY_RUNS_LIST_LIMIT);
}

export async function deleteSlideFactoryRun(id: number, userId: number): Promise<boolean> {
  const result = await db
    .delete(slideFactoryRuns)
    .where(and(eq(slideFactoryRuns.id, id), eq(slideFactoryRuns.userId, userId)))
    .returning({ id: slideFactoryRuns.id });
  return result.length > 0;
}

export type SlideFactoryRunPatch = Partial<
  Pick<
    SlideFactoryRun,
    | "status"
    | "briefR2Key"
    | "briefFilename"
    | "briefAccepted"
    | "canonicalSpec"
    | "canonicalPngKeys"
    | "slide1PropertyId"
    | "slide2PropertyId"
    | "slide3PropertyId"
    | "slide4PropertyId"
    | "slide5PropertyId"
    | "luccaDraft"
    | "agentResults"
    | "deckR2Key"
    | "pptxR2Key"
    | "pdfR2Key"
    | "wishListLog"
    | "slotContentHashes"
    | "startedAt"
    | "completedAt"
  >
>;

export async function updateSlideFactoryRun(
  id: number,
  patch: SlideFactoryRunPatch,
): Promise<SlideFactoryRun | undefined> {
  const [row] = await db
    .update(slideFactoryRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(slideFactoryRuns.id, id))
    .returning();
  return row;
}

/**
 * Merge a single slide's `SlideAgentResult` into the run's `agentResults`
 * JSONB without clobbering other slides. Read-modify-write inside one
 * transaction so concurrent Marco writes for different slides don't race.
 *
 * Key shape: "slide1".."slide6".
 */
export async function updateAgentResult(
  runId: number,
  slideNumber: number,
  result: SlideAgentResult,
): Promise<SlideFactoryRun | undefined> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ agentResults: slideFactoryRuns.agentResults })
      .from(slideFactoryRuns)
      .where(eq(slideFactoryRuns.id, runId))
      .limit(1);

    const merged: Record<string, SlideAgentResult> = {
      ...(current?.agentResults ?? {}),
      [`slide${slideNumber}`]: result,
    };

    const [row] = await tx
      .update(slideFactoryRuns)
      .set({ agentResults: merged, updatedAt: new Date() })
      .where(eq(slideFactoryRuns.id, runId))
      .returning();
    return row;
  });
}
