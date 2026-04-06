import {
  assumptionGuidance, researchRuns, benchmarkSnapshots, relaxationTraces,
  guidanceDecisions, rebeccaConversations, rebeccaMessages, rebeccaEmails,
  rebeccaFeedback, coverageSnapshots, sourceRegistry, integrationKeyRotations,
  pipelinePolicies,
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
  type IntegrationKeyRotation, type InsertIntegrationKeyRotation,
  type PipelinePolicy, type InsertPipelinePolicy,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull } from "drizzle-orm";

export class IntelligenceV2Storage {
  async getAssumptionGuidance(scenarioId: number, entityType: string, entityId: number): Promise<AssumptionGuidance[]> {
    return db.select().from(assumptionGuidance)
      .where(and(
        eq(assumptionGuidance.scenarioId, scenarioId),
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

    const [existing] = await db.select().from(assumptionGuidance).where(and(...conditions)).limit(1);
    if (existing) {
      const [updated] = await db.update(assumptionGuidance)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(assumptionGuidance.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(assumptionGuidance)
      .values(data as typeof assumptionGuidance.$inferInsert)
      .returning();
    return inserted;
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
      return updated;
    }
    const [inserted] = await db.insert(benchmarkSnapshots)
      .values(data as typeof benchmarkSnapshots.$inferInsert)
      .returning();
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

  async getRebeccaConversations(userId: number): Promise<RebeccaConversation[]> {
    return db.select().from(rebeccaConversations)
      .where(eq(rebeccaConversations.userId, userId))
      .orderBy(desc(rebeccaConversations.lastMessageAt));
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

  async getRebeccaMessages(conversationId: number): Promise<RebeccaMessage[]> {
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

  async createKeyRotation(data: InsertIntegrationKeyRotation): Promise<IntegrationKeyRotation> {
    const [rotation] = await db.insert(integrationKeyRotations)
      .values(data as typeof integrationKeyRotations.$inferInsert)
      .returning();
    return rotation;
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
}
