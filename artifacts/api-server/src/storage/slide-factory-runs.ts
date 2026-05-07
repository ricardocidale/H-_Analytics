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

export async function listSlideFactoryRuns(userId: number): Promise<SlideFactoryRun[]> {
  return db
    .select()
    .from(slideFactoryRuns)
    .where(eq(slideFactoryRuns.userId, userId))
    .orderBy(desc(slideFactoryRuns.createdAt))
    .limit(SLIDE_FACTORY_RUNS_LIST_LIMIT);
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
    | "slide5PropertyId"
    | "luccaDraft"
    | "agentResults"
    | "deckR2Key"
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
