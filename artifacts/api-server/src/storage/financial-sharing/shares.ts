/**
 * scenario_shares CRUD — the legacy "share with target (user|group)" table.
 *
 * Write path consolidation (task #865):
 * Every write that touches scenario_shares now also touches scenario_access
 * in the SAME DB transaction, and vice-versa.  This eliminates the drift
 * that could occur when the two tables were updated independently:
 *
 *   - addScenarioAccess      → transaction: scenario_shares + scenario_access (user targets)
 *   - removeScenarioAccess   → transaction: scenario_shares + scenario_access (user targets)
 *   - shareScenarioWithUser  → transaction: scenario_shares + scenario_access
 *   - shareAllScenariosWithUser → single transaction wrapping all per-scenario writes
 *   - removeAllSharesForScenario → transaction: atomically wipes both tables
 *   - removeScenarioSharesByTarget → deletes scenario_shares rows; now also
 *     removes matching scenario_access "specific" grants for the same target
 *
 * Non-user targets (e.g. "group") have no counterpart in scenario_access and
 * only write to scenario_shares.
 *
 * The pure-read helpers (getScenarioSharesForScenario, getAllScenarioShares,
 * getSharesForScenario) are unchanged — they continue to query only
 * scenario_shares since access.ts provides the merged reader.
 */
import {
  scenarios,
  scenarioShares,
  scenarioAccess,
  type ScenarioShare,
} from "@workspace/db";
import { db } from "../../db";
import { eq, isNull, and, inArray } from "drizzle-orm";

export class FinancialSharingSharesStorage {
  async getScenarioSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async getAllScenarioShares(): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares);
  }

  /**
   * Grant access to a specific scenario for a target (admin path).
   *
   * For user targets: atomically inserts into both scenario_shares and
   * scenario_access (using the scenario's owner as the grantor) so the
   * enforcement table stays consistent with the audit table.
   * For non-user targets (e.g. "group"): only inserts into scenario_shares
   * because scenario_access has no group-grant row structure.
   */
  async addScenarioAccess(scenarioId: number, targetType: string, targetId: number, grantedBy: number): Promise<ScenarioShare> {
    if (targetType !== "user") {
      const [share] = await db.insert(scenarioShares).values({
        scenarioId,
        targetType,
        targetId,
        grantedBy,
      } as typeof scenarioShares.$inferInsert).returning();
      return share;
    }

    return await db.transaction(async (tx) => {
      const [share] = await tx.insert(scenarioShares).values({
        scenarioId,
        targetType,
        targetId,
        grantedBy,
      } as typeof scenarioShares.$inferInsert).returning();

      // Look up the scenario owner so we can set ownerId in scenario_access.
      const [scenario] = await tx.select({ userId: scenarios.userId }).from(scenarios).where(eq(scenarios.id, scenarioId));
      if (scenario) {
        await tx.insert(scenarioAccess).values({
          scenarioId,
          ownerId: scenario.userId,
          granteeId: targetId,
          grantType: "specific",
        } as typeof scenarioAccess.$inferInsert).onConflictDoNothing();
      }

      return share;
    });
  }

  /**
   * Revoke access to a specific scenario for a target (admin path).
   *
   * For user targets: atomically deletes from both scenario_shares and
   * scenario_access so the enforcement table stays consistent.
   * For non-user targets (e.g. "group"): only deletes from scenario_shares.
   */
  async removeScenarioAccess(scenarioId: number, targetType: string, targetId: number): Promise<void> {
    if (targetType !== "user") {
      await db.delete(scenarioShares).where(
        and(
          eq(scenarioShares.scenarioId, scenarioId),
          eq(scenarioShares.targetType, targetType),
          eq(scenarioShares.targetId, targetId),
        )
      );
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(scenarioShares).where(
        and(
          eq(scenarioShares.scenarioId, scenarioId),
          eq(scenarioShares.targetType, targetType),
          eq(scenarioShares.targetId, targetId),
        )
      );

      await tx.delete(scenarioAccess).where(
        and(
          eq(scenarioAccess.scenarioId, scenarioId),
          eq(scenarioAccess.granteeId, targetId),
          eq(scenarioAccess.grantType, "specific"),
        )
      );
    });
  }

  /**
   * Share a single scenario with a user.
   *
   * Writes atomically to BOTH scenario_shares (admin tracking) and
   * scenario_access (enforcement), so the two tables stay in sync.
   * Returns null if the share already existed in scenario_shares.
   */
  async shareScenarioWithUser(scenarioId: number, recipientId: number, grantedBy: number): Promise<ScenarioShare | null> {
    const existing = await db.select().from(scenarioShares).where(
      and(
        eq(scenarioShares.scenarioId, scenarioId),
        eq(scenarioShares.targetType, "user"),
        eq(scenarioShares.targetId, recipientId),
      )
    );
    if (existing.length > 0) {
      // Share already recorded — opportunistically ensure scenario_access is in sync
      // in case the row drifted (e.g., was written before the dual-write patch).
      const [scenario] = await db.select({ userId: scenarios.userId }).from(scenarios).where(eq(scenarios.id, scenarioId));
      if (scenario) {
        await db.insert(scenarioAccess).values({
          scenarioId,
          ownerId: scenario.userId,
          granteeId: recipientId,
          grantType: "specific",
        } as typeof scenarioAccess.$inferInsert).onConflictDoNothing();
      }
      return null;
    }

    return await db.transaction(async (tx) => {
      const [share] = await tx.insert(scenarioShares).values({
        scenarioId,
        targetType: "user",
        targetId: recipientId,
        grantedBy,
      } as typeof scenarioShares.$inferInsert).returning();

      // Derive the scenario owner so scenario_access.owner_id is always the
      // scenario's actual owner, even if grantedBy is an admin acting on their behalf.
      const [scenario] = await tx.select({ userId: scenarios.userId }).from(scenarios).where(eq(scenarios.id, scenarioId));
      if (scenario) {
        await tx.insert(scenarioAccess).values({
          scenarioId,
          ownerId: scenario.userId,
          granteeId: recipientId,
          grantType: "specific",
        } as typeof scenarioAccess.$inferInsert).onConflictDoNothing();
      }

      return share;
    });
  }

  /**
   * Share all of an owner's scenarios with a recipient in one transaction.
   *
   * Wraps every per-scenario write in a single DB transaction so the two
   * tables cannot diverge if the operation is interrupted mid-loop.
   */
  async shareAllScenariosWithUser(ownerId: number, recipientId: number): Promise<ScenarioShare[]> {
    const userScenarios = await db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.userId, ownerId), isNull(scenarios.deletedAt)));

    if (userScenarios.length === 0) return [];

    const existingShares = await db.select().from(scenarioShares).where(
      and(
        eq(scenarioShares.targetType, "user"),
        eq(scenarioShares.targetId, recipientId),
        inArray(scenarioShares.scenarioId, userScenarios.map(s => s.id)),
      )
    );
    const alreadySharedIds = new Set(existingShares.map(s => s.scenarioId));
    const toShare = userScenarios.filter(s => !alreadySharedIds.has(s.id));

    if (toShare.length === 0) return [];

    return await db.transaction(async (tx) => {
      const results: ScenarioShare[] = [];
      for (const s of toShare) {
        const [share] = await tx.insert(scenarioShares).values({
          scenarioId: s.id,
          targetType: "user",
          targetId: recipientId,
          grantedBy: ownerId,
        } as typeof scenarioShares.$inferInsert).returning();
        results.push(share);

        await tx.insert(scenarioAccess).values({
          scenarioId: s.id,
          ownerId,
          granteeId: recipientId,
          grantType: "specific",
        } as typeof scenarioAccess.$inferInsert).onConflictDoNothing();
      }
      return results;
    });
  }

  async getSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async removeAllSharesForScenario(scenarioId: number): Promise<{ sharesRemoved: number; accessRemoved: number }> {
    return await db.transaction(async (tx) => {
      const shares = await tx.delete(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId)).returning();
      const access = await tx.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, scenarioId)).returning();
      return { sharesRemoved: shares.length, accessRemoved: access.length };
    });
  }

  /**
   * Remove all scenario_shares rows for a target (e.g. when a user is deleted).
   * Also removes any matching scenario_access "specific" grants for the same
   * target so the enforcement table stays in sync with the tracking table.
   */
  async removeScenarioSharesByTarget(targetType: string, targetId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(scenarioShares).where(
        and(
          eq(scenarioShares.targetType, targetType),
          eq(scenarioShares.targetId, targetId),
        )
      );

      if (targetType === "user") {
        await tx.delete(scenarioAccess).where(
          and(
            eq(scenarioAccess.granteeId, targetId),
            eq(scenarioAccess.grantType, "specific"),
          )
        );
      }
    });
  }
}
