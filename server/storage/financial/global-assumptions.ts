/**
 * GlobalAssumptionsStorage — read/upsert/patch for the per-user
 * global_assumptions row used as a shared source-of-truth by the Settings
 * page and downstream calculators.
 *
 * Read precedence: own row first, then NULL-userId fallback (the seeded
 * platform default), so a fresh user always sees something even before
 * their first save.
 */
import { globalAssumptions, type GlobalAssumptions, type InsertGlobalAssumptions } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, isNull, sql } from "drizzle-orm";
import { stripAutoFields, stripToColumns } from "../utils";

export class GlobalAssumptionsStorage {
  /**
   * Read precedence (single query, no fallback round-trip):
   *   1. row matching the requested userId (when provided)
   *   2. row with userId IS NULL (the seeded shared default)
   *   3. any other row (last-resort fallback so a brand-new install still
   *      returns something)
   *
   * Encoded via a CASE expression in ORDER BY so the database picks the
   * winner in a single index/sort pass instead of three sequential SELECTs
   * (db-audit spec item 6 — see `.local/db-audit-PHASE-A-CLOSEOUT.md`).
   */
  async getGlobalAssumptions(userId?: number): Promise<GlobalAssumptions | undefined> {
    const orderExpr = userId
      ? sql`CASE WHEN ${eq(globalAssumptions.userId, userId)} THEN 0 WHEN ${isNull(globalAssumptions.userId)} THEN 1 ELSE 2 END`
      : sql`CASE WHEN ${isNull(globalAssumptions.userId)} THEN 0 ELSE 1 END`;

    const [result] = await db.select().from(globalAssumptions)
      .orderBy(orderExpr, desc(globalAssumptions.id))
      .limit(1);

    return result || undefined;
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
}
