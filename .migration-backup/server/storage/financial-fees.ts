import { propertyFeeCategories, companyServiceTemplates, type FeeCategory, type InsertFeeCategory, type UpdateFeeCategory } from "@shared/schema";
import { db } from "../db";
import { eq, inArray, and } from "drizzle-orm";
import { stripAutoFields } from "./utils";
import { stableEquals } from "../scenarios/stable-json";
import type { Scenario } from "@shared/schema";

export class FinancialFeeStorage {
  async getFeeCategoriesByProperty(propertyId: number): Promise<FeeCategory[]> {
    return await db.select().from(propertyFeeCategories).where(eq(propertyFeeCategories.propertyId, propertyId)).orderBy(propertyFeeCategories.sortOrder);
  }

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

  async getAllFeeCategories(): Promise<FeeCategory[]> {
    return await db.select().from(propertyFeeCategories).orderBy(propertyFeeCategories.id);
  }

  async createFeeCategory(data: InsertFeeCategory): Promise<FeeCategory> {
    const [cat] = await db.insert(propertyFeeCategories).values(data).returning();
    return cat;
  }

  async updateFeeCategory(id: number, data: UpdateFeeCategory, propertyId: number): Promise<FeeCategory | undefined> {
    const [cat] = await db.update(propertyFeeCategories)
      .set(stripAutoFields(data as Record<string, unknown>))
      .where(and(eq(propertyFeeCategories.id, id), eq(propertyFeeCategories.propertyId, propertyId)))
      .returning();
    return cat || undefined;
  }

  async deleteFeeCategory(id: number, propertyId: number): Promise<void> {
    await db.delete(propertyFeeCategories).where(and(eq(propertyFeeCategories.id, id), eq(propertyFeeCategories.propertyId, propertyId)));
  }

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
}
