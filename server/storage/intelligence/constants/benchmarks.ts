import {
  benchmarkSnapshots, hospitalityBenchmarks, taxBulletinCache,
  marketAdrIndex, seasonalCalendars, eventCalendars, airportDistances, laborRates, fbBenchmarks,
  type BenchmarkSnapshot, type InsertBenchmarkSnapshot,
  type HospitalityBenchmark, type InsertHospitalityBenchmark,
  type MarketAdrIndex, type InsertMarketAdrIndex,
  type SeasonalCalendar, type InsertSeasonalCalendar,
  type EventCalendar, type InsertEventCalendar,
  type AirportDistance, type InsertAirportDistance,
  type LaborRate, type InsertLaborRate,
  type FbBenchmark, type InsertFbBenchmark,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { vectorChunks } from "@shared/schema/vector-chunks";
import { researchRuns } from "@shared/schema";
import type { IntelligenceTx } from "../tx";
import { indexBenchmarkSnapshot } from "../../../ai/vector-store-service";
import { mapCategoryToKpis } from "../../../ai/vector-indexing";
import { logger } from "../../../logger";
import {
  SPECIALIST_TOOLS,
  type SpecialistTool,
  type ToolLastBuiltSource,
} from "../../../../engine/analyst/registry/specialist-tools";

const SERVER_BOOT_AT = new Date();

/**
 * BenchmarksStorage — every "market-fact" reference table the analyst
 * surfaces read: cross-category benchmark snapshots, hospitality
 * benchmarks, market ADR index, seasonal/event calendars, airport
 * distances, labor rates, F&B benchmarks. Also owns the specialist-tool
 * freshness lookup since most of its `kind: "table"` cases dispatch into
 * tables in this module.
 */
export class BenchmarksStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

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

  // ── Hospitality Benchmarks ───────────────────────────────────
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

  // ── Market ADR Index ─────────────────────────────────────────
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

  // ── Seasonal Calendars ───────────────────────────────────────
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

  // ── Event Calendars ──────────────────────────────────────────
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

  // ── Airport Distances ────────────────────────────────────────
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

  // ── Labor Rates ──────────────────────────────────────────────
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

  // ── F&B Benchmarks ───────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────
  // Specialist tool freshness lookup (Phase 2b — Resources inspectability).
  //
  // Resolves `lastBuiltAt` for a registered Specialist tool by dispatching
  // on the registry's `lastBuiltSource` discriminant. Loud-fails on unknown
  // table names so adding a new source kind to the registry without wiring
  // it here is caught at first call rather than silently returning null.
  // ──────────────────────────────────────────────────────────────
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
//
// `max(timestamp)` over a raw `sql\`...\`` aggregate bypasses Drizzle's
// per-column type cast and the pg driver hands the value back as an ISO
// string. Centralise the Date coercion here so downstream callers can
// safely call `.toISOString()` on the result, as the return type promises.
function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;
  const d = new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
          return toDate(row?.at);
        }
        case "market_adr_index": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${marketAdrIndex.updatedAt})` })
            .from(marketAdrIndex);
          return toDate(row?.at);
        }
        case "benchmark_snapshots": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${benchmarkSnapshots.fetchedAt})` })
            .from(benchmarkSnapshots);
          return toDate(row?.at);
        }
        case "tax_bulletin_cache": {
          const [row] = await tx.db.select({ at: sql<Date | null>`max(${taxBulletinCache.fetchedAt})` })
            .from(taxBulletinCache);
          return toDate(row?.at);
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
      return toDate(row?.at);
    }
    default: {
      const _exhaustive: never = source;
      throw new Error(`specialist-tools: unwired lastBuiltSource kind "${(_exhaustive as { kind: string }).kind}"`);
    }
  }
}
