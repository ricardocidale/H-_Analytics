import {
  benchmarkSnapshots, sourceRegistry, sourceCallLogs,
  integrationKeyRotations, pipelinePolicies, scheduledResearchWorkflows,
  hospitalityBenchmarks, taxBulletinCache,
  analystWatchdogBenchmarks,
  marketAdrIndex, seasonalCalendars, eventCalendars, airportDistances, laborRates, fbBenchmarks,
  capitalRaiseBenchmarks, exitMultiples, analystRefreshAuditLog, analystRefreshSettings,
  analystCooldowns,
  type TaxBulletinCache, type InsertTaxBulletinCache,
  type AnalystWatchdogBenchmarks, type InsertAnalystWatchdogBenchmarks,
  type CapitalRaiseBenchmark, type InsertCapitalRaiseBenchmark,
  type ExitMultiple, type InsertExitMultiple,
  type AnalystRefreshAuditLog, type InsertAnalystRefreshAuditLog,
  type AnalystRefreshSettings, type InsertAnalystRefreshSettings,
  type BenchmarkSnapshot, type InsertBenchmarkSnapshot,
  type SourceRegistryEntry, type InsertSourceRegistryEntry,
  type SourceCallLog, type InsertSourceCallLog,
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
import { eq, and, desc, lte, sql } from "drizzle-orm";
import { vectorChunks } from "@shared/schema/vector-chunks";
import { researchRuns } from "@shared/schema";
import type { IntelligenceTx } from "./tx";
import { indexBenchmarkSnapshot } from "../../ai/vector-store-service";
import { mapCategoryToKpis } from "../../ai/vector-indexing";
import { logger } from "../../logger";
import {
  SPECIALIST_TOOLS,
  type SpecialistTool,
  type ToolLastBuiltSource,
} from "../../../engine/analyst/registry/specialist-tools";

const SERVER_BOOT_AT = new Date();

/**
 * ConstantsStorage — every "model-constant–adjacent" table the
 * intelligence-v2 surface owns: benchmarks, source registry, scheduled
 * workflows, watchdog/exit-multiple/capital-raise tables, the analyst
 * refresh audit + settings, the per-user analyst cooldown, and the
 * tax-bulletin cache, plus the specialist-tool freshness lookup.
 *
 * This is the largest of the three split modules; it deliberately groups
 * everything that ultimately feeds the Constants admin surface and the
 * specialist-driven refresh flows. Each method routes through
 * `this._ctx.db`, so multi-domain transactions can stitch in via
 * IntelligenceTx without code changes here.
 */
export class ConstantsStorage {
  private readonly _ctx: IntelligenceTx;
  constructor(tx: IntelligenceTx) { this._ctx = tx; }

  // ────────────────────────────────────────────────────────────
  // Analyst cooldown (per-user, durable across restarts/instances).
  // Replaces the earlier in-memory Map; backs POST /api/analyst/refresh.
  // ────────────────────────────────────────────────────────────
  async getAnalystCooldownReservedAt(userId: number): Promise<Date | null> {
    const [row] = await this._ctx.db.select().from(analystCooldowns)
      .where(eq(analystCooldowns.userId, userId))
      .limit(1);
    return row?.reservedAt ?? null;
  }

  /**
   * Atomic admission control for the analyst refresh cooldown.
   *
   * INSERTs a fresh reservation, OR UPDATEs an existing one only when the
   * prior reservation is older than `cooldownMs`. Returns `granted=true`
   * when the slot is acquired (caller may run), or `granted=false` with
   * `retryAfterMs` when the cooldown is still active.
   *
   * This is the only correct primitive for serving multiple admin clicks
   * (or multiple app instances) without two of them passing the gate; a
   * separate read-then-reserve sequence would race.
   */
  async tryReserveAnalystCooldown(
    userId: number,
    now: Date,
    cooldownMs: number,
  ): Promise<{ granted: true } | { granted: false; retryAfterMs: number }> {
    const cutoff = new Date(now.getTime() - cooldownMs);
    const [row] = await this._ctx.db.insert(analystCooldowns)
      .values({ userId, reservedAt: now })
      .onConflictDoUpdate({
        target: analystCooldowns.userId,
        set: { reservedAt: now },
        setWhere: lte(analystCooldowns.reservedAt, cutoff),
      })
      .returning({ reservedAt: analystCooldowns.reservedAt });
    // RETURNING is empty when the conflict's WHERE clause filtered the
    // UPDATE — meaning a recent reservation already exists and we lost.
    if (!row) {
      const [existing] = await this._ctx.db.select().from(analystCooldowns)
        .where(eq(analystCooldowns.userId, userId))
        .limit(1);
      const elapsed = existing ? now.getTime() - existing.reservedAt.getTime() : 0;
      const retryAfterMs = Math.max(0, cooldownMs - elapsed);
      return { granted: false, retryAfterMs };
    }
    // RETURNING came back with our `now` — we acquired the slot.
    return { granted: true };
  }

  /**
   * Test/admin hook — clears cooldown for one user, or all users if `userId`
   * is omitted. Production code should not call this.
   */
  async clearAnalystCooldown(userId?: number): Promise<void> {
    if (userId == null) {
      await this._ctx.db.delete(analystCooldowns);
    } else {
      await this._ctx.db.delete(analystCooldowns).where(eq(analystCooldowns.userId, userId));
    }
  }

  // ── Benchmark snapshots ──────────────────────────────────────
  async getBenchmarkSnapshots(category?: string): Promise<BenchmarkSnapshot[]> {
    if (category) {
      return this._ctx.db.select().from(benchmarkSnapshots).where(eq(benchmarkSnapshots.category, category));
    }
    return this._ctx.db.select().from(benchmarkSnapshots);
  }

  async upsertBenchmarkSnapshot(data: InsertBenchmarkSnapshot): Promise<BenchmarkSnapshot> {
    const [existing] = await this._ctx.db.select().from(benchmarkSnapshots)
      .where(eq(benchmarkSnapshots.snapshotKey, data.snapshotKey))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(benchmarkSnapshots)
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
    const [inserted] = await this._ctx.db.insert(benchmarkSnapshots)
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

  // ────────────────────────────────────────────────────────────
  // Tax bulletin cache (Phase 2c — Helena's tax-bulletin-diff tool).
  //
  // One row per (country, subdivision). `subdivision` is stored as the empty
  // string for federal-level / no-subdivision sources so the unique
  // constraint actually fires (Postgres treats NULLs as distinct in unique
  // indexes).
  //
  // The tool calls `getTaxBulletinCache` to fetch the prior payload before
  // diffing, then `upsertTaxBulletinCache` to persist the new one. Both
  // paths loud-fail; persistence errors are NOT swallowed — Helena's
  // pipeline catches the throw and falls back to LLM with the failure
  // recorded in the run metadata.
  // ────────────────────────────────────────────────────────────
  async getTaxBulletinCache(
    country: string,
    subdivision: string | null,
  ): Promise<TaxBulletinCache | undefined> {
    const sub = subdivision ?? "";
    const [row] = await this._ctx.db.select().from(taxBulletinCache)
      .where(and(
        eq(taxBulletinCache.country, country),
        eq(taxBulletinCache.subdivision, sub),
      ))
      .limit(1);
    return row;
  }

  async upsertTaxBulletinCache(data: InsertTaxBulletinCache): Promise<TaxBulletinCache> {
    const sub = data.subdivision ?? "";
    return this._ctx.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(taxBulletinCache)
        .where(and(
          eq(taxBulletinCache.country, data.country),
          eq(taxBulletinCache.subdivision, sub),
        ))
        .limit(1);
      if (existing) {
        const [updated] = await tx.update(taxBulletinCache)
          .set({
            sourceUrl: data.sourceUrl,
            publisher: data.publisher,
            bulletinHash: data.bulletinHash,
            parsedValues: data.parsedValues,
            rawExcerpt: data.rawExcerpt,
            fetchedAt: new Date(),
          })
          .where(eq(taxBulletinCache.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(taxBulletinCache)
        .values({ ...data, subdivision: sub } as typeof taxBulletinCache.$inferInsert)
        .returning();
      return inserted;
    });
  }

  // ── Source registry ──────────────────────────────────────────
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
      return this._ctx.db.select().from(hospitalityBenchmarks)
        .where(and(...conditions))
        .orderBy(hospitalityBenchmarks.category, hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
    }
    return this._ctx.db.select().from(hospitalityBenchmarks)
      .orderBy(hospitalityBenchmarks.category, hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
  }

  async getHospitalityBenchmarksByCategory(category: string): Promise<HospitalityBenchmark[]> {
    return this._ctx.db.select().from(hospitalityBenchmarks)
      .where(and(
        eq(hospitalityBenchmarks.category, category),
        eq(hospitalityBenchmarks.isActive, true),
      ))
      .orderBy(hospitalityBenchmarks.segment, hospitalityBenchmarks.metricKey);
  }

  async upsertHospitalityBenchmark(data: InsertHospitalityBenchmark): Promise<HospitalityBenchmark> {
    const country = data.country ?? "US";
    const [existing] = await this._ctx.db.select().from(hospitalityBenchmarks)
      .where(and(
        eq(hospitalityBenchmarks.metricKey, data.metricKey),
        eq(hospitalityBenchmarks.country, country),
        eq(hospitalityBenchmarks.sourceYear, data.sourceYear),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await this._ctx.db.update(hospitalityBenchmarks)
        .set({ ...data, country, updatedAt: new Date() })
        .where(eq(hospitalityBenchmarks.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await this._ctx.db.insert(hospitalityBenchmarks)
      .values({ ...data, country } as typeof hospitalityBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  async getHospitalityBenchmarkById(id: number): Promise<HospitalityBenchmark | undefined> {
    const [row] = await this._ctx.db.select().from(hospitalityBenchmarks)
      .where(eq(hospitalityBenchmarks.id, id)).limit(1);
    return row;
  }

  async updateHospitalityBenchmark(id: number, data: Partial<InsertHospitalityBenchmark>): Promise<HospitalityBenchmark | undefined> {
    const [updated] = await this._ctx.db.update(hospitalityBenchmarks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hospitalityBenchmarks.id, id))
      .returning();
    return updated;
  }

  // ── Market ADR Index ───────────────────────────────────────────────────
  async getMarketAdrIndex(market: string, quarter?: string): Promise<MarketAdrIndex[]> {
    const conditions = [eq(marketAdrIndex.market, market)];
    if (quarter) conditions.push(eq(marketAdrIndex.quarter, quarter));
    return this._ctx.db.select().from(marketAdrIndex)
      .where(and(...conditions))
      .orderBy(desc(marketAdrIndex.quarter));
  }

  async upsertMarketAdrIndex(data: InsertMarketAdrIndex): Promise<MarketAdrIndex> {
    const [existing] = await this._ctx.db.select().from(marketAdrIndex)
      .where(and(eq(marketAdrIndex.market, data.market), eq(marketAdrIndex.quarter, data.quarter)))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(marketAdrIndex)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(marketAdrIndex.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(marketAdrIndex)
      .values(data as typeof marketAdrIndex.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Seasonal Calendars ─────────────────────────────────────────────────
  async getSeasonalCalendar(market: string): Promise<SeasonalCalendar[]> {
    return this._ctx.db.select().from(seasonalCalendars)
      .where(eq(seasonalCalendars.market, market))
      .orderBy(seasonalCalendars.month);
  }

  async upsertSeasonalCalendar(data: InsertSeasonalCalendar): Promise<SeasonalCalendar> {
    const [existing] = await this._ctx.db.select().from(seasonalCalendars)
      .where(and(eq(seasonalCalendars.market, data.market), eq(seasonalCalendars.month, data.month)))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(seasonalCalendars)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(seasonalCalendars.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(seasonalCalendars)
      .values(data as typeof seasonalCalendars.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Event Calendars ────────────────────────────────────────────────────
  async getEventCalendar(market: string): Promise<EventCalendar[]> {
    return this._ctx.db.select().from(eventCalendars)
      .where(eq(eventCalendars.market, market))
      .orderBy(eventCalendars.startMonth);
  }

  async upsertEventCalendar(data: InsertEventCalendar): Promise<EventCalendar> {
    const [existing] = await this._ctx.db.select().from(eventCalendars)
      .where(and(eq(eventCalendars.market, data.market), eq(eventCalendars.eventName, data.eventName)))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(eventCalendars)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(eventCalendars.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(eventCalendars)
      .values(data as typeof eventCalendars.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Airport Distances ──────────────────────────────────────────────────
  async getAirportDistances(propertyId: number): Promise<AirportDistance[]> {
    return this._ctx.db.select().from(airportDistances)
      .where(eq(airportDistances.propertyId, propertyId))
      .orderBy(airportDistances.distanceKm);
  }

  async upsertAirportDistance(data: InsertAirportDistance): Promise<AirportDistance> {
    const [existing] = await this._ctx.db.select().from(airportDistances)
      .where(and(
        eq(airportDistances.propertyId, data.propertyId),
        eq(airportDistances.airportCode, data.airportCode),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(airportDistances)
        .set({ ...data, computedAt: new Date() })
        .where(eq(airportDistances.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(airportDistances)
      .values(data as typeof airportDistances.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Labor Rates ────────────────────────────────────────────────────────
  async getLaborRates(market: string, country?: string): Promise<LaborRate[]> {
    const conditions = [eq(laborRates.market, market)];
    if (country) conditions.push(eq(laborRates.country, country));
    return this._ctx.db.select().from(laborRates)
      .where(and(...conditions))
      .orderBy(laborRates.role);
  }

  async upsertLaborRate(data: InsertLaborRate): Promise<LaborRate> {
    const [existing] = await this._ctx.db.select().from(laborRates)
      .where(and(
        eq(laborRates.market, data.market),
        eq(laborRates.role, data.role),
        eq(laborRates.employmentType, data.employmentType ?? "fte"),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(laborRates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(laborRates.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(laborRates)
      .values(data as typeof laborRates.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Analyst Watchdog Benchmarks (per-user cache) ──────────────────────
  // Stub seeding: when no row exists for the user, insert one populated from
  // DEFAULT_CAPITAL_RAISE_BENCHMARKS. Future task swaps the seed for an
  // LLM-refreshed populator without changing the read path.
  async getAnalystWatchdogBenchmarks(userId: number): Promise<AnalystWatchdogBenchmarks> {
    const rows = await this._ctx.db.select().from(analystWatchdogBenchmarks)
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
    const [inserted] = await this._ctx.db.insert(analystWatchdogBenchmarks).values(seed).returning();
    return inserted;
  }

  async upsertAnalystWatchdogBenchmarks(
    userId: number,
    row: Partial<InsertAnalystWatchdogBenchmarks>,
  ): Promise<AnalystWatchdogBenchmarks> {
    const existing = await this._ctx.db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(analystWatchdogBenchmarks.id, existing[0].id))
        .returning();
      return updated;
    }
    // Seed a base row first so every column has a value, then patch.
    const seeded = await this.getAnalystWatchdogBenchmarks(userId);
    const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(analystWatchdogBenchmarks.id, seeded.id))
      .returning();
    return updated;
  }

  // ── F&B Benchmarks ─────────────────────────────────────────────────────
  async getFbBenchmarks(market: string, propertyType?: string): Promise<FbBenchmark[]> {
    const conditions = [eq(fbBenchmarks.market, market)];
    if (propertyType) conditions.push(eq(fbBenchmarks.propertyType, propertyType));
    return this._ctx.db.select().from(fbBenchmarks)
      .where(and(...conditions))
      .orderBy(fbBenchmarks.propertyType);
  }

  async upsertFbBenchmark(data: InsertFbBenchmark): Promise<FbBenchmark> {
    const [existing] = await this._ctx.db.select().from(fbBenchmarks)
      .where(and(eq(fbBenchmarks.market, data.market), eq(fbBenchmarks.propertyType, data.propertyType)))
      .limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(fbBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(fbBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(fbBenchmarks)
      .values(data as typeof fbBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Capital Raise Benchmarks ──────────────────────────────────
  async getCapitalRaiseBenchmarks(): Promise<CapitalRaiseBenchmark[]> {
    return this._ctx.db.select().from(capitalRaiseBenchmarks).orderBy(capitalRaiseBenchmarks.dimensionKey);
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
    const [existing] = await this._ctx.db.select().from(capitalRaiseBenchmarks)
      .where(eq(capitalRaiseBenchmarks.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(capitalRaiseBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(capitalRaiseBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(capitalRaiseBenchmarks)
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

  // ── Exit Multiples ────────────────────────────────────────────
  async getExitMultiples(): Promise<ExitMultiple[]> {
    return this._ctx.db.select().from(exitMultiples).orderBy(exitMultiples.dimensionKey);
  }

  async getExitMultiplesSummary(): Promise<{
    rows: ExitMultiple[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getExitMultiples();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertExitMultiple(data: InsertExitMultiple): Promise<ExitMultiple> {
    const [existing] = await this._ctx.db.select().from(exitMultiples)
      .where(eq(exitMultiples.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(exitMultiples)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(exitMultiples.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(exitMultiples)
      .values(data as typeof exitMultiples.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Analyst Refresh Audit Log ─────────────────────────────────
  async createAnalystRefreshAuditLog(data: InsertAnalystRefreshAuditLog): Promise<AnalystRefreshAuditLog> {
    const [row] = await this._ctx.db.insert(analystRefreshAuditLog)
      .values(data as typeof analystRefreshAuditLog.$inferInsert)
      .returning();
    return row;
  }

  async finalizeAnalystRefreshAuditLog(
    id: number,
    patch: Partial<InsertAnalystRefreshAuditLog> & { finishedAt?: Date },
  ): Promise<AnalystRefreshAuditLog | undefined> {
    const [row] = await this._ctx.db.update(analystRefreshAuditLog)
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
    return this._ctx.db.select().from(analystRefreshAuditLog)
      .where(where)
      .orderBy(desc(analystRefreshAuditLog.startedAt))
      .limit(opts.limit ?? 50);
  }

  async countAnalystRefreshAttempts(opts: { adminId?: number; sinceMs: number }): Promise<number> {
    const since = new Date(Date.now() - opts.sinceMs);
    const conditions = [sql`${analystRefreshAuditLog.startedAt} > ${since}`];
    if (opts.adminId != null) conditions.push(eq(analystRefreshAuditLog.adminId, opts.adminId));
    const rows = await this._ctx.db.select({ c: sql<number>`count(*)::int` })
      .from(analystRefreshAuditLog)
      .where(and(...conditions));
    return rows[0]?.c ?? 0;
  }

  // ── Analyst Refresh Settings (singleton row id=1) ─────────────
  async getAnalystRefreshSettings(): Promise<AnalystRefreshSettings> {
    const [row] = await this._ctx.db.select().from(analystRefreshSettings).where(eq(analystRefreshSettings.id, 1)).limit(1);
    if (row) return row;
    const [inserted] = await this._ctx.db.insert(analystRefreshSettings)
      .values({ id: 1, globalCadenceDays: 30 })
      .returning();
    return inserted;
  }

  async updateAnalystRefreshSettings(patch: InsertAnalystRefreshSettings): Promise<AnalystRefreshSettings> {
    await this.getAnalystRefreshSettings(); // ensure exists
    const [row] = await this._ctx.db.update(analystRefreshSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analystRefreshSettings.id, 1))
      .returning();
    return row;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Specialist tool freshness lookup (Phase 2b — Resources inspectability).
  //
  // Resolves `lastBuiltAt` for a registered Specialist tool by dispatching
  // on the registry's `lastBuiltSource` discriminant. Loud-fails on unknown
  // table names so adding a new source kind to the registry without wiring
  // it here is caught at first call rather than silently returning null.
  // ────────────────────────────────────────────────────────────────────────
  async getSpecialistToolLastBuilt(tool: SpecialistTool): Promise<Date | null> {
    return resolveToolLastBuilt(this._ctx, tool.lastBuiltSource);
  }

  async listSpecialistToolsWithFreshness(): Promise<
    Array<{ tool: SpecialistTool; lastBuiltAt: Date | null }>
  > {
    return Promise.all(
      SPECIALIST_TOOLS.map(async (tool) => ({
        tool,
        lastBuiltAt: await resolveToolLastBuilt(this._ctx, tool.lastBuiltSource).catch((err) => {
          logger.warn(
            `specialist-tools: lastBuilt resolution failed for ${tool.id}: ${err instanceof Error ? err.message : String(err)}`,
            "intelligence-v2",
          );
          return null;
        }),
      })),
    );
  }
}

// Module-private freshness resolver — kept out of the class so the
// dispatch table is exhaustively type-checked at compile time.
async function resolveToolLastBuilt(tx: IntelligenceTx, source: ToolLastBuiltSource): Promise<Date | null> {
  switch (source.kind) {
    case "static": {
      const d = new Date(source.isoDate);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`specialist-tools: invalid static isoDate "${source.isoDate}"`);
      }
      return d;
    }
    case "build-time":
      return SERVER_BOOT_AT;
    case "table": {
      switch (source.table) {
        case "vector_chunks": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${vectorChunks.updatedAt})` })
            .from(vectorChunks);
          return row?.at ?? null;
        }
        case "market_adr_index": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${marketAdrIndex.updatedAt})` })
            .from(marketAdrIndex);
          return row?.at ?? null;
        }
        case "benchmark_snapshots": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${benchmarkSnapshots.fetchedAt})` })
            .from(benchmarkSnapshots);
          return row?.at ?? null;
        }
        case "tax_bulletin_cache": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${taxBulletinCache.fetchedAt})` })
            .from(taxBulletinCache);
          return row?.at ?? null;
        }
        default: {
          const _exhaustive: never = source.table;
          throw new Error(`specialist-tools: unwired table source "${_exhaustive}"`);
        }
      }
    }
    case "research-runs-specialist": {
      const [row] = await tx.db.select({ at: sql<Date | null>`max(${researchRuns.startedAt})` })
        .from(researchRuns)
        .where(sql`${researchRuns.metadata}->>'specialistId' = ${source.specialistId}`);
      return row?.at ?? null;
    }
    default: {
      const _exhaustive: never = source;
      throw new Error(`specialist-tools: unwired lastBuiltSource kind "${(_exhaustive as { kind: string }).kind}"`);
    }
  }
}
