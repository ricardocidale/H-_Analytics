/**
 * Cross-user scenario listing + materialization.
 *
 * `getAllScenarios` is the admin/listing read with optional userId/groupId
 * filters (filters are pushed into SQL where possible).
 *
 * `createScenarioForUser` materializes a fresh scenario row from the user's
 * current global assumptions, properties, fee categories, photos, and the
 * shared service-template catalog. Used by "save current view" entry points.
 *
 * `getScenarioCountByUser` powers the per-user manual-scenario gate at the
 * write layer.
 */
import {
  globalAssumptions,
  scenarios,
  scenarioShares,
  properties,
  users,
  propertyFeeCategories,
  propertyPhotos,
  companyServiceTemplates,
  type GlobalAssumptions,
  type Scenario,
} from "@workspace/db";
import type { ScenarioServiceTemplateSnapshot } from "@workspace/db";
import { db } from "../../db";
import { eq, desc, isNull, inArray, or, sql, and } from "drizzle-orm";

async function loadGlobalAssumptionsForUser(userId?: number): Promise<GlobalAssumptions | undefined> {
  const condition = userId
    ? or(eq(globalAssumptions.userId, userId), isNull(globalAssumptions.userId))
    : isNull(globalAssumptions.userId);
  const [result] = await db.select().from(globalAssumptions)
    .where(condition)
    .orderBy(sql`${globalAssumptions.userId} IS NULL ASC`, desc(globalAssumptions.id))
    .limit(1);
  if (result) return result;
  const [fallback] = await db.select().from(globalAssumptions).limit(1);
  return fallback || undefined;
}

export class FinancialSharingListingStorage {
  async getAllScenarios(filters?: { userId?: number; groupId?: number }): Promise<(Scenario & { ownerEmail: string; ownerName: string | null })[]> {
    let query = db
      .select({
        id: scenarios.id,
        userId: scenarios.userId,
        name: scenarios.name,
        description: scenarios.description,
        globalAssumptions: scenarios.globalAssumptions,
        properties: scenarios.properties,
        scenarioImages: scenarios.scenarioImages,
        feeCategories: scenarios.feeCategories,
        propertyPhotos: scenarios.propertyPhotos,
        serviceTemplates: scenarios.serviceTemplates,
        computedResults: scenarios.computedResults,
        computeHash: scenarios.computeHash,
        version: scenarios.version,
        baseSnapshotHash: scenarios.baseSnapshotHash,
        createdAt: scenarios.createdAt,
        updatedAt: scenarios.updatedAt,
        lastOutputHash: scenarios.lastOutputHash,
        lastComputedAt: scenarios.lastComputedAt,
        lastEngineVersion: scenarios.lastEngineVersion,
        kind: scenarios.kind,
        isLocked: scenarios.isLocked,
        deletedAt: scenarios.deletedAt,
        deletedBy: scenarios.deletedBy,
        tags: scenarios.tags,
        purgeAfter: scenarios.purgeAfter,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(scenarios)
      .innerJoin(users, eq(scenarios.userId, users.id))
      .orderBy(desc(scenarios.updatedAt));

    // Push filters into SQL rather than loading all rows into memory
    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(scenarios.userId, filters.userId));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query;
    let result = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      description: r.description,
      globalAssumptions: r.globalAssumptions,
      properties: r.properties,
      scenarioImages: r.scenarioImages,
      feeCategories: r.feeCategories,
      propertyPhotos: r.propertyPhotos,
      serviceTemplates: r.serviceTemplates,
      computedResults: r.computedResults,
      computeHash: r.computeHash,
      version: r.version,
      baseSnapshotHash: r.baseSnapshotHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastOutputHash: r.lastOutputHash,
      lastComputedAt: r.lastComputedAt,
      lastEngineVersion: r.lastEngineVersion,
      tags: r.tags,
      kind: r.kind,
      isLocked: r.isLocked,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      purgeAfter: r.purgeAfter,
      ownerEmail: r.ownerEmail,
      ownerName: [r.ownerFirstName, r.ownerLastName].filter(Boolean).join(" ") || null,
    }));

    // userId filter is now in SQL above

    if (filters?.groupId) {
      const matchingShares = await db.select({ scenarioId: scenarioShares.scenarioId })
        .from(scenarioShares)
        .where(and(eq(scenarioShares.targetType, "group"), eq(scenarioShares.targetId, filters.groupId)));
      const matchingIds = new Set(matchingShares.map(s => s.scenarioId));
      result = result.filter(r => matchingIds.has(r.id));
    }

    return result;
  }

  async createScenarioForUser(userId: number, data: { name: string; description?: string | null; kind?: string }): Promise<Scenario> {
    const assumptions = await loadGlobalAssumptionsForUser(userId);
    const allProps = await db.select().from(properties)
      .where(or(eq(properties.userId, userId), isNull(properties.userId)))
      .orderBy(properties.createdAt);

    const propertyIds = allProps.map(p => p.id);
    const feeCatRows = propertyIds.length > 0
      ? await db.select().from(propertyFeeCategories).where(inArray(propertyFeeCategories.propertyId, propertyIds))
      : [];
    const photoRows = propertyIds.length > 0
      ? await db.select().from(propertyPhotos).where(inArray(propertyPhotos.propertyId, propertyIds))
      : [];

    const feeCatsByProp: Record<string, unknown[]> = {};
    const photosByProp: Record<string, unknown[]> = {};
    for (const p of allProps) {
      feeCatsByProp[p.name] = feeCatRows.filter(fc => fc.propertyId === p.id);
      photosByProp[p.name] = photoRows.filter(ph => ph.propertyId === p.id);
    }

    const allTemplates = await db.select().from(companyServiceTemplates);
    const svcTemplates: ScenarioServiceTemplateSnapshot[] = allTemplates.map(t => ({
      id: t.id,
      name: t.name,
      defaultRate: t.defaultRate,
      serviceModel: t.serviceModel,
      serviceMarkup: t.serviceMarkup,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
    }));

    const [scenario] = await db.insert(scenarios).values({
      userId,
      name: data.name,
      description: data.description ?? null,
      globalAssumptions: assumptions || {},
      properties: allProps || [],
      feeCategories: feeCatsByProp,
      propertyPhotos: photosByProp,
      serviceTemplates: svcTemplates,
      ...(data.kind ? { kind: data.kind } : {}),
    } as typeof scenarios.$inferInsert).returning();
    return scenario;
  }

  async getScenarioCountByUser(userId: number): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(scenarios).where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)));
    return total;
  }
}
