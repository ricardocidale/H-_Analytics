import {
  assumptionGuidance, researchRuns, benchmarkSnapshots, relaxationTraces,
  guidanceDecisions, coverageSnapshots, sourceRegistry, sourceCallLogs, engineSuggestedLines,
  integrationKeyRotations, pipelinePolicies, scheduledResearchWorkflows,
  type AssumptionGuidance, type InsertAssumptionGuidance,
  type ResearchRun, type InsertResearchRun,
  type BenchmarkSnapshot, type InsertBenchmarkSnapshot,
  type RelaxationTrace, type InsertRelaxationTrace,
  type GuidanceDecision, type InsertGuidanceDecision,
  type CoverageSnapshot, type InsertCoverageSnapshot,
  type SourceRegistryEntry, type InsertSourceRegistryEntry,
  type SourceCallLog, type InsertSourceCallLog,
  type EngineSuggestedLine, type InsertEngineSuggestedLine,
  type IntegrationKeyRotation, type InsertIntegrationKeyRotation,
  type PipelinePolicy, type InsertPipelinePolicy,
  type ScheduledResearchWorkflow, type InsertScheduledResearchWorkflow,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, lte, sql, isNull } from "drizzle-orm";
export { IntelligenceRebeccaStorage } from "./intelligence-rebecca";
import { indexBenchmarkSnapshot } from "../ai/pinecone-service";
import { mapCategoryToKpis } from "../ai/pinecone-indexing";
import { logger } from "../logger";

export class IntelligenceV2Storage {
  async getAssumptionGuidance(scenarioId: number | null, entityType: string, entityId: number): Promise<AssumptionGuidance[]> {
    return db.select().from(assumptionGuidance)
      .where(and(
        scenarioId != null
          ? eq(assumptionGuidance.scenarioId, scenarioId)
          : isNull(assumptionGuidance.scenarioId),
        eq(assumptionGuidance.entityType, entityType),
        eq(assumptionGuidance.entityId, entityId),
      ))
      .orderBy(assumptionGuidance.assumptionKey);
  }

  async getAllAssumptionGuidanceForScenario(scenarioId: number | null): Promise<AssumptionGuidance[]> {
    return db.select().from(assumptionGuidance)
      .where(
        scenarioId != null
          ? eq(assumptionGuidance.scenarioId, scenarioId)
          : isNull(assumptionGuidance.scenarioId),
      )
      .orderBy(assumptionGuidance.entityType, assumptionGuidance.entityId, assumptionGuidance.assumptionKey);
  }

  async upsertAssumptionGuidance(data: InsertAssumptionGuidance): Promise<AssumptionGuidance> {
    const conditions = [
      eq(assumptionGuidance.entityType, data.entityType),
      eq(assumptionGuidance.entityId, data.entityId),
      eq(assumptionGuidance.assumptionKey, data.assumptionKey),
      data.scenarioId
        ? eq(assumptionGuidance.scenarioId, data.scenarioId)
        : isNull(assumptionGuidance.scenarioId),
    ];

    return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(assumptionGuidance).where(and(...conditions)).limit(1);
    if (existing) {
      const [updated] = await tx.update(assumptionGuidance)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(assumptionGuidance.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await tx.insert(assumptionGuidance)
      .values(data as typeof assumptionGuidance.$inferInsert)
      .returning();
    return inserted;
    });
  }

  async createResearchRun(data: InsertResearchRun): Promise<ResearchRun> {
    const [run] = await db.insert(researchRuns)
      .values(data as typeof researchRuns.$inferInsert)
      .returning();
    return run;
  }

  async updateResearchRun(id: number, updates: Partial<ResearchRun>): Promise<ResearchRun | undefined> {
    const [updated] = await db.update(researchRuns)
      .set(updates)
      .where(eq(researchRuns.id, id))
      .returning();
    return updated;
  }

  async getResearchRuns(entityType: string, entityId: number): Promise<ResearchRun[]> {
    return db.select().from(researchRuns)
      .where(and(eq(researchRuns.entityType, entityType), eq(researchRuns.entityId, entityId)))
      .orderBy(desc(researchRuns.startedAt));
  }

  async getRunningResearchEntityIds(entityType: string): Promise<number[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT entity_id AS "entityId"
      FROM research_runs
      WHERE entity_type = ${entityType} AND status = 'running'
    `);
    return ((rows.rows ?? []) as { entityId: number }[]).map(r => Number(r.entityId));
  }

  async getLatestCompletedRunsPerEntity(entityType: string): Promise<{ entityId: number; completedAt: Date; durationMs: number | null }[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (entity_id)
        entity_id AS "entityId",
        completed_at AS "completedAt",
        duration_ms AS "durationMs"
      FROM research_runs
      WHERE entity_type = ${entityType}
        AND status = 'completed'
        AND completed_at IS NOT NULL
      ORDER BY entity_id, completed_at DESC
    `);
    return (rows.rows ?? []) as { entityId: number; completedAt: Date; durationMs: number | null }[];
  }

  async getBenchmarkSnapshots(category?: string): Promise<BenchmarkSnapshot[]> {
    if (category) {
      return db.select().from(benchmarkSnapshots).where(eq(benchmarkSnapshots.category, category));
    }
    return db.select().from(benchmarkSnapshots);
  }

  async upsertBenchmarkSnapshot(data: InsertBenchmarkSnapshot): Promise<BenchmarkSnapshot> {
    const [existing] = await db.select().from(benchmarkSnapshots)
      .where(eq(benchmarkSnapshots.snapshotKey, data.snapshotKey))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(benchmarkSnapshots)
        .set({ ...data, fetchedAt: new Date() })
        .where(eq(benchmarkSnapshots.id, existing.id))
        .returning();

      try {
        const kpis = mapCategoryToKpis(updated.category, updated.value);
        indexBenchmarkSnapshot({
          market: updated.snapshotKey,
          propertyType: updated.category,
          ...kpis,
          source: updated.source ?? "unknown",
          snapshotDate: updated.fetchedAt.toISOString(),
        }).catch(err => logger.warn(`Pinecone benchmark re-index failed: ${err}`, "intelligence-v2"));
      } catch (err: unknown) {
        logger.warn(`Pinecone benchmark re-index failed: ${err instanceof Error ? err.message : String(err)}`, "intelligence-v2");
      }

      return updated;
    }
    const [inserted] = await db.insert(benchmarkSnapshots)
      .values(data as typeof benchmarkSnapshots.$inferInsert)
      .returning();

    try {
      const kpis = mapCategoryToKpis(inserted.category, inserted.value);
      indexBenchmarkSnapshot({
        market: inserted.snapshotKey,
        propertyType: inserted.category,
        ...kpis,
        source: inserted.source ?? "unknown",
        snapshotDate: inserted.fetchedAt.toISOString(),
      }).catch(err => logger.warn(`Pinecone benchmark index failed: ${err}`, "intelligence-v2"));
    } catch (err: unknown) {
      logger.warn(`Pinecone benchmark index failed: ${err instanceof Error ? err.message : String(err)}`, "intelligence-v2");
    }

    return inserted;
  }

  async createRelaxationTrace(data: InsertRelaxationTrace): Promise<RelaxationTrace> {
    const [trace] = await db.insert(relaxationTraces)
      .values(data as typeof relaxationTraces.$inferInsert)
      .returning();
    return trace;
  }

  async getRelaxationTraces(researchRunId: number): Promise<RelaxationTrace[]> {
    return db.select().from(relaxationTraces)
      .where(eq(relaxationTraces.researchRunId, researchRunId))
      .orderBy(relaxationTraces.level);
  }

  async getAssumptionGuidanceById(id: number): Promise<AssumptionGuidance | undefined> {
    const [row] = await db.select().from(assumptionGuidance)
      .where(eq(assumptionGuidance.id, id))
      .limit(1);
    return row;
  }

  async createGuidanceDecision(data: InsertGuidanceDecision): Promise<GuidanceDecision> {
    const [decision] = await db.insert(guidanceDecisions)
      .values(data as typeof guidanceDecisions.$inferInsert)
      .returning();
    return decision;
  }

  async getGuidanceDecisions(guidanceId: number): Promise<GuidanceDecision[]> {
    return db.select().from(guidanceDecisions)
      .where(eq(guidanceDecisions.assumptionGuidanceId, guidanceId))
      .orderBy(desc(guidanceDecisions.createdAt));
  }

  async createCoverageSnapshot(data: InsertCoverageSnapshot): Promise<CoverageSnapshot> {
    const [snap] = await db.insert(coverageSnapshots)
      .values(data as typeof coverageSnapshots.$inferInsert)
      .returning();
    return snap;
  }

  async getCoverageSnapshots(entityType: string, entityId: number): Promise<CoverageSnapshot[]> {
    return db.select().from(coverageSnapshots)
      .where(and(eq(coverageSnapshots.entityType, entityType), eq(coverageSnapshots.entityId, entityId)))
      .orderBy(desc(coverageSnapshots.snapshotDate));
  }

  async getSourceRegistry(): Promise<SourceRegistryEntry[]> {
    return db.select().from(sourceRegistry);
  }

  async getSourceRegistryEntry(id: number): Promise<SourceRegistryEntry | undefined> {
    const [row] = await db.select().from(sourceRegistry)
      .where(eq(sourceRegistry.id, id)).limit(1);
    return row;
  }

  async upsertSourceRegistry(data: InsertSourceRegistryEntry): Promise<SourceRegistryEntry> {
    const [existing] = await db.select().from(sourceRegistry)
      .where(eq(sourceRegistry.serviceKey, data.serviceKey))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(sourceRegistry)
        .set(data)
        .where(eq(sourceRegistry.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(sourceRegistry)
      .values(data as typeof sourceRegistry.$inferInsert)
      .returning();
    return inserted;
  }

  async createSourceRegistryEntry(data: InsertSourceRegistryEntry): Promise<SourceRegistryEntry> {
    const [inserted] = await db.insert(sourceRegistry)
      .values(data as typeof sourceRegistry.$inferInsert)
      .returning();
    return inserted;
  }

  async updateSourceRegistryEntry(id: number, data: Partial<InsertSourceRegistryEntry>): Promise<SourceRegistryEntry | undefined> {
    const [updated] = await db.update(sourceRegistry)
      .set(data)
      .where(eq(sourceRegistry.id, id))
      .returning();
    return updated;
  }

  async deleteSourceRegistryEntry(id: number): Promise<void> {
    await db.delete(sourceRegistry).where(eq(sourceRegistry.id, id));
  }

  async createSourceCallLog(data: InsertSourceCallLog): Promise<SourceCallLog> {
    const [log] = await db.insert(sourceCallLogs)
      .values(data as typeof sourceCallLogs.$inferInsert)
      .returning();
    return log;
  }

  async getSourceCallLogs(sourceId: number, limit: number = 50): Promise<SourceCallLog[]> {
    return db.select().from(sourceCallLogs)
      .where(eq(sourceCallLogs.sourceId, sourceId))
      .orderBy(desc(sourceCallLogs.timestamp))
      .limit(limit);
  }

  async createKeyRotation(data: InsertIntegrationKeyRotation): Promise<IntegrationKeyRotation> {
    const [rotation] = await db.insert(integrationKeyRotations)
      .values(data as typeof integrationKeyRotations.$inferInsert)
      .returning();
    return rotation;
  }

  async getKeyRotationsByService(serviceKey: string): Promise<IntegrationKeyRotation[]> {
    return db.select().from(integrationKeyRotations)
      .where(eq(integrationKeyRotations.serviceKey, serviceKey))
      .orderBy(desc(integrationKeyRotations.rotatedAt))
      .limit(20);
  }

  async getPipelinePolicies(): Promise<PipelinePolicy[]> {
    return db.select().from(pipelinePolicies);
  }

  async upsertPipelinePolicy(data: InsertPipelinePolicy): Promise<PipelinePolicy> {
    const [existing] = await db.select().from(pipelinePolicies)
      .where(eq(pipelinePolicies.policyKey, data.policyKey))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(pipelinePolicies)
        .set(data)
        .where(eq(pipelinePolicies.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(pipelinePolicies)
      .values(data as typeof pipelinePolicies.$inferInsert)
      .returning();
    return inserted;
  }

  async getScheduledResearchWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    return db.select().from(scheduledResearchWorkflows).orderBy(scheduledResearchWorkflows.priority);
  }

  async getScheduledResearchWorkflowById(id: number): Promise<ScheduledResearchWorkflow | undefined> {
    const [row] = await db.select().from(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.id, id)).limit(1);
    return row;
  }

  async getStaleScheduledWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    const now = new Date();
    return db.select().from(scheduledResearchWorkflows)
      .where(and(
        eq(scheduledResearchWorkflows.isEnabled, true),
        lte(scheduledResearchWorkflows.nextRunAt, now),
      ))
      .orderBy(scheduledResearchWorkflows.priority);
  }

  async getDueScheduledWorkflows(): Promise<ScheduledResearchWorkflow[]> {
    const now = new Date();
    const rows = await db.select().from(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.isEnabled, true))
      .orderBy(scheduledResearchWorkflows.priority);
    return rows.filter(w => !w.nextRunAt || w.nextRunAt <= now);
  }

  async upsertScheduledResearchWorkflow(data: InsertScheduledResearchWorkflow): Promise<ScheduledResearchWorkflow> {
    const nextRun = new Date();
    const [result] = await db.insert(scheduledResearchWorkflows)
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
    const [updated] = await db.update(scheduledResearchWorkflows)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(scheduledResearchWorkflows.id, id))
      .returning();
    return updated;
  }

  async deleteScheduledResearchWorkflow(id: number): Promise<void> {
    await db.delete(scheduledResearchWorkflows)
      .where(eq(scheduledResearchWorkflows.id, id));
  }

  async getEngineSuggestedLines(status?: string): Promise<EngineSuggestedLine[]> {
    if (status && status !== "all") {
      return db.select().from(engineSuggestedLines)
        .where(eq(engineSuggestedLines.status, status))
        .orderBy(desc(engineSuggestedLines.createdAt));
    }
    return db.select().from(engineSuggestedLines).orderBy(desc(engineSuggestedLines.createdAt));
  }

  async getEngineSuggestedLineById(id: number): Promise<EngineSuggestedLine | undefined> {
    const [row] = await db.select().from(engineSuggestedLines)
      .where(eq(engineSuggestedLines.id, id)).limit(1);
    return row;
  }

  async createEngineSuggestedLine(data: InsertEngineSuggestedLine): Promise<EngineSuggestedLine> {
    const [inserted] = await db.insert(engineSuggestedLines)
      .values(data as typeof engineSuggestedLines.$inferInsert)
      .returning();
    return inserted;
  }

  async approveEngineSuggestedLine(id: number, reviewedBy: number): Promise<EngineSuggestedLine | undefined> {
    const [updated] = await db.update(engineSuggestedLines)
      .set({ status: "approved", reviewedBy, reviewedAt: new Date(), rejectionReason: null })
      .where(eq(engineSuggestedLines.id, id))
      .returning();
    return updated;
  }

  async rejectEngineSuggestedLine(id: number, reviewedBy: number, reason: string): Promise<EngineSuggestedLine | undefined> {
    const [updated] = await db.update(engineSuggestedLines)
      .set({ status: "rejected", reviewedBy, reviewedAt: new Date(), rejectionReason: reason })
      .where(eq(engineSuggestedLines.id, id))
      .returning();
    return updated;
  }

  async getEngineSuggestedLineCounts(): Promise<{ pending: number; approved: number; rejected: number; total: number }> {
    const rows = await db.execute(sql`
      SELECT status, COUNT(*)::int AS count FROM engine_suggested_lines GROUP BY status
    `);
    const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
    for (const row of (rows.rows ?? []) as { status: string; count: number }[]) {
      if (row.status === "pending") counts.pending = row.count;
      else if (row.status === "approved") counts.approved = row.count;
      else if (row.status === "rejected") counts.rejected = row.count;
    }
    counts.total = counts.pending + counts.approved + counts.rejected;
    return counts;
  }
}

