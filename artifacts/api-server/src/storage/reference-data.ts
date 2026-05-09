import { db } from "../db";
import { geographyDimension, jurisdictionalTaxes, regulatoryFees, marketCapRates } from "@workspace/db";
import type { 
  InsertGeographyDimension, 
  InsertJurisdictionalTax, 
  InsertRegulatoryFee, 
  InsertMarketCapRate 
} from "@workspace/db";
import { sql } from "drizzle-orm";

export class ReferenceDataStorage {
  // ── Geography ─────────────────────────────────────────────────────────────
  async getAllGeography(): Promise<typeof geographyDimension.$inferSelect[]> {
    return db.select().from(geographyDimension).orderBy(geographyDimension.name);
  }

  async upsertGeography(rows: InsertGeographyDimension[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(geographyDimension)
      .values(rows as any)
      .onConflictDoUpdate({
        target: [geographyDimension.isoCode, geographyDimension.level],
        set: {
          name: sql`EXCLUDED.name`,
          currency: sql`EXCLUDED.currency`,
          currencySymbol: sql`EXCLUDED.currency_symbol`,
          isActive: sql`EXCLUDED.is_active`,
          embedding: sql`EXCLUDED.embedding`,
          updatedAt: sql`now()`,
        },
      });
  }

  // ── Taxes ─────────────────────────────────────────────────────────────────
  async getAllJurisdictionalTaxes(): Promise<typeof jurisdictionalTaxes.$inferSelect[]> {
    return db.select().from(jurisdictionalTaxes);
  }

  async insertJurisdictionalTaxes(rows: InsertJurisdictionalTax[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(jurisdictionalTaxes).values(rows);
  }

  // ── Fees ──────────────────────────────────────────────────────────────────
  async getAllRegulatoryFees(): Promise<typeof regulatoryFees.$inferSelect[]> {
    return db.select().from(regulatoryFees);
  }

  async insertRegulatoryFees(rows: InsertRegulatoryFee[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(regulatoryFees).values(rows);
  }

  // ── Cap Rates ─────────────────────────────────────────────────────────────
  async getAllMarketCapRates(): Promise<typeof marketCapRates.$inferSelect[]> {
    return db.select().from(marketCapRates).orderBy(marketCapRates.asOfDate);
  }

  async insertMarketCapRates(rows: InsertMarketCapRate[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(marketCapRates).values(rows as any);
  }
}
