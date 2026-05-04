/**
 * lb-slides — sub-storage for the LB Slide Deck admin config.
 *
 * The LB Slide Deck is ONE portfolio investor deck (not per-property).
 * The config table has exactly one row (id = 1, always upserted).
 *
 * Operations:
 *   getLbSlidesConfig()              → returns the config row or null
 *   upsertLbSlidesConfig(patch)      → upserts; id is always forced to 1
 */
import { lbSlidesConfig, type LbSlidesConfig, type InsertLbSlidesConfig } from "@workspace/db";
import { db } from "../db";
import { sql } from "drizzle-orm";

const SINGLETON_ID = 1 as const;

export interface LbSlidesStorage {
  getLbSlidesConfig(): Promise<LbSlidesConfig | null>;
  upsertLbSlidesConfig(patch: Omit<InsertLbSlidesConfig, "id" | "updatedAt">): Promise<LbSlidesConfig>;
}

export class LbSlidesStorageImpl implements LbSlidesStorage {
  async getLbSlidesConfig(): Promise<LbSlidesConfig | null> {
    const rows = await db
      .select()
      .from(lbSlidesConfig)
      .where(sql`${lbSlidesConfig.id} = ${SINGLETON_ID}`)
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertLbSlidesConfig(
    patch: Omit<InsertLbSlidesConfig, "id" | "updatedAt">,
  ): Promise<LbSlidesConfig> {
    const [row] = await db
      .insert(lbSlidesConfig)
      .values({ ...patch, id: SINGLETON_ID })
      .onConflictDoUpdate({
        target: lbSlidesConfig.id,
        set: {
          ...patch,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    return row;
  }
}
