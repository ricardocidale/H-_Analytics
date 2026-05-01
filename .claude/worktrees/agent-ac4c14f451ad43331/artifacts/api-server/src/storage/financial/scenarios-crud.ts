/**
 * Scenario CRUD — read/write/delete/clone for the scenarios table.
 *
 * Helper `_indexScenarioAsync` fires a best-effort vector-store index call
 * after every create/update/snapshot write. Failures are swallowed (logged
 * at warn level) so an indexing outage never blocks scenario writes.
 */
import {
  scenarios,
  scenarioAccess,
  type Scenario,
  type InsertScenario,
  type UpdateScenario,
} from "@workspace/db";
import { db } from "../../db";
import { eq, desc, isNull, sql, and } from "drizzle-orm";
import { stripAutoFields } from "../utils";
import { indexScenarioSummary } from "../../ai/vector-store-service";
import { logger } from "../../logger";

async function indexScenarioAsync(scenario: Scenario): Promise<void> {
  try {
    const propArr = Array.isArray(scenario.properties) ? scenario.properties : [];
    const firstProp = propArr[0] as Record<string, any> | undefined;
    const ga = scenario.globalAssumptions as Record<string, any> | null;
    const cr = scenario.computedResults as Record<string, any> | null;

    const propertyName = firstProp?.name ?? "Portfolio";
    const location = firstProp?.location ?? firstProp?.city ?? "";
    const propertyType = firstProp?.propertyType ?? firstProp?.property_type ?? "hotel";

    await indexScenarioSummary({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      propertyId: firstProp?.id ?? 0,
      propertyName,
      location,
      propertyType,
      totalRevenue: cr?.totalRevenue ?? null,
      totalExpenses: cr?.totalExpenses ?? null,
      noi: cr?.noi ?? null,
      adr: ga?.adr ?? firstProp?.adr ?? null,
      occupancy: ga?.occupancy ?? firstProp?.occupancy ?? null,
      revpar: cr?.revpar ?? null,
      years: ga?.holdPeriod ?? ga?.projectionYears ?? null,
      createdBy: scenario.userId ? String(scenario.userId) : undefined,
    });
  } catch (err: unknown) {
    logger.warn(`Async scenario index failed: ${err instanceof Error ? err.message : err}`, "vector-store");
  }
}

export class ScenariosCrudStorage {
  async getScenariosByUser(userId: number): Promise<Scenario[]> {
    return await db.select().from(scenarios)
      .where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)))
      .orderBy(scenarios.updatedAt);
  }

  async getScenario(id: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios)
      .where(and(eq(scenarios.id, id), isNull(scenarios.deletedAt)));
    return scenario || undefined;
  }

  async getScenarioIncludingDeleted(id: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return scenario || undefined;
  }

  async getDeletedScenarios(filters?: { userId?: number }): Promise<Scenario[]> {
    const conditions = [sql`${scenarios.deletedAt} IS NOT NULL`];
    if (filters?.userId) conditions.push(eq(scenarios.userId, filters.userId));
    return await db.select().from(scenarios).where(and(...conditions)).orderBy(desc(scenarios.deletedAt));
  }

  async restoreScenario(id: number): Promise<Scenario | undefined> {
    const [restored] = await db.update(scenarios)
      .set({ deletedAt: null, deletedBy: null, purgeAfter: null, updatedAt: new Date() })
      .where(eq(scenarios.id, id))
      .returning();
    return restored || undefined;
  }

  async purgeExpiredScenarios(): Promise<number> {
    const now = new Date();
    const deleted = await db.delete(scenarios)
      .where(and(sql`${scenarios.purgeAfter} IS NOT NULL`, sql`${scenarios.purgeAfter} < ${now}`))
      .returning({ id: scenarios.id });
    return deleted.length;
  }

  async getDefaultScenario(userId: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios)
      .where(and(eq(scenarios.userId, userId), eq(scenarios.kind, "default"), isNull(scenarios.deletedAt)));
    return scenario || undefined;
  }

  async getAutoSaveScenario(userId: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios)
      .where(and(eq(scenarios.userId, userId), eq(scenarios.kind, "autosave"), isNull(scenarios.deletedAt)));
    return scenario || undefined;
  }

  async countManualScenarios(userId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(scenarios)
      .where(and(eq(scenarios.userId, userId), eq(scenarios.kind, "manual"), isNull(scenarios.deletedAt)));
    return result?.count ?? 0;
  }

  /** Save a new scenario snapshot (assumptions + properties + images + fee categories).
   *  Also computes and stores per-property overrides for efficient cross-scenario queries. */
  async createScenario(data: InsertScenario): Promise<Scenario> {
    const [scenario] = await db
      .insert(scenarios)
      .values(data as typeof scenarios.$inferInsert)
      .returning();
    indexScenarioAsync(scenario).catch(() => { /* ignore: Vector store indexing is async best-effort */ });
    return scenario;
  }

  async updateScenario(id: number, data: UpdateScenario): Promise<Scenario | undefined> {
    const [scenario] = await db
      .update(scenarios)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(scenarios.id, id))
      .returning();
    if (scenario) {
      indexScenarioAsync(scenario).catch(() => { /* ignore: Vector store indexing is async best-effort */ });
    }
    return scenario || undefined;
  }

  async updateScenarioComputedResults(scenarioId: number, computedResults: import("@workspace/db").ComputedResultsSnapshot, computeHash: string): Promise<void> {
    await db.update(scenarios)
      .set({ computedResults, computeHash, updatedAt: new Date() })
      .where(eq(scenarios.id, scenarioId));
  }

  async updateScenarioSnapshot(scenarioId: number, data: {
    globalAssumptions: import("@workspace/db").ScenarioGlobalAssumptionsSnapshot;
    properties: import("@workspace/db").ScenarioPropertySnapshot[];
    feeCategories?: Record<string, import("@workspace/db").ScenarioFeeCategorySnapshot[]>;
    propertyPhotos?: Record<string, import("@workspace/db").ScenarioPhotoSnapshot[]>;
    serviceTemplates?: import("@workspace/db").ScenarioServiceTemplateSnapshot[];
    computedResults?: import("@workspace/db").ComputedResultsSnapshot | null;
    computeHash?: string | null;
  }): Promise<Scenario | undefined> {
    const { globalAssumptions, properties: props, feeCategories, propertyPhotos: photos, serviceTemplates, computedResults, computeHash } = data;
    const setData: Record<string, unknown> = { globalAssumptions, properties: props, feeCategories, propertyPhotos: photos, computedResults, computeHash, updatedAt: new Date() };
    if (serviceTemplates !== undefined) setData.serviceTemplates = serviceTemplates;
    const [updated] = await db.update(scenarios)
      .set(setData)
      .where(eq(scenarios.id, scenarioId))
      .returning();

    if (updated) {
      indexScenarioAsync(updated).catch(() => { /* ignore: Vector store indexing is async best-effort */ });
    }

    return updated || undefined;
  }

  async softDeleteScenario(id: number, userId: number): Promise<void> {
    const now = new Date();
    const purge = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.transaction(async (tx) => {
      await tx.update(scenarios)
        .set({ deletedAt: now, deletedBy: userId, purgeAfter: purge, updatedAt: now })
        .where(eq(scenarios.id, id));
      await tx.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, id));
    });
  }

  async hardDeleteScenario(id: number): Promise<void> {
    await db.delete(scenarios).where(eq(scenarios.id, id));
  }

  /** Duplicate a scenario with " (Copy)" suffix, handling uniqueness. */
  async cloneScenario(id: number, userId: number): Promise<Scenario> {
    const source = await this.getScenario(id);
    if (!source) throw new Error("Scenario not found");

    let baseName = source.name + " (Copy)";
    let name = baseName;
    let attempt = 1;
    const existing = await this.getScenariosByUser(userId);
    const existingNames = new Set(existing.map(s => s.name));
    while (existingNames.has(name)) {
      attempt++;
      name = `${baseName} ${attempt}`;
    }

    const [cloned] = await db.insert(scenarios).values({
      userId,
      name,
      description: source.description,
      globalAssumptions: source.globalAssumptions,
      properties: source.properties,
      scenarioImages: source.scenarioImages,
      feeCategories: source.feeCategories,
      propertyPhotos: source.propertyPhotos,
    } as typeof scenarios.$inferInsert).returning();
    return cloned;
  }
}
