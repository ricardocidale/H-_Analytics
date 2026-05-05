/**
 * MarketRatesStorage — DB operations for the market_rates table.
 *
 * Extracted from data/marketRates.ts (audit: data layer was importing db
 * directly, bypassing the storage boundary). External API fetch logic
 * stays in data/marketRates.ts; this module owns all SQL.
 */

import { db } from "../db";
import { marketRates, type MarketRate } from "@workspace/db";
import { eq } from "drizzle-orm";

export type UpsertMarketRateInput = {
  rateKey: string;
  value: number | null;
  displayValue: string | null;
  source: string;
  sourceUrl?: string | null;
  seriesId?: string | null;
  publishedAt?: Date | null;
  fetchedAt?: Date | null;
  isManual?: boolean;
  manualNote?: string | null;
  maxStalenessHours?: number;
};

export class MarketRatesStorage {
  async getAllMarketRates(): Promise<MarketRate[]> {
    return db.select().from(marketRates).orderBy(marketRates.rateKey);
  }

  async getMarketRate(rateKey: string): Promise<MarketRate | undefined> {
    const [row] = await db
      .select()
      .from(marketRates)
      .where(eq(marketRates.rateKey, rateKey))
      .limit(1);
    return row;
  }

  async upsertMarketRate(data: UpsertMarketRateInput): Promise<void> {
    const existing = await this.getMarketRate(data.rateKey);
    if (existing) {
      await db
        .update(marketRates)
        .set({
          value: data.value,
          displayValue: data.displayValue,
          source: data.source,
          sourceUrl: data.sourceUrl ?? existing.sourceUrl,
          seriesId: data.seriesId ?? existing.seriesId,
          publishedAt: data.publishedAt ?? existing.publishedAt,
          fetchedAt: data.fetchedAt ?? new Date(),
          isManual: data.isManual ?? existing.isManual,
          manualNote: data.manualNote ?? existing.manualNote,
          maxStalenessHours: data.maxStalenessHours ?? existing.maxStalenessHours,
          updatedAt: new Date(),
        })
        .where(eq(marketRates.rateKey, data.rateKey));
    } else {
      await db.insert(marketRates).values({
        rateKey: data.rateKey,
        value: data.value,
        displayValue: data.displayValue,
        source: data.source,
        sourceUrl: data.sourceUrl,
        seriesId: data.seriesId,
        publishedAt: data.publishedAt,
        fetchedAt: data.fetchedAt ?? new Date(),
        isManual: data.isManual ?? false,
        manualNote: data.manualNote,
        maxStalenessHours: data.maxStalenessHours ?? 24,
      });
    }
  }
}
