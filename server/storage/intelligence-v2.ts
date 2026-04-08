import {
  assumptionGuidance, researchRuns, benchmarkSnapshots, relaxationTraces,
  guidanceDecisions, rebeccaConversations, rebeccaMessages, rebeccaEmails,
  rebeccaFeedback, coverageSnapshots, sourceRegistry, sourceCallLogs, engineSuggestedLines,
  integrationKeyRotations, pipelinePolicies, scheduledResearchWorkflows, rebeccaGuardrails,
  rebeccaKnowledgeBase, rebeccaKnowledgeHistory,
  type AssumptionGuidance, type InsertAssumptionGuidance,
  type ResearchRun, type InsertResearchRun,
  type BenchmarkSnapshot, type InsertBenchmarkSnapshot,
  type RelaxationTrace, type InsertRelaxationTrace,
  type GuidanceDecision, type InsertGuidanceDecision,
  type RebeccaConversation, type InsertRebeccaConversation,
  type RebeccaMessage, type InsertRebeccaMessage,
  type RebeccaEmail, type InsertRebeccaEmail,
  type RebeccaFeedback, type InsertRebeccaFeedback,
  type CoverageSnapshot, type InsertCoverageSnapshot,
  type SourceRegistryEntry, type InsertSourceRegistryEntry,
  type SourceCallLog, type InsertSourceCallLog,
  type EngineSuggestedLine, type InsertEngineSuggestedLine,
  type IntegrationKeyRotation, type InsertIntegrationKeyRotation,
  type PipelinePolicy, type InsertPipelinePolicy,
  type ScheduledResearchWorkflow, type InsertScheduledResearchWorkflow,
  type RebeccaGuardrail, type InsertRebeccaGuardrail,
  type RebeccaKBEntry, type InsertRebeccaKBEntry,
  type RebeccaKBHistory, type InsertRebeccaKBHistory,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull, lte, sql } from "drizzle-orm";
import { indexBenchmarkSnapshot } from "../ai/pinecone-service";
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

      // Fire-and-forget: re-index to Pinecone comparables namespace
      try {
        indexBenchmarkSnapshot({
          market: updated.snapshotKey,
          propertyType: updated.category,
          adr: updated.category === "adr" ? updated.value : null,
          occupancy: updated.category === "occupancy" ? updated.value : null,
          capRate: updated.category === "capRate" ? updated.value : null,
          revpar: updated.category === "revpar" ? updated.value : null,
          source: updated.source ?? "unknown",
          snapshotDate: updated.fetchedAt.toISOString(),
        }).catch(err => logger.warn(`Pinecone benchmark re-index failed: ${err}`, "intelligence-v2"));
      } catch (err) {
        logger.warn(`Pinecone benchmark re-index failed: ${err}`, "intelligence-v2");
      }

      return updated;
    }
    const [inserted] = await db.insert(benchmarkSnapshots)
      .values(data as typeof benchmarkSnapshots.$inferInsert)
      .returning();

    // Fire-and-forget: index to Pinecone comparables namespace
    try {
      indexBenchmarkSnapshot({
        market: inserted.snapshotKey,
        propertyType: inserted.category,
        adr: inserted.category === "adr" ? inserted.value : null,
        occupancy: inserted.category === "occupancy" ? inserted.value : null,
        capRate: inserted.category === "capRate" ? inserted.value : null,
        revpar: inserted.category === "revpar" ? inserted.value : null,
        source: inserted.source ?? "unknown",
        snapshotDate: inserted.fetchedAt.toISOString(),
      }).catch(err => logger.warn(`Pinecone benchmark index failed: ${err}`, "intelligence-v2"));
    } catch (err) {
      logger.warn(`Pinecone benchmark index failed: ${err}`, "intelligence-v2");
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

  async createRebeccaConversation(data: InsertRebeccaConversation): Promise<RebeccaConversation> {
    const [conv] = await db.insert(rebeccaConversations)
      .values(data as typeof rebeccaConversations.$inferInsert)
      .returning();
    return conv;
  }

  async getRebeccaConversation(conversationId: number): Promise<RebeccaConversation | undefined> {
    const [conv] = await db.select().from(rebeccaConversations)
      .where(eq(rebeccaConversations.id, conversationId))
      .limit(1);
    return conv;
  }

  async getOrCreateConversation(
    userId: number,
    contextType: string,
    contextKey: string | null,
    propertyId?: number | null,
    model?: string | null,
  ): Promise<RebeccaConversation> {
    const conditions = [
      eq(rebeccaConversations.userId, userId),
      eq(rebeccaConversations.contextType, contextType),
    ];
    if (contextKey) {
      conditions.push(eq(rebeccaConversations.contextKey, contextKey));
    } else {
      conditions.push(isNull(rebeccaConversations.contextKey));
    }
    if (propertyId) {
      conditions.push(eq(rebeccaConversations.propertyId, propertyId));
    }

    const existing = await db.select().from(rebeccaConversations)
      .where(and(...conditions))
      .orderBy(desc(rebeccaConversations.lastMessageAt))
      .limit(1);

    if (existing.length > 0) return existing[0];

    return this.createRebeccaConversation({
      userId,
      contextType,
      contextKey,
      propertyId: propertyId ?? undefined,
      model: model ?? undefined,
    });
  }

  async getRebeccaConversations(userId?: number): Promise<RebeccaConversation[]> {
    const q = db.select().from(rebeccaConversations)
      .orderBy(desc(rebeccaConversations.lastMessageAt));
    if (userId) return q.where(eq(rebeccaConversations.userId, userId));
    return q;
  }

  async addRebeccaMessage(data: InsertRebeccaMessage): Promise<RebeccaMessage> {
    const [msg] = await db.insert(rebeccaMessages)
      .values(data as typeof rebeccaMessages.$inferInsert)
      .returning();
    await db.update(rebeccaConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(rebeccaConversations.id, data.conversationId));
    return msg;
  }

  async getRebeccaMessages(conversationId: number, limit?: number): Promise<RebeccaMessage[]> {
    if (limit) {
      const rows = await db.select().from(rebeccaMessages)
        .where(eq(rebeccaMessages.conversationId, conversationId))
        .orderBy(desc(rebeccaMessages.createdAt))
        .limit(limit);
      return rows.reverse();
    }
    return db.select().from(rebeccaMessages)
      .where(eq(rebeccaMessages.conversationId, conversationId))
      .orderBy(rebeccaMessages.createdAt);
  }

  async createRebeccaEmail(data: InsertRebeccaEmail): Promise<RebeccaEmail> {
    const [email] = await db.insert(rebeccaEmails)
      .values(data as typeof rebeccaEmails.$inferInsert)
      .returning();
    return email;
  }

  async createRebeccaFeedback(data: InsertRebeccaFeedback): Promise<RebeccaFeedback> {
    const [fb] = await db.insert(rebeccaFeedback)
      .values(data as typeof rebeccaFeedback.$inferInsert)
      .returning();
    return fb;
  }

  async getRebeccaFeedback(status?: string): Promise<RebeccaFeedback[]> {
    if (status) {
      return db.select().from(rebeccaFeedback)
        .where(eq(rebeccaFeedback.status, status))
        .orderBy(desc(rebeccaFeedback.createdAt));
    }
    return db.select().from(rebeccaFeedback).orderBy(desc(rebeccaFeedback.createdAt));
  }

  async updateRebeccaFeedbackStatus(feedbackId: number, status: string): Promise<RebeccaFeedback | undefined> {
    const [updated] = await db.update(rebeccaFeedback)
      .set({ status })
      .where(eq(rebeccaFeedback.id, feedbackId))
      .returning();
    return updated;
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

  async getRebeccaGuardrails(): Promise<RebeccaGuardrail[]> {
    return db.select().from(rebeccaGuardrails).orderBy(rebeccaGuardrails.sortOrder);
  }

  async getActiveRebeccaGuardrails(): Promise<RebeccaGuardrail[]> {
    return db.select().from(rebeccaGuardrails)
      .where(eq(rebeccaGuardrails.isActive, true))
      .orderBy(rebeccaGuardrails.sortOrder);
  }

  async createRebeccaGuardrail(data: InsertRebeccaGuardrail): Promise<RebeccaGuardrail> {
    const [row] = await db.insert(rebeccaGuardrails)
      .values(data as typeof rebeccaGuardrails.$inferInsert)
      .returning();
    return row;
  }

  async updateRebeccaGuardrail(id: number, data: Partial<InsertRebeccaGuardrail>): Promise<RebeccaGuardrail | undefined> {
    const [row] = await db.update(rebeccaGuardrails)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rebeccaGuardrails.id, id))
      .returning();
    return row;
  }

  async deleteRebeccaGuardrail(id: number): Promise<boolean> {
    const result = await db.delete(rebeccaGuardrails)
      .where(eq(rebeccaGuardrails.id, id))
      .returning();
    return result.length > 0;
  }

  async getRebeccaKBEntries(category?: string): Promise<RebeccaKBEntry[]> {
    if (category && category !== "all") {
      return db.select().from(rebeccaKnowledgeBase)
        .where(eq(rebeccaKnowledgeBase.category, category))
        .orderBy(desc(rebeccaKnowledgeBase.priority), rebeccaKnowledgeBase.title);
    }
    return db.select().from(rebeccaKnowledgeBase)
      .orderBy(desc(rebeccaKnowledgeBase.priority), rebeccaKnowledgeBase.title);
  }

  async getActiveRebeccaKBEntries(): Promise<RebeccaKBEntry[]> {
    return db.select().from(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.isActive, true))
      .orderBy(desc(rebeccaKnowledgeBase.priority));
  }

  async getRebeccaKBEntry(id: number): Promise<RebeccaKBEntry | undefined> {
    const [row] = await db.select().from(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.id, id))
      .limit(1);
    return row;
  }

  async createRebeccaKBEntry(data: InsertRebeccaKBEntry): Promise<RebeccaKBEntry> {
    const [row] = await db.insert(rebeccaKnowledgeBase)
      .values(data as typeof rebeccaKnowledgeBase.$inferInsert)
      .returning();
    return row;
  }

  async updateRebeccaKBEntry(id: number, data: Partial<InsertRebeccaKBEntry>, changedBy?: string): Promise<RebeccaKBEntry | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(rebeccaKnowledgeBase)
        .where(eq(rebeccaKnowledgeBase.id, id)).limit(1);
      if (!existing) return undefined;

      await tx.insert(rebeccaKnowledgeHistory).values({
        entryId: id,
        snapshot: {
          title: existing.title,
          content: existing.content,
          category: existing.category,
          source: existing.source,
          tags: existing.tags,
          priority: existing.priority,
          isActive: existing.isActive,
        },
        changedBy: changedBy ?? null,
      } as typeof rebeccaKnowledgeHistory.$inferInsert);

      const [updated] = await tx.update(rebeccaKnowledgeBase)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(rebeccaKnowledgeBase.id, id))
        .returning();
      return updated;
    });
  }

  async deleteRebeccaKBEntry(id: number): Promise<boolean> {
    const result = await db.delete(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.id, id))
      .returning();
    return result.length > 0;
  }

  async getRebeccaKBHistory(entryId: number): Promise<RebeccaKBHistory[]> {
    return db.select().from(rebeccaKnowledgeHistory)
      .where(eq(rebeccaKnowledgeHistory.entryId, entryId))
      .orderBy(desc(rebeccaKnowledgeHistory.createdAt));
  }

  async rollbackRebeccaKBEntry(entryId: number, historyId: number, changedBy?: string): Promise<RebeccaKBEntry | undefined> {
    const [historyRow] = await db.select().from(rebeccaKnowledgeHistory)
      .where(and(eq(rebeccaKnowledgeHistory.id, historyId), eq(rebeccaKnowledgeHistory.entryId, entryId)))
      .limit(1);
    if (!historyRow) return undefined;

    const snap = historyRow.snapshot as Record<string, unknown>;
    return this.updateRebeccaKBEntry(entryId, {
      title: snap.title as string,
      content: snap.content as string,
      category: snap.category as string,
      source: snap.source as string,
      tags: snap.tags as string[],
      priority: snap.priority as number,
      isActive: snap.isActive as boolean,
    }, changedBy);
  }

  async getRebeccaKBStats(): Promise<{ total: number; active: number; byCategory: Record<string, number> }> {
    const rows = await db.execute(sql`
      SELECT category, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_active)::int AS active_count
      FROM rebecca_knowledge_base GROUP BY category
    `);
    const byCategory: Record<string, number> = {};
    let total = 0;
    let active = 0;
    for (const row of (rows.rows ?? []) as { category: string; count: number; active_count: number }[]) {
      byCategory[row.category] = row.count;
      total += row.count;
      active += row.active_count;
    }
    return { total, active, byCategory };
  }
}
