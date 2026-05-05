import {
  knowledgeRegistry, countryEconomicData,
  type KnowledgeRegistry, type InsertKnowledgeRegistry,
  type CountryEconomicData, type InsertCountryEconomicData,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { IntelligenceTx } from "./tx";

export class KnowledgeRegistryStorage {
  private readonly _krtx: IntelligenceTx;
  constructor(tx: IntelligenceTx) { this._krtx = tx; }

  async getAllKnowledgeRegistry(): Promise<KnowledgeRegistry[]> {
    return this._krtx.db
      .select()
      .from(knowledgeRegistry)
      .orderBy(knowledgeRegistry.displayName);
  }

  async getKnowledgeRegistryEntry(id: string): Promise<KnowledgeRegistry | undefined> {
    const [row] = await this._krtx.db
      .select()
      .from(knowledgeRegistry)
      .where(eq(knowledgeRegistry.id, id))
      .limit(1);
    return row;
  }

  async updateKnowledgeRegistryRefreshed(id: string, at: Date): Promise<void> {
    await this._krtx.db
      .update(knowledgeRegistry)
      .set({ lastRefreshedAt: at })
      .where(eq(knowledgeRegistry.id, id));
  }

  async getAllCountryEconomicData(): Promise<CountryEconomicData[]> {
    return this._krtx.db
      .select()
      .from(countryEconomicData)
      .orderBy(countryEconomicData.countryCode);
  }

  async upsertCountryEconomicData(rows: InsertCountryEconomicData[]): Promise<void> {
    if (rows.length === 0) return;
    await this._krtx.db
      .insert(countryEconomicData)
      .values(rows)
      .onConflictDoUpdate({
        target: countryEconomicData.countryCode,
        set: {
          countryName: countryEconomicData.countryName,
          inflationRate: countryEconomicData.inflationRate,
          fxRateToUsd: countryEconomicData.fxRateToUsd,
          gdpGrowthRate: countryEconomicData.gdpGrowthRate,
          interestRate: countryEconomicData.interestRate,
          sourcedAt: countryEconomicData.sourcedAt,
          sourceNotes: countryEconomicData.sourceNotes,
          updatedAt: countryEconomicData.updatedAt,
        },
      });
  }
}
