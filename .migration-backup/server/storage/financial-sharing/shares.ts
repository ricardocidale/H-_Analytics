/**
 * scenario_shares CRUD — the legacy "share with target (user|group)" table.
 *
 * Pure read/write of scenario_shares rows plus a couple of helpers that
 * touch scenario_access cleanup at the same time (e.g.,
 * removeAllSharesForScenario which wipes both share systems for a
 * scenario in one call).
 */
import {
  scenarios,
  scenarioShares,
  scenarioAccess,
  type ScenarioShare,
} from "@shared/schema";
import { db } from "../../db";
import { eq, isNull, and } from "drizzle-orm";

export class FinancialSharingSharesStorage {
  async getScenarioSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async getAllScenarioShares(): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares);
  }

  async addScenarioAccess(scenarioId: number, targetType: string, targetId: number, grantedBy: number): Promise<ScenarioShare> {
    const [share] = await db.insert(scenarioShares).values({
      scenarioId,
      targetType,
      targetId,
      grantedBy,
    } as typeof scenarioShares.$inferInsert).returning();
    return share;
  }

  async removeScenarioAccess(scenarioId: number, targetType: string, targetId: number): Promise<void> {
    await db.delete(scenarioShares).where(
      and(
        eq(scenarioShares.scenarioId, scenarioId),
        eq(scenarioShares.targetType, targetType),
        eq(scenarioShares.targetId, targetId),
      )
    );
  }

  async shareScenarioWithUser(scenarioId: number, recipientId: number, grantedBy: number): Promise<ScenarioShare | null> {
    const existing = await db.select().from(scenarioShares).where(
      and(
        eq(scenarioShares.scenarioId, scenarioId),
        eq(scenarioShares.targetType, "user"),
        eq(scenarioShares.targetId, recipientId),
      )
    );
    if (existing.length > 0) return null;
    const [share] = await db.insert(scenarioShares).values({
      scenarioId,
      targetType: "user",
      targetId: recipientId,
      grantedBy,
    } as typeof scenarioShares.$inferInsert).returning();
    return share;
  }

  async shareAllScenariosWithUser(ownerId: number, recipientId: number): Promise<ScenarioShare[]> {
    const userScenarios = await db.select().from(scenarios).where(and(eq(scenarios.userId, ownerId), isNull(scenarios.deletedAt)));
    const results: ScenarioShare[] = [];
    for (const s of userScenarios) {
      const share = await this.shareScenarioWithUser(s.id, recipientId, ownerId);
      if (share) results.push(share);
    }
    return results;
  }

  async getSharesForScenario(scenarioId: number): Promise<ScenarioShare[]> {
    return await db.select().from(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId));
  }

  async removeAllSharesForScenario(scenarioId: number): Promise<{ sharesRemoved: number; accessRemoved: number }> {
    const shares = await db.delete(scenarioShares).where(eq(scenarioShares.scenarioId, scenarioId)).returning();
    const access = await db.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, scenarioId)).returning();
    return { sharesRemoved: shares.length, accessRemoved: access.length };
  }

  async removeScenarioSharesByTarget(targetType: string, targetId: number): Promise<void> {
    await db.delete(scenarioShares).where(
      and(
        eq(scenarioShares.targetType, targetType),
        eq(scenarioShares.targetId, targetId),
      )
    );
  }
}
