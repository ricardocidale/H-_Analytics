import { db } from "../db";
import { userPageVisits } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import type { UserPageVisit } from "@shared/schema";

export class PageVisitStorage {
  async getPageVisit(userId: number, pageKey: string): Promise<UserPageVisit | null> {
    const rows = await db
      .select()
      .from(userPageVisits)
      .where(and(eq(userPageVisits.userId, userId), eq(userPageVisits.pageKey, pageKey)))
      .limit(1);
    return rows[0] ?? null;
  }

  async recordVisit(userId: number, pageKey: string, entityType?: string, entityId?: number): Promise<UserPageVisit> {
    const existing = await this.getPageVisit(userId, pageKey);
    if (existing) {
      const [updated] = await db
        .update(userPageVisits)
        .set({
          lastVisitedAt: new Date(),
          visitCount: sql`${userPageVisits.visitCount} + 1`,
          entityType: entityType ?? existing.entityType,
          entityId: entityId ?? existing.entityId,
        })
        .where(eq(userPageVisits.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(userPageVisits)
      .values({ userId, pageKey, entityType, entityId })
      .returning();
    return created;
  }

  async recordSave(userId: number, pageKey: string, compulsoryFieldsComplete: boolean): Promise<UserPageVisit> {
    const existing = await this.getPageVisit(userId, pageKey);
    if (!existing) {
      const [created] = await db
        .insert(userPageVisits)
        .values({
          userId,
          pageKey,
          endorsed: true,
          compulsoryFieldsComplete,
          lastSavedAt: new Date(),
        })
        .returning();
      return created;
    }
    const [updated] = await db
      .update(userPageVisits)
      .set({
        endorsed: true,
        compulsoryFieldsComplete,
        lastSavedAt: new Date(),
      })
      .where(eq(userPageVisits.id, existing.id))
      .returning();
    return updated;
  }

  async recordAnalystRun(userId: number, pageKey: string): Promise<UserPageVisit> {
    const existing = await this.getPageVisit(userId, pageKey);
    if (!existing) {
      const [created] = await db
        .insert(userPageVisits)
        .values({
          userId,
          pageKey,
          lastAnalystRunAt: new Date(),
        })
        .returning();
      return created;
    }
    const [updated] = await db
      .update(userPageVisits)
      .set({ lastAnalystRunAt: new Date() })
      .where(eq(userPageVisits.id, existing.id))
      .returning();
    return updated;
  }

  async cleanupOldVisits(monthsToKeep: number = 12): Promise<number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsToKeep);
    const result = await db
      .delete(userPageVisits)
      .where(lt(userPageVisits.lastVisitedAt, cutoff))
      .returning();
    return result.length;
  }
}
