import { globalAssumptions, scenarios, scenarioShares, scenarioPropertyOverrides, scenarioAccess, propertyFeeCategories, companyServiceTemplates, type GlobalAssumptions, type InsertGlobalAssumptions, type Scenario, type InsertScenario, type UpdateScenario, type InsertScenarioResult, type InsertFeeCategory, type UpdateFeeCategory, properties } from "@shared/schema";
import { db } from "../db";
import { eq, desc, isNull, or, sql, and } from "drizzle-orm";
import { stripAutoFields, stripToColumns } from "./utils";
import { type PropertyDiff } from "../scenarios/diff-engine";
import { USE_STABLE_SCENARIO_LOAD } from "@shared/constants";
import { indexScenarioSummary } from "../ai/vector-store-service";
import { logger } from "../logger";
import { FinancialSharingStorage } from "./financial-sharing";
import { FinancialFeeStorage } from "./financial-fees";

const _sharing = new FinancialSharingStorage();
const _fees = new FinancialFeeStorage();
type DbOrTx = Pick<typeof db, "select" | "insert" | "update" | "delete">;

interface LiveProperty { id: number; stableKey: string | null; name: string; [k: string]: unknown; }
interface ResolvedProperty { id: number; name: string; stableKey: string | null; }

async function stableLoadProperties(tx: DbOrTx, userId: number, savedProperties: Array<Record<string, unknown>>): Promise<ResolvedProperty[]> {
  const liveProps = await tx.select().from(properties).where(eq(properties.userId, userId)) as LiveProperty[];
  const liveByStableKey = new Map<string, LiveProperty>();
  for (const p of liveProps) {
    if (p.stableKey) liveByStableKey.set(p.stableKey, p);
  }

  const snapshotStableKeys = new Set<string>();
  const resolvedProperties: ResolvedProperty[] = [];

  for (const prop of savedProperties) {
    const propData = stripAutoFields(prop);
    const stableKey = (prop.stableKey as string) || null;

    if (stableKey && liveByStableKey.has(stableKey)) {
      const liveProp = liveByStableKey.get(stableKey)!;
      snapshotStableKeys.add(stableKey);
      const safeUpdate = stripToColumns(properties, { ...propData, userId, isActive: (prop.isActive as boolean) ?? true, updatedAt: new Date() });
      await tx.update(properties).set(safeUpdate as typeof properties.$inferInsert)
        .where(eq(properties.id, liveProp.id));
      resolvedProperties.push({ id: liveProp.id, name: prop.name as string, stableKey });
    } else {
      const safeInsert = stripToColumns(properties, { ...propData, userId, isActive: (prop.isActive as boolean) ?? true });
      const insertData: typeof properties.$inferInsert = safeInsert as typeof properties.$inferInsert;
      if (stableKey) {
        insertData.stableKey = stableKey;
        snapshotStableKeys.add(stableKey);
      }
      const [inserted] = await tx.insert(properties).values(insertData).returning();
      resolvedProperties.push({ id: inserted.id, name: prop.name as string, stableKey: stableKey || (inserted as { stableKey?: string }).stableKey || null });
    }
  }

  for (const liveProp of liveProps) {
    if (liveProp.stableKey && !snapshotStableKeys.has(liveProp.stableKey)) {
      await tx.update(properties).set({ isActive: false, updatedAt: new Date() } as typeof properties.$inferInsert)
        .where(eq(properties.id, liveProp.id));
    }
  }

  return resolvedProperties;
}

async function destructiveLoadProperties(tx: DbOrTx, userId: number, savedProperties: Array<Record<string, unknown>>): Promise<ResolvedProperty[]> {
  await tx.delete(properties).where(eq(properties.userId, userId));

  const resolvedProperties: ResolvedProperty[] = [];
  for (const prop of savedProperties) {
    const safeData = stripToColumns(properties, { ...prop, userId });
    const insertData: typeof properties.$inferInsert = safeData as typeof properties.$inferInsert;
    const [inserted] = await tx.insert(properties).values(insertData).returning();
    resolvedProperties.push({ id: inserted.id, name: prop.name as string, stableKey: (prop.stableKey as string) || null });
  }

  return resolvedProperties;
}

async function syncFeeCategories(
  tx: DbOrTx,
  resolvedProperties: ResolvedProperty[],
  savedFeeCategories: Record<string, Array<Record<string, unknown>>>,
): Promise<void> {
  for (const prop of resolvedProperties) {
    const feeKey = prop.stableKey || prop.name;
    const snapshotCats = savedFeeCategories[feeKey] ?? savedFeeCategories[prop.name] ?? [];

    const liveCats = await tx.select().from(propertyFeeCategories)
      .where(eq(propertyFeeCategories.propertyId, prop.id));
    const liveByName = new Map(liveCats.map(c => [c.name, c]));

    const snapshotNames = new Set<string>();

    for (const cat of snapshotCats) {
      const catData = stripAutoFields(cat);
      const catName = cat.name as string;
      snapshotNames.add(catName);

      const existing = liveByName.get(catName);
      if (existing) {
        const safeUpdate = stripToColumns(propertyFeeCategories, { ...catData, propertyId: prop.id });
        await tx.update(propertyFeeCategories)
          .set(safeUpdate as typeof propertyFeeCategories.$inferInsert)
          .where(eq(propertyFeeCategories.id, existing.id));
      } else {
        const safeInsert = stripToColumns(propertyFeeCategories, { ...catData, propertyId: prop.id });
        await tx.insert(propertyFeeCategories)
          .values(safeInsert as typeof propertyFeeCategories.$inferInsert);
      }
    }

    for (const liveCat of liveCats) {
      if (!snapshotNames.has(liveCat.name)) {
        await tx.delete(propertyFeeCategories)
          .where(eq(propertyFeeCategories.id, liveCat.id));
      }
    }
  }
}

async function syncServiceTemplates(
  tx: DbOrTx,
  savedTemplates: Array<Record<string, unknown>>,
): Promise<void> {
  const liveTemplates = await tx.select().from(companyServiceTemplates);
  const liveByName = new Map(liveTemplates.map(t => [t.name, t]));
  const snapshotNames = new Set<string>();

  for (const tmpl of savedTemplates) {
    const name = tmpl.name as string;
    snapshotNames.add(name);
    const { id: _id, createdAt: _created, ...tmplData } = tmpl;
    const existing = liveByName.get(name);
    if (existing) {
      const safeUpdate = stripToColumns(companyServiceTemplates, tmplData);
      await tx.update(companyServiceTemplates)
        .set(safeUpdate as typeof companyServiceTemplates.$inferInsert)
        .where(eq(companyServiceTemplates.id, existing.id));
    } else {
      const safeInsert = stripToColumns(companyServiceTemplates, tmplData);
      await tx.insert(companyServiceTemplates)
        .values(safeInsert as typeof companyServiceTemplates.$inferInsert);
    }
  }

  for (const live of liveTemplates) {
    if (!snapshotNames.has(live.name)) {
      await tx.delete(companyServiceTemplates)
        .where(eq(companyServiceTemplates.id, live.id));
    }
  }
}

async function _indexScenarioAsync(scenario: Scenario): Promise<void> {
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
    logger.warn(`Async scenario index failed: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export class FinancialStorage {
  async getGlobalAssumptions(userId?: number): Promise<GlobalAssumptions | undefined> {
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

  /**
   * Create or update global assumptions. Uses "upsert" logic: if a row already
   * exists for this user, update it; otherwise insert a new one. This is how the
   * Settings page saves — it always calls upsert regardless of whether it's the
   * first save or the hundredth.
   */
  async upsertGlobalAssumptions(data: InsertGlobalAssumptions, userId?: number): Promise<GlobalAssumptions> {
    return await db.transaction(async (tx) => {
      const userCondition = userId
        ? eq(globalAssumptions.userId, userId)
        : isNull(globalAssumptions.userId);

      const [ownRow] = await tx.select().from(globalAssumptions)
        .where(userCondition)
        .limit(1);

      if (ownRow) {
        const [updated] = await tx
          .update(globalAssumptions)
          .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
          .where(eq(globalAssumptions.id, ownRow.id))
          .returning();
        return updated;
      } else {
        const [inserted] = await tx
          .insert(globalAssumptions)
          .values({ 
            ...data as typeof globalAssumptions.$inferInsert, 
            userId 
          })
          .returning();
        return inserted;
      }
    });
  }

  /**
   * Partially update global assumptions by ID. Used for admin-only subsection
   * patches (e.g., Rebecca config) where a full upsert is unnecessary.
   */
  async patchGlobalAssumptions(id: number, patch: Record<string, unknown>): Promise<GlobalAssumptions> {
    const safePatch = stripToColumns(globalAssumptions, { ...patch, updatedAt: new Date() });
    const [updated] = await db
      .update(globalAssumptions)
      .set(safePatch)
      .where(eq(globalAssumptions.id, id))
      .returning();
    return updated;
  }

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
    _indexScenarioAsync(scenario).catch(() => { /* ignore: Pinecone indexing is async best-effort */ });
    return scenario;
  }

  async writePropertyOverrides(scenarioId: number, diffs: PropertyDiff[]): Promise<void> {
    if (diffs.length === 0) return;

    await db.transaction(async (tx) => {
      await tx.delete(scenarioPropertyOverrides).where(eq(scenarioPropertyOverrides.scenarioId, scenarioId));

      const values = diffs.map(d => ({
        scenarioId,
        propertyId: d.propertyId ?? undefined,
        propertyName: d.propertyName,
        changeType: d.changeType,
        overrides: d.overrides as Record<string, unknown>,
        basePropertySnapshot: d.baseSnapshot,
      }));

      await tx.insert(scenarioPropertyOverrides).values(values as Array<typeof scenarioPropertyOverrides.$inferInsert>);
    });
  }

  async getPropertyOverrides(scenarioId: number) {
    return await db.select().from(scenarioPropertyOverrides)
      .where(eq(scenarioPropertyOverrides.scenarioId, scenarioId));
  }

  async getPropertyOverridesForField(userId: number, field: string): Promise<Array<{ scenarioId: number; scenarioName: string; propertyName: string; value: unknown }>> {
    const rows = await db
      .select({
        scenarioId: scenarios.id,
        scenarioName: scenarios.name,
        propertyName: scenarioPropertyOverrides.propertyName,
        overrides: scenarioPropertyOverrides.overrides,
      })
      .from(scenarioPropertyOverrides)
      .innerJoin(scenarios, eq(scenarioPropertyOverrides.scenarioId, scenarios.id))
      .where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)));

    const results: Array<{ scenarioId: number; scenarioName: string; propertyName: string; value: unknown }> = [];
    for (const row of rows) {
      const ov = row.overrides as Record<string, unknown>;
      if (ov && field in ov) {
        results.push({
          scenarioId: row.scenarioId,
          scenarioName: row.scenarioName,
          propertyName: row.propertyName,
          value: ov[field],
        });
      }
    }
    return results;
  }

  async updateScenario(id: number, data: UpdateScenario): Promise<Scenario | undefined> {
    const [scenario] = await db
      .update(scenarios)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(scenarios.id, id))
      .returning();
    if (scenario) {
      _indexScenarioAsync(scenario).catch(() => { /* ignore: Pinecone indexing is async best-effort */ });
    }
    return scenario || undefined;
  }

  async updateScenarioComputedResults(scenarioId: number, computedResults: import("@shared/schema").ComputedResultsSnapshot, computeHash: string): Promise<void> {
    await db.update(scenarios)
      .set({ computedResults, computeHash, updatedAt: new Date() })
      .where(eq(scenarios.id, scenarioId));
  }

  async updateScenarioSnapshot(scenarioId: number, data: {
    globalAssumptions: any;
    properties: any;
    feeCategories?: any;
    propertyPhotos?: any;
    serviceTemplates?: any;
    computedResults?: any;
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
      _indexScenarioAsync(updated).catch(() => { /* ignore: Pinecone indexing is async best-effort */ });
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
      await tx.delete(scenarioShares).where(eq(scenarioShares.scenarioId, id));
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

  compareScenarios(s1: Scenario, s2: Scenario) { return _fees.compareScenarios(s1, s2); }

  /**
   * Restore a saved scenario by replacing the user's current working data
   * (global assumptions + all properties + fee categories) with the snapshot
   * from the scenario. Runs in a transaction so partial loads can't occur.
   *
   * When USE_STABLE_SCENARIO_LOAD is true (default), uses non-destructive
   * stableKey-based upsert: matches properties by stableKey, updates in place
   * (preserving property IDs and photo FK references), and inserts new
   * properties. Orphaned live properties (not in snapshot) are soft-archived
   * by setting isActive=false — never deleted — to avoid cascading photo
   * deletions via the property_photos ON DELETE CASCADE FK constraint.
   * Matched/inserted properties are explicitly set to isActive=true.
   *
   * When USE_STABLE_SCENARIO_LOAD is false, falls back to the legacy
   * destructive path: deletes all user properties and recreates from snapshot.
   *
   * Photos are never touched in either path — they remain attached to their
   * property via property_id, which is stable across loads.
   */
  async loadScenario(userId: number, savedAssumptions: Record<string, unknown>, savedProperties: Array<Record<string, unknown>>, savedFeeCategories?: Record<string, Array<Record<string, unknown>>>, _savedPropertyPhotos?: Record<string, Array<Record<string, unknown>>>, savedServiceTemplates?: Array<Record<string, unknown>>): Promise<void> {
    await db.transaction(async (tx) => {
      const { id: _gaId, createdAt: _gaCreated, updatedAt: _gaUpdated, userId: _gaUser, ...gaData } = savedAssumptions;

      const existingUserRow = await tx.select().from(globalAssumptions)
        .where(eq(globalAssumptions.userId, userId))
        .orderBy(desc(globalAssumptions.id))
        .limit(1);

      if (existingUserRow.length > 0) {
        await tx.update(globalAssumptions).set({ ...gaData, updatedAt: new Date() })
          .where(eq(globalAssumptions.id, existingUserRow[0].id));
      } else {
        await tx.insert(globalAssumptions).values({ ...gaData, userId } as typeof globalAssumptions.$inferInsert);
      }

      let resolvedProperties: ResolvedProperty[];

      if (USE_STABLE_SCENARIO_LOAD) {
        resolvedProperties = await stableLoadProperties(tx, userId, savedProperties);
      } else {
        resolvedProperties = await destructiveLoadProperties(tx, userId, savedProperties);
      }

      if (savedFeeCategories) {
        await syncFeeCategories(tx, resolvedProperties, savedFeeCategories);
      }

      if (savedServiceTemplates) {
        await syncServiceTemplates(tx, savedServiceTemplates);
      }
    });
  }

  async getFeeCategoriesByProperty(propertyId: number) { return _fees.getFeeCategoriesByProperty(propertyId); }
  async getFeeCategoriesByProperties(propertyIds: number[]) { return _fees.getFeeCategoriesByProperties(propertyIds); }
  async getAllFeeCategories() { return _fees.getAllFeeCategories(); }
  async createFeeCategory(data: InsertFeeCategory) { return _fees.createFeeCategory(data); }
  async updateFeeCategory(id: number, data: UpdateFeeCategory, propertyId: number) { return _fees.updateFeeCategory(id, data, propertyId); }
  async deleteFeeCategory(id: number, propertyId: number) { return _fees.deleteFeeCategory(id, propertyId); }
  async seedDefaultFeeCategories(propertyId: number) { return _fees.seedDefaultFeeCategories(propertyId); }

  async getAllScenarios(filters?: { userId?: number; groupId?: number }) { return _sharing.getAllScenarios(filters); }
  async createScenarioForUser(userId: number, data: { name: string; description?: string | null; kind?: string }) { return _sharing.createScenarioForUser(userId, data); }
  async getScenarioSharesForScenario(scenarioId: number) { return _sharing.getScenarioSharesForScenario(scenarioId); }
  async getAllScenarioShares() { return _sharing.getAllScenarioShares(); }
  async addScenarioAccess(scenarioId: number, targetType: string, targetId: number, grantedBy: number) { return _sharing.addScenarioAccess(scenarioId, targetType, targetId, grantedBy); }
  async removeScenarioAccess(scenarioId: number, targetType: string, targetId: number) { return _sharing.removeScenarioAccess(scenarioId, targetType, targetId); }
  async getScenarioCountByUser(userId: number) { return _sharing.getScenarioCountByUser(userId); }
  async getScenariosSharedWithUser(userId: number) { return _sharing.getScenariosSharedWithUser(userId); }
  async shareScenarioWithUser(scenarioId: number, recipientId: number, grantedBy: number) { return _sharing.shareScenarioWithUser(scenarioId, recipientId, grantedBy); }
  async shareAllScenariosWithUser(ownerId: number, recipientId: number) { return _sharing.shareAllScenariosWithUser(ownerId, recipientId); }
  async getSharesForScenario(scenarioId: number) { return _sharing.getSharesForScenario(scenarioId); }
  async removeAllSharesForScenario(scenarioId: number) { return _sharing.removeAllSharesForScenario(scenarioId); }
  async removeScenarioSharesByTarget(targetType: string, targetId: number) { return _sharing.removeScenarioSharesByTarget(targetType, targetId); }
  async grantScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null) { return _sharing.grantScenarioAccess(ownerId, granteeId, scenarioId); }
  async revokeScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null) { return _sharing.revokeScenarioAccess(ownerId, granteeId, scenarioId); }
  async getScenarioAccessByOwner(ownerId: number) { return _sharing.getScenarioAccessByOwner(ownerId); }
  async getScenariosSharedViaAccess(userId: number) { return _sharing.getScenariosSharedViaAccess(userId); }
  async saveScenarioResult(data: InsertScenarioResult) { return _sharing.saveScenarioResult(data); }
  async getLatestScenarioResult(scenarioId: number) { return _sharing.getLatestScenarioResult(scenarioId); }
}
