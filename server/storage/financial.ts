import { globalAssumptions, scenarios, scenarioShares, scenarioPropertyOverrides, scenarioAccess, propertyFeeCategories, propertyPhotos, companyServiceTemplates, scenarioResults, type GlobalAssumptions, type InsertGlobalAssumptions, type Scenario, type InsertScenario, type UpdateScenario, type ScenarioShare, type ScenarioAccess, type ScenarioResult, type InsertScenarioResult, type FeeCategory, type InsertFeeCategory, type UpdateFeeCategory, properties, users } from "@shared/schema";
import { db } from "../db";
import { eq, desc, isNull, inArray, or, sql, and, aliasedTable } from "drizzle-orm";
import { stripAutoFields } from "./utils";
import { computeFullDiff, reconstructScenarioProperties, type PropertyDiff } from "../scenarios/diff-engine";
import { stableEquals } from "../scenarios/stable-json";
import { USE_STABLE_SCENARIO_LOAD } from "@shared/constants";

type DbOrTx = Pick<typeof db, "select" | "insert" | "update" | "delete">;

interface LiveProperty {
  id: number;
  stableKey: string | null;
  name: string;
  [k: string]: unknown;
}

interface ResolvedProperty {
  id: number;
  name: string;
  stableKey: string | null;
}

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
      await tx.update(properties).set({ ...propData, userId, isActive: (prop.isActive as boolean) ?? true, updatedAt: new Date() } as typeof properties.$inferInsert)
        .where(eq(properties.id, liveProp.id));
      resolvedProperties.push({ id: liveProp.id, name: prop.name as string, stableKey });
    } else {
      const insertData: typeof properties.$inferInsert = { ...propData, userId, isActive: (prop.isActive as boolean) ?? true } as typeof properties.$inferInsert;
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
    const propData = stripAutoFields(prop);
    const insertData: typeof properties.$inferInsert = { ...propData, userId } as typeof properties.$inferInsert;
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
        await tx.update(propertyFeeCategories)
          .set({ ...catData, propertyId: prop.id } as typeof propertyFeeCategories.$inferInsert)
          .where(eq(propertyFeeCategories.id, existing.id));
      } else {
        await tx.insert(propertyFeeCategories)
          .values({ ...catData, propertyId: prop.id } as typeof propertyFeeCategories.$inferInsert);
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
    const userCondition = userId
      ? eq(globalAssumptions.userId, userId)
      : isNull(globalAssumptions.userId);

    const [ownRow] = await db.select().from(globalAssumptions)
      .where(userCondition)
      .limit(1);

    if (ownRow) {
      const [updated] = await db
        .update(globalAssumptions)
        .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
        .where(eq(globalAssumptions.id, ownRow.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(globalAssumptions)
        .values({ 
          ...data as typeof globalAssumptions.$inferInsert, 
          userId 
        })
        .returning();
      return inserted;
    }
  }

  /**
   * Partially update global assumptions by ID. Used for admin-only subsection
   * patches (e.g., Rebecca config) where a full upsert is unnecessary.
   */
  async patchGlobalAssumptions(id: number, patch: Record<string, unknown>): Promise<GlobalAssumptions> {
    const [updated] = await db
      .update(globalAssumptions)
      .set({ ...patch, updatedAt: new Date() })
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
    return scenario;
  }

  async writePropertyOverrides(scenarioId: number, diffs: PropertyDiff[]): Promise<void> {
    if (diffs.length === 0) return;

    await db.delete(scenarioPropertyOverrides).where(eq(scenarioPropertyOverrides.scenarioId, scenarioId));

    const values = diffs.map(d => ({
      scenarioId,
      propertyId: d.propertyId ?? undefined,
      propertyName: d.propertyName,
      changeType: d.changeType,
      overrides: d.overrides as Record<string, unknown>,
      basePropertySnapshot: d.baseSnapshot,
    }));

    await db.insert(scenarioPropertyOverrides).values(values as Array<typeof scenarioPropertyOverrides.$inferInsert>);
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

  /** Update scenario metadata (name, description). Does not re-snapshot financial data. */
  async updateScenario(id: number, data: UpdateScenario): Promise<Scenario | undefined> {
    const [scenario] = await db
      .update(scenarios)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(scenarios.id, id))
      .returning();
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
    computedResults?: any;
    computeHash?: string | null;
  }): Promise<Scenario | undefined> {
    const { globalAssumptions, properties: props, feeCategories, propertyPhotos: photos, computedResults, computeHash } = data;
    const [updated] = await db.update(scenarios)
      .set({ globalAssumptions, properties: props, feeCategories, propertyPhotos: photos, computedResults, computeHash, updatedAt: new Date() })
      .where(eq(scenarios.id, scenarioId))
      .returning();
    return updated || undefined;
  }

  async softDeleteScenario(id: number, userId: number): Promise<void> {
    const now = new Date();
    const purge = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.update(scenarios)
      .set({ deletedAt: now, deletedBy: userId, purgeAfter: purge, updatedAt: now })
      .where(eq(scenarios.id, id));
    await db.delete(scenarioShares).where(eq(scenarioShares.scenarioId, id));
    await db.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, id));
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

  /** Compute a structured diff between two scenarios for the compare UI. */
  compareScenarios(s1: Scenario, s2: Scenario): {
    scenario1: { id: number; name: string };
    scenario2: { id: number; name: string };
    assumptionDiffs: Array<{ field: string; scenario1: unknown; scenario2: unknown }>;
    propertyDiffs: Array<{ name: string; status: "added" | "removed" | "changed"; changes?: Array<{ field: string; scenario1: unknown; scenario2: unknown }> }>;
    financialComparison: {
      hashMatch: boolean;
      scenario1: { outputHash: string | null; engineVersion: string | null; auditOpinion: string | null; propertyCount: number | null } | null;
      scenario2: { outputHash: string | null; engineVersion: string | null; auditOpinion: string | null; propertyCount: number | null } | null;
    } | null;
  } {
    const SKIP_FIELDS = new Set(["id", "createdAt", "updatedAt", "userId"]);
    const ga1 = (s1.globalAssumptions || {}) as Record<string, unknown>;
    const ga2 = (s2.globalAssumptions || {}) as Record<string, unknown>;
    const allKeys = Array.from(new Set([...Object.keys(ga1), ...Object.keys(ga2)]));
    const assumptionDiffs: Array<{ field: string; scenario1: unknown; scenario2: unknown }> = [];
    for (const key of allKeys) {
      if (SKIP_FIELDS.has(key)) continue;
      const v1 = ga1[key];
      const v2 = ga2[key];
      if (!stableEquals(v1, v2)) {
        assumptionDiffs.push({ field: key, scenario1: v1, scenario2: v2 });
      }
    }

    const props1 = (s1.properties || []) as Array<Record<string, unknown>>;
    const props2 = (s2.properties || []) as Array<Record<string, unknown>>;
    const map1 = new Map(props1.map(p => [p.name as string, p]));
    const map2 = new Map(props2.map(p => [p.name as string, p]));
    const allNames = Array.from(new Set([...Array.from(map1.keys()), ...Array.from(map2.keys())]));
    const propertyDiffs: Array<{ name: string; status: "added" | "removed" | "changed"; changes?: Array<{ field: string; scenario1: unknown; scenario2: unknown }> }> = [];

    for (const name of allNames) {
      const p1 = map1.get(name);
      const p2 = map2.get(name);
      if (!p1) { propertyDiffs.push({ name, status: "added" }); continue; }
      if (!p2) { propertyDiffs.push({ name, status: "removed" }); continue; }
      const pKeys = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)]));
      const changes: Array<{ field: string; scenario1: unknown; scenario2: unknown }> = [];
      for (const k of pKeys) {
        if (SKIP_FIELDS.has(k)) continue;
        if (!stableEquals(p1[k], p2[k])) {
          changes.push({ field: k, scenario1: p1[k], scenario2: p2[k] });
        }
      }
      if (changes.length > 0) propertyDiffs.push({ name, status: "changed", changes });
    }

    const cr1 = s1.computedResults as { outputHash?: string; engineVersion?: string; projectionYears?: number; propertyCount?: number; auditOpinion?: string; consolidatedYearly?: unknown[] } | null;
    const cr2 = s2.computedResults as { outputHash?: string; engineVersion?: string; projectionYears?: number; propertyCount?: number; auditOpinion?: string; consolidatedYearly?: unknown[] } | null;

    let financialComparison: {
      hashMatch: boolean;
      scenario1: { outputHash: string | null; engineVersion: string | null; auditOpinion: string | null; propertyCount: number | null } | null;
      scenario2: { outputHash: string | null; engineVersion: string | null; auditOpinion: string | null; propertyCount: number | null } | null;
    } | null = null;

    if (cr1 || cr2) {
      financialComparison = {
        hashMatch: !!(cr1?.outputHash && cr2?.outputHash && cr1.outputHash === cr2.outputHash),
        scenario1: cr1 ? {
          outputHash: cr1.outputHash ?? null,
          engineVersion: cr1.engineVersion ?? null,
          auditOpinion: cr1.auditOpinion ?? null,
          propertyCount: cr1.propertyCount ?? null,
        } : null,
        scenario2: cr2 ? {
          outputHash: cr2.outputHash ?? null,
          engineVersion: cr2.engineVersion ?? null,
          auditOpinion: cr2.auditOpinion ?? null,
          propertyCount: cr2.propertyCount ?? null,
        } : null,
      };
    }

    return {
      scenario1: { id: s1.id, name: s1.name },
      scenario2: { id: s2.id, name: s2.name },
      assumptionDiffs,
      propertyDiffs,
      financialComparison,
    };
  }

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
  async loadScenario(userId: number, savedAssumptions: Record<string, unknown>, savedProperties: Array<Record<string, unknown>>, savedFeeCategories?: Record<string, Array<Record<string, unknown>>>, _savedPropertyPhotos?: Record<string, Array<Record<string, unknown>>>): Promise<void> {
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
    });
  }

  /** Fetch all fee categories associated with a property. Used in pro-forma calcs. */
  async getFeeCategoriesByProperty(propertyId: number): Promise<FeeCategory[]> {
    return await db.select().from(propertyFeeCategories).where(eq(propertyFeeCategories.propertyId, propertyId)).orderBy(propertyFeeCategories.sortOrder);
  }

  /** Fetch fee categories for multiple properties in a single query. */
  async getFeeCategoriesByProperties(propertyIds: number[]): Promise<Record<number, FeeCategory[]>> {
    if (propertyIds.length === 0) return {};
    const rows = await db.select().from(propertyFeeCategories)
      .where(inArray(propertyFeeCategories.propertyId, propertyIds))
      .orderBy(propertyFeeCategories.sortOrder);
    const grouped: Record<number, FeeCategory[]> = {};
    for (const row of rows) {
      if (!grouped[row.propertyId]) grouped[row.propertyId] = [];
      grouped[row.propertyId].push(row);
    }
    return grouped;
  }

  /** List ALL fee categories across all properties (admin view). */
  async getAllFeeCategories(): Promise<FeeCategory[]> {
    return await db.select().from(propertyFeeCategories).orderBy(propertyFeeCategories.id);
  }

  /** Manually add a new fee category to a property. */
  async createFeeCategory(data: InsertFeeCategory): Promise<FeeCategory> {
    const [cat] = await db.insert(propertyFeeCategories).values(data).returning();
    return cat;
  }

  /** Update a fee category's name, rate, or sort order. propertyId is mandatory for ownership check. */
  async updateFeeCategory(id: number, data: UpdateFeeCategory, propertyId: number): Promise<FeeCategory | undefined> {
    const [cat] = await db.update(propertyFeeCategories)
      .set(stripAutoFields(data as Record<string, unknown>))
      .where(and(eq(propertyFeeCategories.id, id), eq(propertyFeeCategories.propertyId, propertyId)))
      .returning();
    return cat || undefined;
  }

  /** Remove a fee category. propertyId is mandatory for ownership check. */
  async deleteFeeCategory(id: number, propertyId: number): Promise<void> {
    await db.delete(propertyFeeCategories).where(and(eq(propertyFeeCategories.id, id), eq(propertyFeeCategories.propertyId, propertyId)));
  }

  /**
   * Seed a property with the standard set of fee categories if it
   * doesn't have any yet. Called when a property is first accessed to ensure
   * every property has a fee breakdown. Uses DEFAULT_SERVICE_FEE_CATEGORIES
   * from shared/constants.ts.
   */
  async seedDefaultFeeCategories(propertyId: number): Promise<FeeCategory[]> {
    const existing = await this.getFeeCategoriesByProperty(propertyId);
    if (existing.length > 0) return existing;

    const templates = await db.select().from(companyServiceTemplates).orderBy(companyServiceTemplates.sortOrder);

    if (templates.length > 0) {
      const activeTemplates = templates.filter(t => t.isActive);
      if (activeTemplates.length === 0) return [];
      const values = activeTemplates.map(t => ({
        propertyId,
        name: t.name,
        rate: t.defaultRate,
        sortOrder: t.sortOrder,
      }));
      return await db.insert(propertyFeeCategories).values(values).returning();
    }

    const { DEFAULT_SERVICE_FEE_CATEGORIES } = await import("@shared/constants");
    const values = DEFAULT_SERVICE_FEE_CATEGORIES.map(cat => ({
      propertyId,
      name: cat.name,
      rate: cat.rate,
      sortOrder: cat.sortOrder,
    }));

    return await db.insert(propertyFeeCategories).values(values).returning();
  }

  async getAllScenarios(filters?: { userId?: number; groupId?: number; companyId?: number }): Promise<(Scenario & { ownerEmail: string; ownerName: string | null })[]> {
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
        purgeAfter: scenarios.purgeAfter,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(scenarios)
      .innerJoin(users, eq(scenarios.userId, users.id))
      .orderBy(desc(scenarios.updatedAt));

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
      computedResults: r.computedResults,
      computeHash: r.computeHash,
      version: r.version,
      baseSnapshotHash: r.baseSnapshotHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastOutputHash: r.lastOutputHash,
      lastComputedAt: r.lastComputedAt,
      lastEngineVersion: r.lastEngineVersion,
      kind: r.kind,
      isLocked: r.isLocked,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      purgeAfter: r.purgeAfter,
      ownerEmail: r.ownerEmail,
      ownerName: [r.ownerFirstName, r.ownerLastName].filter(Boolean).join(" ") || null,
    }));

    if (filters?.userId) {
      result = result.filter(r => r.userId === filters.userId);
    }

    if (filters?.groupId || filters?.companyId) {
      const allShares = await db.select().from(scenarioShares);
      const matchingScenarioIds = new Set<number>();
      for (const share of allShares) {
        if (filters.groupId && share.targetType === "group" && share.targetId === filters.groupId) {
          matchingScenarioIds.add(share.scenarioId);
        }
        if (filters.companyId && share.targetType === "company" && share.targetId === filters.companyId) {
          matchingScenarioIds.add(share.scenarioId);
        }
      }
      result = result.filter(r => matchingScenarioIds.has(r.id));
    }

    return result;
  }

  async createScenarioForUser(userId: number, data: { name: string; description?: string | null; kind?: string }): Promise<Scenario> {
    const assumptions = await this.getGlobalAssumptions(userId);
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

    const [scenario] = await db.insert(scenarios).values({
      userId,
      name: data.name,
      description: data.description ?? null,
      globalAssumptions: assumptions || {},
      properties: allProps || [],
      feeCategories: feeCatsByProp,
      propertyPhotos: photosByProp,
      ...(data.kind ? { kind: data.kind } : {}),
    } as typeof scenarios.$inferInsert).returning();
    return scenario;
  }

  async getScenarioSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async getAllScenarioShares(): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares);
  }

  async addScenarioAccess(scenarioId: number, targetType: string, targetId: number, grantedBy: number): Promise<ScenarioShare> {
    const [share] = await db.insert(scenarioShares).values({
      scenarioId,
      targetType,
      targetId,
      grantedBy,
    } as typeof scenarioShares.$inferInsert).returning();
    return share;
  }

  async removeScenarioAccess(scenarioId: number, targetType: string, targetId: number): Promise<void> {
    await db.delete(scenarioShares).where(
      and(
        eq(scenarioShares.scenarioId, scenarioId),
        eq(scenarioShares.targetType, targetType),
        eq(scenarioShares.targetId, targetId),
      )
    );
  }

  async getScenarioCountByUser(userId: number): Promise<number> {
    const result = await db.select().from(scenarios).where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)));
    return result.length;
  }

  async getScenariosSharedWithUser(userId: number): Promise<(Scenario & { accessType: string; sharedByUserId: number | null; sharedByName: string | null })[]> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return [];

    const conditions = [and(eq(scenarioShares.targetType, "user"), eq(scenarioShares.targetId, userId))];
    if (user.userGroupId) {
      conditions.push(and(eq(scenarioShares.targetType, "group"), eq(scenarioShares.targetId, user.userGroupId)));
    }
    if (user.companyId) {
      conditions.push(and(eq(scenarioShares.targetType, "company"), eq(scenarioShares.targetId, user.companyId)));
    }

    const granterAlias = aliasedTable(users, "granter");
    const rows = await db
      .select({
        scenario: scenarios,
        grantedBy: scenarioShares.grantedBy,
        granterFirstName: granterAlias.firstName,
        granterLastName: granterAlias.lastName,
        granterEmail: granterAlias.email,
      })
      .from(scenarioShares)
      .innerJoin(scenarios, and(
        eq(scenarioShares.scenarioId, scenarios.id),
        isNull(scenarios.deletedAt),
        sql`${scenarios.userId} != ${userId}`,
      ))
      .leftJoin(granterAlias, eq(scenarioShares.grantedBy, granterAlias.id))
      .where(or(...conditions));

    const seen = new Set<number>();
    const results: (Scenario & { accessType: string; sharedByUserId: number | null; sharedByName: string | null })[] = [];
    for (const row of rows) {
      if (seen.has(row.scenario.id)) continue;
      seen.add(row.scenario.id);
      const granterName = row.granterFirstName || row.granterLastName
        ? [row.granterFirstName, row.granterLastName].filter(Boolean).join(" ")
        : row.granterEmail ?? null;
      results.push({ ...row.scenario, accessType: "shared", sharedByUserId: row.grantedBy, sharedByName: granterName });
    }

    // Also include scenarios shared via the new scenario_access table
    const accessResults = await this.getScenariosSharedViaAccess(userId);
    for (const s of accessResults) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      results.push(s);
    }

    return results;
  }

  async shareScenarioWithUser(scenarioId: number, recipientId: number, grantedBy: number): Promise<ScenarioShare | null> {
    const existing = await db.select().from(scenarioShares).where(
      and(
        eq(scenarioShares.scenarioId, scenarioId),
        eq(scenarioShares.targetType, "user"),
        eq(scenarioShares.targetId, recipientId),
      )
    );
    if (existing.length > 0) return null;
    const [share] = await db.insert(scenarioShares).values({
      scenarioId,
      targetType: "user",
      targetId: recipientId,
      grantedBy,
    } as typeof scenarioShares.$inferInsert).returning();
    return share;
  }

  async shareAllScenariosWithUser(ownerId: number, recipientId: number): Promise<ScenarioShare[]> {
    const userScenarios = await db.select().from(scenarios).where(and(eq(scenarios.userId, ownerId), isNull(scenarios.deletedAt)));
    const results: ScenarioShare[] = [];
    for (const s of userScenarios) {
      const share = await this.shareScenarioWithUser(s.id, recipientId, ownerId);
      if (share) results.push(share);
    }
    return results;
  }

  async getSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async removeAllSharesForScenario(scenarioId: number): Promise<{ sharesRemoved: number; accessRemoved: number }> {
    const shares = await db.delete(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId)).returning();
    const access = await db.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, scenarioId)).returning();
    return { sharesRemoved: shares.length, accessRemoved: access.length };
  }

  async removeScenarioSharesByTarget(targetType: string, targetId: number): Promise<void> {
    await db.delete(scenarioShares).where(
      and(
        eq(scenarioShares.targetType, targetType),
        eq(scenarioShares.targetId, targetId),
      )
    );
  }

  // ─── Scenario Access (fine-grained grants) ─────────────────────────

  async grantScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<ScenarioAccess> {
    const grantType = scenarioId != null ? "specific" : "all";
    const [access] = await db.insert(scenarioAccess).values({
      scenarioId: scenarioId ?? null,
      ownerId,
      granteeId,
      grantType,
    } as typeof scenarioAccess.$inferInsert)
    .onConflictDoNothing()
    .returning();
    // If conflict (already exists), fetch the existing one
    if (!access) {
      const conditions = [
        eq(scenarioAccess.ownerId, ownerId),
        eq(scenarioAccess.granteeId, granteeId),
        eq(scenarioAccess.grantType, grantType),
      ];
      if (scenarioId != null) {
        conditions.push(eq(scenarioAccess.scenarioId, scenarioId));
      } else {
        conditions.push(isNull(scenarioAccess.scenarioId));
      }
      const [existing] = await db.select().from(scenarioAccess).where(and(...conditions));
      return existing;
    }
    return access;
  }

  async revokeScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<void> {
    const grantType = scenarioId != null ? "specific" : "all";
    const conditions = [
      eq(scenarioAccess.ownerId, ownerId),
      eq(scenarioAccess.granteeId, granteeId),
      eq(scenarioAccess.grantType, grantType),
    ];
    if (scenarioId != null) {
      conditions.push(eq(scenarioAccess.scenarioId, scenarioId));
    } else {
      conditions.push(isNull(scenarioAccess.scenarioId));
    }
    await db.delete(scenarioAccess).where(and(...conditions));
  }

  async getScenarioAccessByOwner(ownerId: number): Promise<(ScenarioAccess & { granteeName: string | null; granteeEmail: string })[]> {
    const granteeAlias = aliasedTable(users, "grantee");
    const rows = await db
      .select({
        access: scenarioAccess,
        granteeFirstName: granteeAlias.firstName,
        granteeLastName: granteeAlias.lastName,
        granteeEmail: granteeAlias.email,
      })
      .from(scenarioAccess)
      .innerJoin(granteeAlias, eq(scenarioAccess.granteeId, granteeAlias.id))
      .where(eq(scenarioAccess.ownerId, ownerId))
      .orderBy(scenarioAccess.createdAt);

    return rows.map(row => {
      const name = [row.granteeFirstName, row.granteeLastName].filter(Boolean).join(" ") || null;
      return { ...row.access, granteeName: name, granteeEmail: row.granteeEmail };
    });
  }

  async getScenariosSharedViaAccess(userId: number): Promise<(Scenario & { accessType: string; sharedByUserId: number; sharedByName: string | null })[]> {
    const ownerAlias = aliasedTable(users, "owner");

    // 1. Specific grants: scenarioId is set, granteeId = userId
    const specificRows = await db
      .select({
        scenario: scenarios,
        ownerId: scenarioAccess.ownerId,
        ownerFirstName: ownerAlias.firstName,
        ownerLastName: ownerAlias.lastName,
        ownerEmail: ownerAlias.email,
      })
      .from(scenarioAccess)
      .innerJoin(scenarios, and(
        eq(scenarioAccess.scenarioId, scenarios.id),
        isNull(scenarios.deletedAt),
      ))
      .leftJoin(ownerAlias, eq(scenarioAccess.ownerId, ownerAlias.id))
      .where(and(
        eq(scenarioAccess.granteeId, userId),
        eq(scenarioAccess.grantType, "specific"),
        sql`${scenarios.userId} != ${userId}`,
      ));

    // 2. "All" grants: scenarioId is NULL, granteeId = userId -> fetch all scenarios by that owner
    const allGrantRows = await db
      .select({
        ownerId: scenarioAccess.ownerId,
        ownerFirstName: ownerAlias.firstName,
        ownerLastName: ownerAlias.lastName,
        ownerEmail: ownerAlias.email,
      })
      .from(scenarioAccess)
      .leftJoin(ownerAlias, eq(scenarioAccess.ownerId, ownerAlias.id))
      .where(and(
        eq(scenarioAccess.granteeId, userId),
        eq(scenarioAccess.grantType, "all"),
        isNull(scenarioAccess.scenarioId),
      ));

    const seen = new Set<number>();
    const results: (Scenario & { accessType: string; sharedByUserId: number; sharedByName: string | null })[] = [];

    for (const row of specificRows) {
      if (seen.has(row.scenario.id)) continue;
      seen.add(row.scenario.id);
      const ownerName = row.ownerFirstName || row.ownerLastName
        ? [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ")
        : row.ownerEmail ?? null;
      results.push({ ...row.scenario, accessType: "shared", sharedByUserId: row.ownerId, sharedByName: ownerName });
    }

    // For each "all" grant, fetch owner's scenarios
    for (const grant of allGrantRows) {
      const ownerScenarios = await db.select().from(scenarios)
        .where(and(eq(scenarios.userId, grant.ownerId), isNull(scenarios.deletedAt), eq(scenarios.kind, "manual")));
      const ownerName = grant.ownerFirstName || grant.ownerLastName
        ? [grant.ownerFirstName, grant.ownerLastName].filter(Boolean).join(" ")
        : grant.ownerEmail ?? null;
      for (const s of ownerScenarios) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        results.push({ ...s, accessType: "shared", sharedByUserId: grant.ownerId, sharedByName: ownerName });
      }
    }

    return results;
  }

  async saveScenarioResult(data: InsertScenarioResult): Promise<ScenarioResult> {
    return await db.transaction(async (tx) => {
      const [result] = await tx.insert(scenarioResults).values(data)
        .onConflictDoUpdate({
          target: [scenarioResults.scenarioId, scenarioResults.outputHash],
          set: {
            engineVersion: data.engineVersion,
            inputsHash: data.inputsHash,
            consolidatedYearlyJson: data.consolidatedYearlyJson,
            auditOpinion: data.auditOpinion,
            projectionYears: data.projectionYears,
            propertyCount: data.propertyCount,
            computedBy: data.computedBy,
            computedAt: sql`NOW()`,
          },
        })
        .returning();

      await tx.update(scenarios).set({
        lastOutputHash: data.outputHash,
        lastComputedAt: new Date(),
        lastEngineVersion: data.engineVersion,
      }).where(eq(scenarios.id, data.scenarioId));

      return result;
    });
  }

  async getLatestScenarioResult(scenarioId: number): Promise<ScenarioResult | undefined> {
    const [result] = await db.select().from(scenarioResults)
      .where(eq(scenarioResults.scenarioId, scenarioId))
      .orderBy(desc(scenarioResults.computedAt))
      .limit(1);
    return result;
  }

  async getScenarioResultByHash(scenarioId: number, outputHash: string): Promise<ScenarioResult | undefined> {
    const [result] = await db.select().from(scenarioResults)
      .where(and(
        eq(scenarioResults.scenarioId, scenarioId),
        eq(scenarioResults.outputHash, outputHash),
      ));
    return result;
  }
}
