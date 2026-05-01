import {
  scheduledResearchWorkflows,
  type ScheduledResearchWorkflow, type InsertScheduledResearchWorkflow,
} from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import type { IntelligenceTx } from "../tx";

/**
 * ScheduledWorkflowsStorage — admin-defined cron-like jobs that drive
 * background research refreshes. Reads are sorted by priority so the
 * runner picks up high-priority jobs first; "due" vs "stale" both filter
 * on `nextRunAt <= now` but read in slightly different shapes (one as a
 * SQL filter, the other in JS) — both shapes are kept because callers
 * depend on each.
 */
export class ScheduledWorkflowsStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

  async getScheduledResearchWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    return this._ctx.db.select().from(scheduledResearchWorkflows).orderBy(scheduledResearchWorkflows.priority);
  }

  async getScheduledResearchWorkflowById(id: number): Promise<ScheduledResearchWorkflow | undefined> {
    const [row] = await this._ctx.db.select().from(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.id, id)).limit(1);
    return row;
  }

  async getStaleScheduledWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    const now = new Date();
    return this._ctx.db.select().from(scheduledResearchWorkflows)
      .where(and(
        eq(scheduledResearchWorkflows.isEnabled, true),
        lte(scheduledResearchWorkflows.nextRunAt, now),
      ))
      .orderBy(scheduledResearchWorkflows.priority);
  }

  async getDueScheduledWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    const now = new Date();
    const rows = await this._ctx.db.select().from(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.isEnabled, true))
      .orderBy(scheduledResearchWorkflows.priority);
    return rows.filter(w => !w.nextRunAt || w.nextRunAt <= now);
  }

  async upsertScheduledResearchWorkflow(data: InsertScheduledResearchWorkflow): Promise<ScheduledResearchWorkflow> {
    const nextRun = new Date();
    const [result] = await this._ctx.db.insert(scheduledResearchWorkflows)
      .values({
        ...data,
        nextRunAt: data.nextRunAt ?? nextRun,
      } as typeof scheduledResearchWorkflows.$inferInsert)
      .onConflictDoUpdate({
        target: scheduledResearchWorkflows.workflowKey,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async updateScheduledWorkflowRun(id: number, update: {
    lastRunAt: Date;
    nextRunAt: Date;
    lastRunStatus: string;
    lastRunDurationMs?: number;
    lastRunError?: string | null;
  }): Promise<ScheduledResearchWorkflow> {
    const [updated] = await this._ctx.db.update(scheduledResearchWorkflows)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(scheduledResearchWorkflows.id, id))
      .returning();
    return updated;
  }

  async deleteScheduledResearchWorkflow(id: number): Promise<void> {
    await this._ctx.db.delete(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.id, id));
  }
}
