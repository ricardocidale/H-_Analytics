/**
 * Scenario "load" — restore a saved snapshot back into the user's working
 * data (global assumptions + properties + fee categories + service templates).
 *
 * The path is gated by USE_STABLE_SCENARIO_LOAD:
 *   - true (default): non-destructive stableKey-based upsert. Properties
 *     present in both the snapshot and the user's live data are matched by
 *     stableKey and updated in place, preserving property IDs and any
 *     property_photos FK references. Live properties not in the snapshot
 *     are soft-archived (isActive=false) — never deleted — to avoid
 *     cascading photo deletions through ON DELETE CASCADE.
 *   - false: legacy destructive path (delete all user properties, recreate
 *     from snapshot). Kept for the kill-switch.
 *
 * Photos are never touched in either path; they remain attached to their
 * property via property_id, which is stable across loads.
 */
import {
  globalAssumptions,
  properties,
  propertyFeeCategories,
  companyServiceTemplates,
} from "@workspace/db";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { stripAutoFields, stripToColumns } from "../utils";
import { USE_STABLE_SCENARIO_LOAD } from "@shared/constants";

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

export class ScenariosLoadStorage {
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
}
