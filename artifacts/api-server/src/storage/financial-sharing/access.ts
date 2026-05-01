/**
 * scenario_access CRUD — the single source of truth for scenario sharing.
 *
 * After task #871 (drop scenario_shares), all grant/revoke operations read
 * and write only to scenario_access. The two-table union that previously
 * existed in getScenariosSharedWithUser has been removed; the method now
 * queries scenario_access exclusively.
 *
 * Two grant types in scenario_access:
 *   - "specific": scenarioId is set — grants access to one scenario
 *   - "all":      scenarioId is NULL — grants access to ALL scenarios owned by ownerId
 *
 * Admin-path helpers (addScenarioAccess, removeScenarioAccess,
 * getScenarioSharesForScenario, getAllScenarioShares, getSharesForScenario,
 * removeAllSharesForScenario, removeScenarioSharesByTarget,
 * shareScenarioWithUser, shareAllScenariosWithUser) were previously split
 * across shares.ts (now deleted). They are consolidated here and operate
 * only on scenario_access.
 */
import {
  scenarios,
  scenarioAccess,
  users,
  type Scenario,
  type ScenarioAccess,
} from "@workspace/db";
import { db } from "../../db";
import { eq, isNull, inArray, or, sql, and, aliasedTable } from "drizzle-orm";

export class FinancialSharingAccessStorage {
  /**
   * Grant access to a scenario (or all scenarios) for a grantee.
   *
   * "specific" grants (scenarioId != null): one scenario.
   * "all" grants (scenarioId = null): all current and future scenarios owned
   *   by ownerId.
   */
  async grantScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<ScenarioAccess> {
    const grantType = scenarioId != null ? "specific" : "all";

    const [access] = await db.insert(scenarioAccess).values({
      scenarioId: scenarioId ?? null,
      ownerId,
      granteeId,
      grantType,
    } as typeof scenarioAccess.$inferInsert)
      .onConflictDoNothing()
      .returning();

    if (!access) {
      const whereClause = scenarioId != null
        ? and(
            eq(scenarioAccess.ownerId, ownerId),
            eq(scenarioAccess.granteeId, granteeId),
            eq(scenarioAccess.grantType, grantType),
            eq(scenarioAccess.scenarioId, scenarioId),
          )
        : and(
            eq(scenarioAccess.ownerId, ownerId),
            eq(scenarioAccess.granteeId, granteeId),
            eq(scenarioAccess.grantType, grantType),
            isNull(scenarioAccess.scenarioId),
          );
      const [existing] = await db.select().from(scenarioAccess).where(whereClause);
      return existing;
    }
    return access;
  }

  /**
   * Revoke access for a grantee.
   *
   * "specific" revocations (scenarioId != null): remove one scenario grant.
   * "all" revocations (scenarioId = null): remove the "all" grant.
   */
  async revokeScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<void> {
    const grantType = scenarioId != null ? "specific" : "all";

    if (scenarioId != null) {
      await db.delete(scenarioAccess).where(
        and(
          eq(scenarioAccess.ownerId, ownerId),
          eq(scenarioAccess.granteeId, granteeId),
          eq(scenarioAccess.grantType, grantType),
          eq(scenarioAccess.scenarioId, scenarioId),
        )
      );
      return;
    }

    await db.delete(scenarioAccess).where(
      and(
        eq(scenarioAccess.ownerId, ownerId),
        eq(scenarioAccess.granteeId, granteeId),
        eq(scenarioAccess.grantType, grantType),
        isNull(scenarioAccess.scenarioId),
      )
    );
  }

  async getScenarioAccessByOwner(ownerId: number): Promise<(ScenarioAccess & { granteeName: string | null; granteeEmail: string })[]> {
    const granteeAlias = aliasedTable(users, "grantee");
    const rows = await db
      .select({
        access: scenarioAccess,
        granteeFirstName: granteeAlias.firstName,
        granteeLastName: granteeAlias.lastName,
        granteeEmail: granteeAlias.email,
      })
      .from(scenarioAccess)
      .innerJoin(granteeAlias, eq(scenarioAccess.granteeId, granteeAlias.id))
      .where(eq(scenarioAccess.ownerId, ownerId))
      .orderBy(scenarioAccess.createdAt);

    return rows.map(row => {
      const name = [row.granteeFirstName, row.granteeLastName].filter(Boolean).join(" ") || null;
      return { ...row.access, granteeName: name, granteeEmail: row.granteeEmail };
    });
  }

  async getScenariosSharedWithUser(userId: number): Promise<(Scenario & { accessType: string; sharedByUserId: number | null; sharedByName: string | null })[]> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return [];
    return this.getScenariosSharedViaAccess(userId);
  }

  async getScenariosSharedViaAccess(userId: number): Promise<(Scenario & { accessType: string; sharedByUserId: number; sharedByName: string | null })[]> {
    const ownerAlias = aliasedTable(users, "owner");

    const specificRows = await db
      .select({
        scenario: scenarios,
        ownerId: scenarioAccess.ownerId,
        ownerFirstName: ownerAlias.firstName,
        ownerLastName: ownerAlias.lastName,
        ownerEmail: ownerAlias.email,
      })
      .from(scenarioAccess)
      .innerJoin(scenarios, and(
        eq(scenarioAccess.scenarioId, scenarios.id),
        isNull(scenarios.deletedAt),
      ))
      .leftJoin(ownerAlias, eq(scenarioAccess.ownerId, ownerAlias.id))
      .where(and(
        eq(scenarioAccess.granteeId, userId),
        eq(scenarioAccess.grantType, "specific"),
        sql`${scenarios.userId} != ${userId}`,
      ));

    const allGrantRows = await db
      .select({
        ownerId: scenarioAccess.ownerId,
        ownerFirstName: ownerAlias.firstName,
        ownerLastName: ownerAlias.lastName,
        ownerEmail: ownerAlias.email,
      })
      .from(scenarioAccess)
      .leftJoin(ownerAlias, eq(scenarioAccess.ownerId, ownerAlias.id))
      .where(and(
        eq(scenarioAccess.granteeId, userId),
        eq(scenarioAccess.grantType, "all"),
        isNull(scenarioAccess.scenarioId),
      ));

    const seen = new Set<number>();
    const results: (Scenario & { accessType: string; sharedByUserId: number; sharedByName: string | null })[] = [];

    for (const row of specificRows) {
      if (seen.has(row.scenario.id)) continue;
      seen.add(row.scenario.id);
      const ownerName = row.ownerFirstName || row.ownerLastName
        ? [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ")
        : row.ownerEmail ?? null;
      results.push({ ...row.scenario, accessType: "shared", sharedByUserId: row.ownerId, sharedByName: ownerName });
    }

    if (allGrantRows.length > 0) {
      const ownerIds = allGrantRows.map(g => g.ownerId);
      const allOwnerScenarios = await db.select().from(scenarios)
        .where(and(inArray(scenarios.userId, ownerIds), isNull(scenarios.deletedAt), eq(scenarios.kind, "manual")));

      const ownerNameMap = new Map<number, string | null>();
      for (const grant of allGrantRows) {
        const ownerName = grant.ownerFirstName || grant.ownerLastName
          ? [grant.ownerFirstName, grant.ownerLastName].filter(Boolean).join(" ")
          : grant.ownerEmail ?? null;
        ownerNameMap.set(grant.ownerId, ownerName);
      }

      for (const s of allOwnerScenarios) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        results.push({ ...s, accessType: "shared", sharedByUserId: s.userId, sharedByName: ownerNameMap.get(s.userId) ?? null });
      }
    }

    return results;
  }

  /**
   * Grant access to a specific scenario for a user target (admin path).
   * Only "user" targetType is supported; other target types are ignored
   * since scenario_access has no group/company row structure.
   */
  async addScenarioAccess(scenarioId: number, targetType: string, targetId: number, grantedBy: number): Promise<ScenarioAccess> {
    if (targetType !== "user") {
      throw new Error(`scenario_access does not support targetType "${targetType}" — only "user" grants are stored`);
    }

    const [scenario] = await db.select({ userId: scenarios.userId }).from(scenarios).where(eq(scenarios.id, scenarioId));
    const ownerId = scenario?.userId ?? grantedBy;

    const [access] = await db.insert(scenarioAccess).values({
      scenarioId,
      ownerId,
      granteeId: targetId,
      grantType: "specific",
    } as typeof scenarioAccess.$inferInsert)
      .onConflictDoNothing()
      .returning();

    if (!access) {
      const [existing] = await db.select().from(scenarioAccess).where(
        and(
          eq(scenarioAccess.scenarioId, scenarioId),
          eq(scenarioAccess.granteeId, targetId),
          eq(scenarioAccess.grantType, "specific"),
        )
      );
      return existing;
    }
    return access;
  }

  /**
   * Revoke access to a specific scenario for a target (admin path).
   * Only "user" targetType affects scenario_access rows; other types are no-ops.
   */
  async removeScenarioAccess(scenarioId: number, targetType: string, targetId: number): Promise<void> {
    if (targetType !== "user") return;

    await db.delete(scenarioAccess).where(
      and(
        eq(scenarioAccess.scenarioId, scenarioId),
        eq(scenarioAccess.granteeId, targetId),
        eq(scenarioAccess.grantType, "specific"),
      )
    );
  }

  /** Return all scenario_access rows for a given scenario (admin path). */
  async getScenarioSharesForScenario(scenarioId: number): Promise<ScenarioAccess[]> {
    return await db.select().from(scenarioAccess).where(eq(scenarioAccess.scenarioId, scenarioId));
  }

  /** Return all scenario_access rows across all scenarios (admin path). */
  async getAllScenarioShares(): Promise<ScenarioAccess[]> {
    return await db.select().from(scenarioAccess);
  }

  /** Alias for getScenarioSharesForScenario (legacy call-site compatibility). */
  async getSharesForScenario(scenarioId: number): Promise<ScenarioAccess[]> {
    return this.getScenarioSharesForScenario(scenarioId);
  }

  /**
   * Share a single scenario with a user (user-facing path).
   *
   * Returns null if the grant already exists, otherwise returns the new row.
   */
  async shareScenarioWithUser(scenarioId: number, recipientId: number, grantedBy: number): Promise<ScenarioAccess | null> {
    const [scenario] = await db.select({ userId: scenarios.userId }).from(scenarios).where(eq(scenarios.id, scenarioId));
    const ownerId = scenario?.userId ?? grantedBy;

    const [access] = await db.insert(scenarioAccess).values({
      scenarioId,
      ownerId,
      granteeId: recipientId,
      grantType: "specific",
    } as typeof scenarioAccess.$inferInsert)
      .onConflictDoNothing()
      .returning();

    return access ?? null;
  }

  /**
   * Share all of an owner's scenarios with a recipient.
   *
   * Skips scenarios that the recipient already has a specific grant for.
   */
  async shareAllScenariosWithUser(ownerId: number, recipientId: number): Promise<ScenarioAccess[]> {
    const userScenarios = await db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.userId, ownerId), isNull(scenarios.deletedAt)));

    if (userScenarios.length === 0) return [];

    const existingAccess = await db.select().from(scenarioAccess).where(
      and(
        eq(scenarioAccess.ownerId, ownerId),
        eq(scenarioAccess.granteeId, recipientId),
        eq(scenarioAccess.grantType, "specific"),
        inArray(scenarioAccess.scenarioId, userScenarios.map(s => s.id)),
      )
    );
    const alreadyGrantedIds = new Set(existingAccess.map(a => a.scenarioId));
    const toGrant = userScenarios.filter(s => !alreadyGrantedIds.has(s.id));

    if (toGrant.length === 0) return [];

    const results: ScenarioAccess[] = [];
    for (const s of toGrant) {
      const [access] = await db.insert(scenarioAccess).values({
        scenarioId: s.id,
        ownerId,
        granteeId: recipientId,
        grantType: "specific",
      } as typeof scenarioAccess.$inferInsert)
        .onConflictDoNothing()
        .returning();
      if (access) results.push(access);
    }
    return results;
  }

  /** Remove all access grants for a scenario (admin path). */
  async removeAllSharesForScenario(scenarioId: number): Promise<{ accessRemoved: number }> {
    const deleted = await db.delete(scenarioAccess).where(eq(scenarioAccess.scenarioId, scenarioId)).returning();
    return { accessRemoved: deleted.length };
  }

  /**
   * Remove all specific grants for a target user (e.g. when a user is deleted).
   * Non-user targets are a no-op since scenario_access has no such rows.
   */
  async removeScenarioSharesByTarget(targetType: string, targetId: number): Promise<void> {
    if (targetType !== "user") return;

    await db.delete(scenarioAccess).where(
      and(
        eq(scenarioAccess.granteeId, targetId),
        eq(scenarioAccess.grantType, "specific"),
      )
    );
  }
}
