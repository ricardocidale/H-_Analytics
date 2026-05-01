import {
  taxBulletinCache,
  type TaxBulletinCache, type InsertTaxBulletinCache,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { IntelligenceTx } from "../tx";

/**
 * TaxBulletinCacheStorage — backing cache for Helena's tax-bulletin-diff
 * tool (Phase 2c). One row per `(country, subdivision)`; `subdivision`
 * is stored as the empty string for federal-level / no-subdivision rows
 * so the unique constraint actually fires (Postgres treats NULLs as
 * distinct in unique indexes).
 *
 * Both the read and the upsert loud-fail; persistence errors are NOT
 * swallowed — Helena's pipeline catches the throw and falls back to LLM
 * with the failure recorded in the run metadata.
 */
export class TaxBulletinCacheStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

  async getTaxBulletinCache(
    country: string,
    subdivision: string | null,
  ): Promise<TaxBulletinCache | undefined> {
    const sub = subdivision ?? "";
    const [row] = await this._ctx.db.select().from(taxBulletinCache)
      .where(and(
        eq(taxBulletinCache.country, country),
        eq(taxBulletinCache.subdivision, sub),
      ))
      .limit(1);
    return row;
  }

  async upsertTaxBulletinCache(data: InsertTaxBulletinCache): Promise<TaxBulletinCache> {
    const sub = data.subdivision ?? "";
    return this._ctx.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(taxBulletinCache)
        .where(and(
          eq(taxBulletinCache.country, data.country),
          eq(taxBulletinCache.subdivision, sub),
        ))
        .limit(1);
      if (existing) {
        const [updated] = await tx.update(taxBulletinCache)
          .set({
            sourceUrl: data.sourceUrl,
            publisher: data.publisher,
            bulletinHash: data.bulletinHash,
            parsedValues: data.parsedValues,
            rawExcerpt: data.rawExcerpt,
            fetchedAt: new Date(),
          })
          .where(eq(taxBulletinCache.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(taxBulletinCache)
        .values({ ...data, subdivision: sub } as typeof taxBulletinCache.$inferInsert)
        .returning();
      return inserted;
    });
  }
}
