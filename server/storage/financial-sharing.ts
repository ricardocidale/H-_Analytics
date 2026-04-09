import { globalAssumptions, scenarios, scenarioShares, scenarioAccess, scenarioResults, properties, users, propertyFeeCategories, propertyPhotos, type GlobalAssumptions, type Scenario, type ScenarioShare, type ScenarioAccess, type ScenarioResult, type InsertScenarioResult } from "@shared/schema";
import { db } from "../db";
import { eq, desc, isNull, inArray, or, sql, and, aliasedTable } from "drizzle-orm";

export class FinancialSharingStorage {
  async getAllScenarios(filters?: { userId?: number; groupId?: number; companyId?: number }): Promise<(Scenario & { ownerEmail: string; ownerName: string | null })[]> {
    let query = db
      .select({
        id: scenarios.id,
        userId: scenarios.userId,
        name: scenarios.name,
        description: scenarios.description,
        globalAssumptions: scenarios.globalAssumptions,
        properties: scenarios.properties,
        scenarioImages: scenarios.scenarioImages,
        feeCategories: scenarios.feeCategories,
        propertyPhotos: scenarios.propertyPhotos,
        computedResults: scenarios.computedResults,
        computeHash: scenarios.computeHash,
        version: scenarios.version,
        baseSnapshotHash: scenarios.baseSnapshotHash,
        createdAt: scenarios.createdAt,
        updatedAt: scenarios.updatedAt,
        lastOutputHash: scenarios.lastOutputHash,
        lastComputedAt: scenarios.lastComputedAt,
        lastEngineVersion: scenarios.lastEngineVersion,
        kind: scenarios.kind,
        isLocked: scenarios.isLocked,
        deletedAt: scenarios.deletedAt,
        deletedBy: scenarios.deletedBy,
        purgeAfter: scenarios.purgeAfter,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(scenarios)
      .innerJoin(users, eq(scenarios.userId, users.id))
      .orderBy(desc(scenarios.updatedAt));

    const rows = await query;
    let result = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      description: r.description,
      globalAssumptions: r.globalAssumptions,
      properties: r.properties,
      scenarioImages: r.scenarioImages,
      feeCategories: r.feeCategories,
      propertyPhotos: r.propertyPhotos,
      computedResults: r.computedResults,
      computeHash: r.computeHash,
      version: r.version,
      baseSnapshotHash: r.baseSnapshotHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastOutputHash: r.lastOutputHash,
      lastComputedAt: r.lastComputedAt,
      lastEngineVersion: r.lastEngineVersion,
      kind: r.kind,
      isLocked: r.isLocked,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      purgeAfter: r.purgeAfter,
      ownerEmail: r.ownerEmail,
      ownerName: [r.ownerFirstName, r.ownerLastName].filter(Boolean).join(" ") || null,
    }));

    if (filters?.userId) {
      result = result.filter(r => r.userId === filters.userId);
    }

    if (filters?.groupId || filters?.companyId) {
      const conditions = [];
      if (filters.groupId) {
        conditions.push(
          and(eq(scenarioShares.targetType, "group"), eq(scenarioShares.targetId, filters.groupId))
        );
      }
      if (filters.companyId) {
        conditions.push(
          and(eq(scenarioShares.targetType, "company"), eq(scenarioShares.targetId, filters.companyId))
        );
      }
      const matchingShares = await db.select({ scenarioId: scenarioShares.scenarioId })
        .from(scenarioShares)
        .where(conditions.length > 1 ? or(...conditions) : conditions[0]!);
      const matchingIds = new Set(matchingShares.map(s => s.scenarioId));
      result = result.filter(r => matchingIds.has(r.id));
    }

    return result;
  }

  private async getGlobalAssumptions(userId?: number): Promise<GlobalAssumptions | undefined> {
    const condition = userId
      ? or(eq(globalAssumptions.userId, userId), isNull(globalAssumptions.userId))
      : isNull(globalAssumptions.userId);
    const [result] = await db.select().from(globalAssumptions)
      .where(condition)
      .orderBy(sql`${globalAssumptions.userId} IS NULL ASC`, desc(globalAssumptions.id))
      .limit(1);
    if (result) return result;
    const [fallback] = await db.select().from(globalAssumptions).limit(1);
    return fallback || undefined;
  }

  async createScenarioForUser(userId: number, data: { name: string; description?: string | null; kind?: string }): Promise<Scenario> {
    const assumptions = await this.getGlobalAssumptions(userId);
    const allProps = await db.select().from(properties)
      .where(or(eq(properties.userId, userId), isNull(properties.userId)))
      .orderBy(properties.createdAt);

    const propertyIds = allProps.map(p => p.id);
    const feeCatRows = propertyIds.length > 0
      ? await db.select().from(propertyFeeCategories).where(inArray(propertyFeeCategories.propertyId, propertyIds))
      : [];
    const photoRows = propertyIds.length > 0
      ? await db.select().from(propertyPhotos).where(inArray(propertyPhotos.propertyId, propertyIds))
      : [];

    const feeCatsByProp: Record<string, unknown[]> = {};
    const photosByProp: Record<string, unknown[]> = {};
    for (const p of allProps) {
      feeCatsByProp[p.name] = feeCatRows.filter(fc => fc.propertyId === p.id);
      photosByProp[p.name] = photoRows.filter(ph => ph.propertyId === p.id);
    }

    const [scenario] = await db.insert(scenarios).values({
      userId,
      name: data.name,
      description: data.description ?? null,
      globalAssumptions: assumptions || {},
      properties: allProps || [],
      feeCategories: feeCatsByProp,
      propertyPhotos: photosByProp,
      ...(data.kind ? { kind: data.kind } : {}),
    } as typeof scenarios.$inferInsert).returning();
    return scenario;
  }

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

  async getScenarioCountByUser(userId: number): Promise<number> {
    const result = await db.select().from(scenarios).where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)));
    return result.length;
  }

  async getScenariosSharedWithUser(userId: number): Promise<(Scenario & { accessType: string; sharedByUserId: number | null; sharedByName: string | null })[]> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return [];

    const conditions = [and(eq(scenarioShares.targetType, "user"), eq(scenarioShares.targetId, userId))];
    if (user.userGroupId) {
      conditions.push(and(eq(scenarioShares.targetType, "group"), eq(scenarioShares.targetId, user.userGroupId)));
    }
    if (user.companyId) {
      conditions.push(and(eq(scenarioShares.targetType, "company"), eq(scenarioShares.targetId, user.companyId)));
    }

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
      const conditions = [
        eq(scenarioAccess.ownerId, ownerId),
        eq(scenarioAccess.granteeId, granteeId),
        eq(scenarioAccess.grantType, grantType),
      ];
      if (scenarioId != null) {
        conditions.push(eq(scenarioAccess.scenarioId, scenarioId));
      } else {
        conditions.push(isNull(scenarioAccess.scenarioId));
      }
      const [existing] = await db.select().from(scenarioAccess).where(and(...conditions));
      return existing;
    }
    return access;
  }

  async revokeScenarioAccess(ownerId: number, granteeId: number, scenarioId: number | null): Promise<void> {
    const grantType = scenarioId != null ? "specific" : "all";
    const conditions = [
      eq(scenarioAccess.ownerId, ownerId),
      eq(scenarioAccess.granteeId, granteeId),
      eq(scenarioAccess.grantType, grantType),
    ];
    if (scenarioId != null) {
      conditions.push(eq(scenarioAccess.scenarioId, scenarioId));
    } else {
      conditions.push(isNull(scenarioAccess.scenarioId));
    }
    await db.delete(scenarioAccess).where(and(...conditions));
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

    for (const grant of allGrantRows) {
      const ownerScenarios = await db.select().from(scenarios)
        .where(and(eq(scenarios.userId, grant.ownerId), isNull(scenarios.deletedAt), eq(scenarios.kind, "manual")));
      const ownerName = grant.ownerFirstName || grant.ownerLastName
        ? [grant.ownerFirstName, grant.ownerLastName].filter(Boolean).join(" ")
        : grant.ownerEmail ?? null;
      for (const s of ownerScenarios) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        results.push({ ...s, accessType: "shared", sharedByUserId: grant.ownerId, sharedByName: ownerName });
      }
    }

    return results;
  }

  async saveScenarioResult(data: InsertScenarioResult): Promise<ScenarioResult> {
    return await db.transaction(async (tx) => {
      const [result] = await tx.insert(scenarioResults).values(data)
        .onConflictDoUpdate({
          target: [scenarioResults.scenarioId, scenarioResults.outputHash],
          set: {
            engineVersion: data.engineVersion,
            inputsHash: data.inputsHash,
            consolidatedYearlyJson: data.consolidatedYearlyJson,
            auditOpinion: data.auditOpinion,
            projectionYears: data.projectionYears,
            propertyCount: data.propertyCount,
            computedBy: data.computedBy,
            computedAt: sql`NOW()`,
          },
        })
        .returning();

      await tx.update(scenarios).set({
        lastOutputHash: data.outputHash,
        lastComputedAt: new Date(),
        lastEngineVersion: data.engineVersion,
      }).where(eq(scenarios.id, data.scenarioId));

      return result;
    });
  }

  async getLatestScenarioResult(scenarioId: number): Promise<ScenarioResult | undefined> {
    const [result] = await db.select().from(scenarioResults)
      .where(eq(scenarioResults.scenarioId, scenarioId))
      .orderBy(desc(scenarioResults.computedAt))
      .limit(1);
    return result;
  }

  async getScenarioResultByHash(scenarioId: number, outputHash: string): Promise<ScenarioResult | undefined> {
    const [result] = await db.select().from(scenarioResults)
      .where(and(
        eq(scenarioResults.scenarioId, scenarioId),
        eq(scenarioResults.outputHash, outputHash),
      ));
    return result;
  }
}
