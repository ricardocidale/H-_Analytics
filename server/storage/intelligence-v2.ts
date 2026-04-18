import {
  assumptionGuidance, researchRuns, benchmarkSnapshots, relaxationTraces,
  guidanceDecisions, coverageSnapshots, sourceRegistry, sourceCallLogs, engineSuggestedLines,
  integrationKeyRotations, pipelinePolicies, scheduledResearchWorkflows,
  assumptionChangeLog,
  assumptionAcknowledgments,
  hospitalityBenchmarks,
  analystWatchdogBenchmarks,
  type AnalystWatchdogBenchmarks,
  type InsertAnalystWatchdogBenchmarks,
  marketAdrIndex, seasonalCalendars, eventCalendars, airportDistances, laborRates, fbBenchmarks,
  capitalRaiseBenchmarks, analystRefreshAuditLog, analystRefreshSettings,
  type CapitalRaiseBenchmark, type InsertCapitalRaiseBenchmark,
  type AnalystRefreshAuditLog, type InsertAnalystRefreshAuditLog,
  type AnalystRefreshSettings, type InsertAnalystRefreshSettings,
  type AssumptionGuidance, type InsertAssumptionGuidance,
  type AssumptionChangeLog, type InsertAssumptionChangeLog,
  type AssumptionAcknowledgment, type InsertAssumptionAcknowledgment,
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
  type HospitalityBenchmark, type InsertHospitalityBenchmark,
  type MarketAdrIndex, type InsertMarketAdrIndex,
  type SeasonalCalendar, type InsertSeasonalCalendar,
  type EventCalendar, type InsertEventCalendar,
  type AirportDistance, type InsertAirportDistance,
  type LaborRate, type InsertLaborRate,
  type FbBenchmark, type InsertFbBenchmark,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, lte, sql, isNull } from "drizzle-orm";
export { IntelligenceRebeccaStorage } from "./intelligence-rebecca";
import { indexBenchmarkSnapshot } from "../ai/vector-store-service";
import { mapCategoryToKpis } from "../ai/vector-indexing";
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

  async getAllAssumptionGuidance(): Promise<AssumptionGuidance[]> {
    return db.select().from(assumptionGuidance)
      .orderBy(assumptionGuidance.entityType, assumptionGuidance.entityId, assumptionGuidance.assumptionKey);
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
        }).catch(err => logger.warn(`Vector store benchmark re-index failed: ${err}`, "intelligence-v2"));
      } catch (err: unknown) {
        logger.warn(`Vector store benchmark re-index failed: ${err instanceof Error ? err.message : String(err)}`, "intelligence-v2");
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
      }).catch(err => logger.warn(`Vector store benchmark index failed: ${err}`, "intelligence-v2"));
    } catch (err: unknown) {
      logger.warn(`Vector store benchmark index failed: ${err instanceof Error ? err.message : String(err)}`, "intelligence-v2");
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

  // ── Assumption Change Log ────────────────────────────────────────

  async logAssumptionChange(data: InsertAssumptionChangeLog): Promise<AssumptionChangeLog> {
    const [row] = await db.insert(assumptionChangeLog)
      .values(data as typeof assumptionChangeLog.$inferInsert)
      .returning();
    return row;
  }

  async logAssumptionChanges(entries: InsertAssumptionChangeLog[]): Promise<void> {
    if (entries.length === 0) return;
    await db.insert(assumptionChangeLog)
      .values(entries as Array<typeof assumptionChangeLog.$inferInsert>);
  }

  async getAssumptionHistory(entityType: string, entityId: number, fieldName?: string): Promise<AssumptionChangeLog[]> {
    const conditions = [
      eq(assumptionChangeLog.entityType, entityType),
      eq(assumptionChangeLog.entityId, entityId),
    ];
    if (fieldName) conditions.push(eq(assumptionChangeLog.fieldName, fieldName));
    return db.select().from(assumptionChangeLog)
      .where(and(...conditions))
      .orderBy(desc(assumptionChangeLog.createdAt));
  }

  async getUnvalidatedAssumptions(entityType: string): Promise<AssumptionChangeLog[]> {
    // Fields set by seed that were never updated by analyst or manual override
    return db.select().from(assumptionChangeLog)
      .where(and(
        eq(assumptionChangeLog.entityType, entityType),
        eq(assumptionChangeLog.changeSource, "seed"),
      ))
      .orderBy(assumptionChangeLog.entityId, assumptionChangeLog.fieldName);
  }

  // ── Assumption Acknowledgments (Keep my value memory) ─────────
  // Returns the single ack row (if any) for the given entity+field tuple.
  // Used by the warning generator to suppress re-flagging an override that
  // is still inside its acknowledged window.
  async getAcknowledgment(
    entityType: string,
    entityId: number,
    fieldName: string,
    userId: number,
  ): Promise<AssumptionAcknowledgment | undefined> {
    const [row] = await db.select().from(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.fieldName, fieldName),
        eq(assumptionAcknowledgments.userId, userId),
      ))
      .limit(1);
    return row;
  }

  async listAcknowledgments(
    entityType: string,
    entityId: number,
    userId: number,
  ): Promise<AssumptionAcknowledgment[]> {
    return db.select().from(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.userId, userId),
      ));
  }

  // Upsert keyed on (entityType, entityId, fieldName, userId) — the unique
  // constraint. A second "Keep my value" on the same field by the same user
  // replaces the prior snapshot (new value or fresher recommended range).
  // Different users do NOT collide — each maintains their own ack state.
  async upsertAcknowledgment(
    data: InsertAssumptionAcknowledgment,
  ): Promise<AssumptionAcknowledgment> {
    const [row] = await db.insert(assumptionAcknowledgments)
      .values(data as typeof assumptionAcknowledgments.$inferInsert)
      .onConflictDoUpdate({
        target: [
          assumptionAcknowledgments.entityType,
          assumptionAcknowledgments.entityId,
          assumptionAcknowledgments.fieldName,
          assumptionAcknowledgments.userId,
        ],
        set: {
          valueAtAck: data.valueAtAck,
          rangeLowAtAck: data.rangeLowAtAck,
          rangeHighAtAck: data.rangeHighAtAck,
          ackedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  async deleteAcknowledgment(
    entityType: string,
    entityId: number,
    fieldName: string,
    userId: number,
  ): Promise<void> {
    await db.delete(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.fieldName, fieldName),
        eq(assumptionAcknowledgments.userId, userId),
      ));
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

  /** Update source health check metrics with EWMA success rate and derived trust score. */
  async updateSourceHealthCheck(serviceKey: string, healthy: boolean, latencyMs: number, checkedAt: Date): Promise<void> {
    await db.update(sourceRegistry)
      .set({
        lastHealthCheck: checkedAt,
        avgLatencyMs: latencyMs,
        successRate: sql`COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${healthy ? 1 : 0} * 0.1`,
        trustScore: sql`CASE
          WHEN COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${healthy ? 1 : 0} * 0.1 >= 0.95 THEN 'verified'
          WHEN COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${healthy ? 1 : 0} * 0.1 >= 0.70 THEN 'degraded'
          ELSE 'unreliable'
        END`,
      })
      .where(eq(sourceRegistry.serviceKey, serviceKey));
  }

  /** Get service keys of sources that are active and have been verified or degraded trust. */
  async getHealthySourceKeys(category?: string): Promise<string[]> {
    const rows = await db.select({
      serviceKey: sourceRegistry.serviceKey,
    }).from(sourceRegistry)
      .where(
        category
          ? sql`${sourceRegistry.isActive} = true AND ${sourceRegistry.category} = ${category} AND ${sourceRegistry.trustScore} IN ('verified', 'degraded')`
          : sql`${sourceRegistry.isActive} = true AND ${sourceRegistry.trustScore} IN ('verified', 'degraded')`
      );
    return rows.map(r => r.serviceKey);
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

  // ── Hospitality Benchmarks ──────────────────────────────────────────
  async getHospitalityBenchmarks(filters?: {
    category?: string;
    segment?: string;
    country?: string;
    isActive?: boolean;
  }): Promise<HospitalityBenchmark[]> {
    const conditions = [];
    if (filters?.category) conditions.push(eq(hospitalityBenchmarks.category, filters.category));
    if (filters?.segment) conditions.push(eq(hospitalityBenchmarks.segment, filters.segment));
    if (filters?.country) conditions.push(eq(hospitalityBenchmarks.country, filters.country));
    if (filters?.isActive !== undefined) conditions.push(eq(hospitalityBenchmarks.isActive, filters.isActive));

    if (conditions.length > 0) {
      return db.select().from(hospitalityBenchmarks)
        .where(and(...conditions))
        .orderBy(hospitalityBenchmarks.category, hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
    }
    return db.select().from(hospitalityBenchmarks)
      .orderBy(hospitalityBenchmarks.category, hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
  }

  async getHospitalityBenchmarksByCategory(category: string): Promise<HospitalityBenchmark[]> {
    return db.select().from(hospitalityBenchmarks)
      .where(and(
        eq(hospitalityBenchmarks.category, category),
        eq(hospitalityBenchmarks.isActive, true),
      ))
      .orderBy(hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
  }

  async upsertHospitalityBenchmark(data: InsertHospitalityBenchmark): Promise<HospitalityBenchmark> {
    const country = data.country ?? "US";
    const [existing] = await db.select().from(hospitalityBenchmarks)
      .where(and(
        eq(hospitalityBenchmarks.metricKey, data.metricKey),
        eq(hospitalityBenchmarks.country, country),
        eq(hospitalityBenchmarks.sourceYear, data.sourceYear),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(hospitalityBenchmarks)
        .set({ ...data, country, updatedAt: new Date() })
        .where(eq(hospitalityBenchmarks.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await db.insert(hospitalityBenchmarks)
      .values({ ...data, country } as typeof hospitalityBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  async getHospitalityBenchmarkById(id: number): Promise<HospitalityBenchmark | undefined> {
    const [row] = await db.select().from(hospitalityBenchmarks)
      .where(eq(hospitalityBenchmarks.id, id)).limit(1);
    return row;
  }

  async updateHospitalityBenchmark(id: number, data: Partial<InsertHospitalityBenchmark>): Promise<HospitalityBenchmark | undefined> {
    const [updated] = await db.update(hospitalityBenchmarks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hospitalityBenchmarks.id, id))
      .returning();
    return updated;
  }

  // ── Market ADR Index ───────────────────────────────────────────────────
  async getMarketAdrIndex(market: string, quarter?: string): Promise<MarketAdrIndex[]> {
    const conditions = [eq(marketAdrIndex.market, market)];
    if (quarter) conditions.push(eq(marketAdrIndex.quarter, quarter));
    return db.select().from(marketAdrIndex)
      .where(and(...conditions))
      .orderBy(desc(marketAdrIndex.quarter));
  }

  async upsertMarketAdrIndex(data: InsertMarketAdrIndex): Promise<MarketAdrIndex> {
    const [existing] = await db.select().from(marketAdrIndex)
      .where(and(eq(marketAdrIndex.market, data.market), eq(marketAdrIndex.quarter, data.quarter)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(marketAdrIndex)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(marketAdrIndex.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(marketAdrIndex)
      .values(data as typeof marketAdrIndex.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Seasonal Calendars ─────────────────────────────────────────────────
  async getSeasonalCalendar(market: string): Promise<SeasonalCalendar[]> {
    return db.select().from(seasonalCalendars)
      .where(eq(seasonalCalendars.market, market))
      .orderBy(seasonalCalendars.month);
  }

  async upsertSeasonalCalendar(data: InsertSeasonalCalendar): Promise<SeasonalCalendar> {
    const [existing] = await db.select().from(seasonalCalendars)
      .where(and(eq(seasonalCalendars.market, data.market), eq(seasonalCalendars.month, data.month)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(seasonalCalendars)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(seasonalCalendars.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(seasonalCalendars)
      .values(data as typeof seasonalCalendars.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Event Calendars ────────────────────────────────────────────────────
  async getEventCalendar(market: string): Promise<EventCalendar[]> {
    return db.select().from(eventCalendars)
      .where(eq(eventCalendars.market, market))
      .orderBy(eventCalendars.startMonth);
  }

  async upsertEventCalendar(data: InsertEventCalendar): Promise<EventCalendar> {
    const [existing] = await db.select().from(eventCalendars)
      .where(and(eq(eventCalendars.market, data.market), eq(eventCalendars.eventName, data.eventName)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(eventCalendars)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(eventCalendars.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(eventCalendars)
      .values(data as typeof eventCalendars.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Airport Distances ──────────────────────────────────────────────────
  async getAirportDistances(propertyId: number): Promise<AirportDistance[]> {
    return db.select().from(airportDistances)
      .where(eq(airportDistances.propertyId, propertyId))
      .orderBy(airportDistances.distanceKm);
  }

  async upsertAirportDistance(data: InsertAirportDistance): Promise<AirportDistance> {
    const [existing] = await db.select().from(airportDistances)
      .where(and(
        eq(airportDistances.propertyId, data.propertyId),
        eq(airportDistances.airportCode, data.airportCode),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(airportDistances)
        .set({ ...data, computedAt: new Date() })
        .where(eq(airportDistances.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(airportDistances)
      .values(data as typeof airportDistances.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Labor Rates ────────────────────────────────────────────────────────
  async getLaborRates(market: string, country?: string): Promise<LaborRate[]> {
    const conditions = [eq(laborRates.market, market)];
    if (country) conditions.push(eq(laborRates.country, country));
    return db.select().from(laborRates)
      .where(and(...conditions))
      .orderBy(laborRates.role);
  }

  async upsertLaborRate(data: InsertLaborRate): Promise<LaborRate> {
    const [existing] = await db.select().from(laborRates)
      .where(and(
        eq(laborRates.market, data.market),
        eq(laborRates.role, data.role),
        eq(laborRates.employmentType, data.employmentType ?? "fte"),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(laborRates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(laborRates.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(laborRates)
      .values(data as typeof laborRates.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Analyst Watchdog Benchmarks (per-user cache) ──────────────────────
  // Stub seeding: when no row exists for the user, insert one populated from
  // DEFAULT_CAPITAL_RAISE_BENCHMARKS. Future task swaps the seed for an
  // LLM-refreshed populator without changing the read path.
  async getAnalystWatchdogBenchmarks(userId: number): Promise<AnalystWatchdogBenchmarks> {
    const rows = await db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (rows.length > 0) return rows[0];
    const { DEFAULT_CAPITAL_RAISE_BENCHMARKS } = await import("@shared/constants-funding");
    const seed: typeof analystWatchdogBenchmarks.$inferInsert = {
      userId,
      ...DEFAULT_CAPITAL_RAISE_BENCHMARKS,
      lastRefreshedAt: null,
      refreshedBy: "stub",
      sourceCount: 0,
      tokensUsed: 0,
    };
    const [inserted] = await db.insert(analystWatchdogBenchmarks).values(seed).returning();
    return inserted;
  }

  async upsertAnalystWatchdogBenchmarks(
    userId: number,
    row: Partial<InsertAnalystWatchdogBenchmarks>,
  ): Promise<AnalystWatchdogBenchmarks> {
    const existing = await db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(analystWatchdogBenchmarks)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(analystWatchdogBenchmarks.id, existing[0].id))
        .returning();
      return updated;
    }
    // Seed a base row first so every column has a value, then patch.
    const seeded = await this.getAnalystWatchdogBenchmarks(userId);
    const [updated] = await db.update(analystWatchdogBenchmarks)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(analystWatchdogBenchmarks.id, seeded.id))
      .returning();
    return updated;
  }

  // ── F&B Benchmarks ─────────────────────────────────────────────────────
  async getFbBenchmarks(market: string, propertyType?: string): Promise<FbBenchmark[]> {
    const conditions = [eq(fbBenchmarks.market, market)];
    if (propertyType) conditions.push(eq(fbBenchmarks.propertyType, propertyType));
    return db.select().from(fbBenchmarks)
      .where(and(...conditions))
      .orderBy(fbBenchmarks.propertyType);
  }

  // ── Capital Raise Benchmarks ──────────────────────────────────
  async getCapitalRaiseBenchmarks(): Promise<CapitalRaiseBenchmark[]> {
    return db.select().from(capitalRaiseBenchmarks).orderBy(capitalRaiseBenchmarks.dimensionKey);
  }

  async getCapitalRaiseBenchmarkSummary(): Promise<{
    rows: CapitalRaiseBenchmark[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getCapitalRaiseBenchmarks();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertCapitalRaiseBenchmark(data: InsertCapitalRaiseBenchmark): Promise<CapitalRaiseBenchmark> {
    const [existing] = await db.select().from(capitalRaiseBenchmarks)
      .where(eq(capitalRaiseBenchmarks.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await db.update(capitalRaiseBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(capitalRaiseBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(capitalRaiseBenchmarks)
      .values(data as typeof capitalRaiseBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  /**
   * Batch write path used by the Capital-Raise Watchdog ingestion pipeline.
   * Each observation is upserted into `capital_raise_benchmarks` keyed by
   * `dimensionKey`. Existing rows inherit their label/unit when the watchdog
   * doesn't supply one; unrecognized dimensions (no existing row + missing
   * label) are skipped so a stray observation can't pollute the table.
   *
   * Note: writes are sequential, not wrapped in a single DB transaction. A
   * mid-loop failure can leave the table partially updated; the caller's
   * audit-log row records exactly which dimensions made it through (the
   * `applied` list) so the next watchdog run reconciles the rest.
   *
   * Returns the dimensionKeys that were applied vs. skipped so the caller can
   * log a precise diff and finalize the audit row accordingly.
   */
  async applyWatchdogCapitalRaiseObservations(
    observations: Array<{
      dimensionKey: string;
      label?: string | null;
      unit?: string | null;
      valueLow: number | null;
      valueMid: number | null;
      valueHigh: number | null;
    }>,
    opts: { sourceCount: number; recordedAt: Date },
  ): Promise<{ applied: CapitalRaiseBenchmark[]; skipped: string[] }> {
    const existingRows = await this.getCapitalRaiseBenchmarks();
    const byKey = new Map(existingRows.map(r => [r.dimensionKey, r] as const));

    const applied: CapitalRaiseBenchmark[] = [];
    const skipped: string[] = [];

    for (const obs of observations) {
      const prior = byKey.get(obs.dimensionKey);
      const label = obs.label ?? prior?.label ?? null;
      const unit = obs.unit ?? prior?.unit ?? "usd";
      if (!label) {
        // Unknown dimension with no label = unsafe to insert. Skip.
        skipped.push(obs.dimensionKey);
        continue;
      }
      const row = await this.upsertCapitalRaiseBenchmark({
        dimensionKey: obs.dimensionKey,
        label,
        unit,
        valueLow: obs.valueLow,
        valueMid: obs.valueMid,
        valueHigh: obs.valueHigh,
        sourceCount: opts.sourceCount,
        lastRefreshedAt: opts.recordedAt,
      });
      applied.push(row);
    }

    return { applied, skipped };
  }

  // ── Analyst Refresh Audit Log ─────────────────────────────────
  async createAnalystRefreshAuditLog(data: InsertAnalystRefreshAuditLog): Promise<AnalystRefreshAuditLog> {
    const [row] = await db.insert(analystRefreshAuditLog)
      .values(data as typeof analystRefreshAuditLog.$inferInsert)
      .returning();
    return row;
  }

  async finalizeAnalystRefreshAuditLog(
    id: number,
    patch: Partial<InsertAnalystRefreshAuditLog> & { finishedAt?: Date },
  ): Promise<AnalystRefreshAuditLog | undefined> {
    const [row] = await db.update(analystRefreshAuditLog)
      .set(patch)
      .where(eq(analystRefreshAuditLog.id, id))
      .returning();
    return row;
  }

  async getRecentAnalystRefreshAuditLogs(opts: { tableId?: string; sinceMs?: number; limit?: number } = {}): Promise<AnalystRefreshAuditLog[]> {
    const since = opts.sinceMs ? new Date(Date.now() - opts.sinceMs) : null;
    const conditions = [];
    if (opts.tableId) conditions.push(eq(analystRefreshAuditLog.tableId, opts.tableId));
    if (since) conditions.push(sql`${analystRefreshAuditLog.startedAt} > ${since}`);
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(analystRefreshAuditLog)
      .where(where)
      .orderBy(desc(analystRefreshAuditLog.startedAt))
      .limit(opts.limit ?? 50);
  }

  async countAnalystRefreshAttempts(opts: { adminId?: number; sinceMs: number }): Promise<number> {
    const since = new Date(Date.now() - opts.sinceMs);
    const conditions = [sql`${analystRefreshAuditLog.startedAt} > ${since}`];
    if (opts.adminId != null) conditions.push(eq(analystRefreshAuditLog.adminId, opts.adminId));
    const rows = await db.select({ c: sql<number>`count(*)::int` })
      .from(analystRefreshAuditLog)
      .where(and(...conditions));
    return rows[0]?.c ?? 0;
  }

  // ── Analyst Refresh Settings (singleton row id=1) ─────────────
  async getAnalystRefreshSettings(): Promise<AnalystRefreshSettings> {
    const [row] = await db.select().from(analystRefreshSettings).where(eq(analystRefreshSettings.id, 1)).limit(1);
    if (row) return row;
    const [inserted] = await db.insert(analystRefreshSettings)
      .values({ id: 1, globalCadenceDays: 30 })
      .returning();
    return inserted;
  }

  async updateAnalystRefreshSettings(patch: InsertAnalystRefreshSettings): Promise<AnalystRefreshSettings> {
    await this.getAnalystRefreshSettings(); // ensure exists
    const [row] = await db.update(analystRefreshSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analystRefreshSettings.id, 1))
      .returning();
    return row;
  }

  async upsertFbBenchmark(data: InsertFbBenchmark): Promise<FbBenchmark> {
    const [existing] = await db.select().from(fbBenchmarks)
      .where(and(eq(fbBenchmarks.market, data.market), eq(fbBenchmarks.propertyType, data.propertyType)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(fbBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(fbBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(fbBenchmarks)
      .values(data as typeof fbBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }
}

