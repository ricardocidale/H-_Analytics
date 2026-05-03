import {
  sourceRegistry, sourceCallLogs, integrationKeyRotations, pipelinePolicies,
  type SourceRegistryEntry, type InsertSourceRegistryEntry,
  type SourceCallLog, type InsertSourceCallLog,
  type IntegrationKeyRotation, type InsertIntegrationKeyRotation,
  type PipelinePolicy, type InsertPipelinePolicy,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import type { IntelligenceTx } from "../tx";

/**
 * SourcesStorage — source registry, source call logs, integration key
 * rotations, and pipeline policies. These all describe the external data
 * pipes the analyst surfaces consult; grouping them keeps health-check /
 * trust-score logic alongside the registry it scores.
 */
export class SourcesStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

  async getSourceRegistry(): Promise<SourceRegistryEntry[]> {
    return this._ctx.db.select().from(sourceRegistry);
  }

  async getSourceRegistryEntry(id: number): Promise<SourceRegistryEntry | undefined> {
    const [row] = await this._ctx.db.select().from(sourceRegistry)
      .where(eq(sourceRegistry.id, id)).limit(1);
    return row;
  }

  async upsertSourceRegistry(data: InsertSourceRegistryEntry): Promise<SourceRegistryEntry> {
    const [existing] = await this._ctx.db.select().from(sourceRegistry)
      .where(eq(sourceRegistry.serviceKey, data.serviceKey))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(sourceRegistry)
        .set(data)
        .where(eq(sourceRegistry.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(sourceRegistry)
      .values(data as typeof sourceRegistry.$inferInsert)
      .returning();
    return inserted;
  }

  async createSourceRegistryEntry(data: InsertSourceRegistryEntry): Promise<SourceRegistryEntry> {
    const [inserted] = await this._ctx.db.insert(sourceRegistry)
      .values(data as typeof sourceRegistry.$inferInsert)
      .returning();
    return inserted;
  }

  async updateSourceRegistryEntry(id: number, data: Partial<InsertSourceRegistryEntry>): Promise<SourceRegistryEntry | undefined> {
    const [updated] = await this._ctx.db.update(sourceRegistry)
      .set(data)
      .where(eq(sourceRegistry.id, id))
      .returning();
    return updated;
  }

  async deleteSourceRegistryEntry(id: number): Promise<void> {
    await this._ctx.db.delete(sourceRegistry).where(eq(sourceRegistry.id, id));
  }

  /** Update source health check metrics with EWMA success rate and derived trust score. */
  async updateSourceHealthCheck(serviceKey: string, healthy: boolean, latencyMs: number, checkedAt: Date): Promise<void> {
    await this._ctx.db.update(sourceRegistry)
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
    const rows = await this._ctx.db.select({
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
    const [log] = await this._ctx.db.insert(sourceCallLogs)
      .values(data as typeof sourceCallLogs.$inferInsert)
      .returning();
    return log;
  }

  async getSourceCallLogs(sourceId: number, limit: number = 50): Promise<SourceCallLog[]> {
    return this._ctx.db.select().from(sourceCallLogs)
      .where(eq(sourceCallLogs.sourceId, sourceId))
      .orderBy(desc(sourceCallLogs.timestamp))
      .limit(limit);
  }

  async createKeyRotation(data: InsertIntegrationKeyRotation): Promise<IntegrationKeyRotation> {
    const [rotation] = await this._ctx.db.insert(integrationKeyRotations)
      .values(data as typeof integrationKeyRotations.$inferInsert)
      .returning();
    return rotation;
  }

  async getKeyRotationsByService(serviceKey: string): Promise<IntegrationKeyRotation[]> {
    return this._ctx.db.select().from(integrationKeyRotations)
      .where(eq(integrationKeyRotations.serviceKey, serviceKey))
      .orderBy(desc(integrationKeyRotations.rotatedAt))
      .limit(20);
  }

  async getPipelinePolicies(): Promise<PipelinePolicy[]> {
    return this._ctx.db.select().from(pipelinePolicies);
  }

  async upsertPipelinePolicy(data: InsertPipelinePolicy): Promise<PipelinePolicy> {
    const [existing] = await this._ctx.db.select().from(pipelinePolicies)
      .where(eq(pipelinePolicies.policyKey, data.policyKey))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(pipelinePolicies)
        .set(data)
        .where(eq(pipelinePolicies.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(pipelinePolicies)
      .values(data as typeof pipelinePolicies.$inferInsert)
      .returning();
    return inserted;
  }
}
