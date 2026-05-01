/**
 * scenario_access CRUD + the user-facing "what's been shared with me" reads.
 *
 * scenario_access is the fine-grained grant system; it coexists with
 * scenario_shares (see ./shares.ts). The two reader methods at the bottom
 * merge results from both systems so callers don't have to know about the
 * legacy table — `getScenariosSharedWithUser` queries scenario_shares then
 * unions in `getScenariosSharedViaAccess`'s scenario_access results.
 *
 * Write path consolidation (task #865):
 * grantScenarioAccess and revokeScenarioAccess now update BOTH tables
 * atomically in a transaction for the "specific" grant type (where a
 * scenarioId is provided).  "all" grants (scenarioId = null) have no
 * equivalent row in scenario_shares, so only scenario_access is touched
 * for those.
 */
import {
  scenarios,
  scenarioShares,
  scenarioAccess,
  users,
  type Scenario,
  type ScenarioAccess,
} from "@workspace/db";
import { db } from "../../db";
import { eq, isNull, inArray, or, sql, and, exists, aliasedTable } from "drizzle-orm";

export class FinancialSharingAccessStorage {
  /**
   * Grant access to a scenario (or all scenarios) for a grantee.
   *
   * For "specific" grants (scenarioId != null): writes atomically to both
   * scenario_access (enforcement) and scenario_shares (admin tracking).
   * For "all" grants (scenarioId = null): only writes to scenario_access
   * because scenario_shares has no equivalent "grant all" row structure.
   */
  async grantScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<ScenarioAccess> {
    const grantType = scenarioId != null ? "specific" : "all";

    if (scenarioId != null) {
      return await db.transaction(async (tx) => {
        const [access] = await tx.insert(scenarioAccess).values({
          scenarioId,
          ownerId,
          granteeId,
          grantType,
        } as typeof scenarioAccess.$inferInsert)
          .onConflictDoNothing()
          .returning();

        const result = access ?? await (async () => {
          const [existing] = await tx.select().from(scenarioAccess).where(
            and(
              eq(scenarioAccess.ownerId, ownerId),
              eq(scenarioAccess.granteeId, granteeId),
              eq(scenarioAccess.grantType, grantType),
              eq(scenarioAccess.scenarioId, scenarioId),
            )
          );
          return existing;
        })();

        await tx.insert(scenarioShares).values({
          scenarioId,
          targetType: "user",
          targetId: granteeId,
          grantedBy: ownerId,
        } as typeof scenarioShares.$inferInsert).onConflictDoNothing();

        return result;
      });
    }

    const [access] = await db.insert(scenarioAccess).values({
      scenarioId: null,
      ownerId,
      granteeId,
      grantType,
    } as typeof scenarioAccess.$inferInsert)
      .onConflictDoNothing()
      .returning();

    if (!access) {
      const [existing] = await db.select().from(scenarioAccess).where(
        and(
          eq(scenarioAccess.ownerId, ownerId),
          eq(scenarioAccess.granteeId, granteeId),
          eq(scenarioAccess.grantType, grantType),
          isNull(scenarioAccess.scenarioId),
        )
      );
      return existing;
    }
    return access;
  }

  /**
   * Revoke access for a grantee.
   *
   * For "specific" revocations (scenarioId != null): removes atomically from
   * both scenario_access and scenario_shares in a transaction.
   * For "all" revocations (scenarioId = null): only removes from
   * scenario_access (no matching row exists in scenario_shares).
   */
  async revokeScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<void> {
    const grantType = scenarioId != null ? "specific" : "all";

    if (scenarioId != null) {
      await db.transaction(async (tx) => {
        await tx.delete(scenarioAccess).where(
          and(
            eq(scenarioAccess.ownerId, ownerId),
            eq(scenarioAccess.granteeId, granteeId),
            eq(scenarioAccess.grantType, grantType),
            eq(scenarioAccess.scenarioId, scenarioId),
          )
        );

        // Only remove the scenario_shares row when the caller is confirmed as the
        // scenario owner, preventing unauthorized deletion of another user's audit record.
        // We validate ownership via a correlated subquery on the scenarios table.
        await tx.delete(scenarioShares).where(
          and(
            eq(scenarioShares.scenarioId, scenarioId),
            eq(scenarioShares.targetType, "user"),
            eq(scenarioShares.targetId, granteeId),
            exists(
              tx.select({ one: sql`1` })
                .from(scenarios)
                .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, ownerId)))
            ),
          )
        );
      });
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

    const conditions = [and(eq(scenarioShares.targetType, "user"), eq(scenarioShares.targetId, userId))];

    const granterAlias = aliasedTable(users, "granter");
    const rows = await db
      .select({
        scenario: scenarios,
        grantedBy: scenarioShares.grantedBy,
        granterFirstName: granterAlias.firstName,
        granterLastName: granterAlias.lastName,
        granterEmail: granterAlias.email,
      })
      .from(scenarioShares)
      .innerJoin(scenarios, and(
        eq(scenarioShares.scenarioId, scenarios.id),
        isNull(scenarios.deletedAt),
        sql`${scenarios.userId} != ${userId}`,
      ))
      .leftJoin(granterAlias, eq(scenarioShares.grantedBy, granterAlias.id))
      .where(or(...conditions));

    const seen = new Set<number>();
    const results: (Scenario & { accessType: string; sharedByUserId: number | null; sharedByName: string | null })[] = [];
    for (const row of rows) {
      if (seen.has(row.scenario.id)) continue;
      seen.add(row.scenario.id);
      const granterName = row.granterFirstName || row.granterLastName
        ? [row.granterFirstName, row.granterLastName].filter(Boolean).join(" ")
        : row.granterEmail ?? null;
      results.push({ ...row.scenario, accessType: "shared", sharedByUserId: row.grantedBy, sharedByName: granterName });
    }

    const accessResults = await this.getScenariosSharedViaAccess(userId);
    for (const s of accessResults) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      results.push(s);
    }

    return results;
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
}
