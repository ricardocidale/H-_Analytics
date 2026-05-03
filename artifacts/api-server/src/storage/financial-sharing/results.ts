/**
 * scenario_results CRUD — durable computed-result rows + denormalized
 * "last computed" pointer on the parent scenario row.
 *
 * `saveScenarioResult` is upsert-by-(scenarioId, outputHash): re-computing a
 * scenario whose inputs hash to the same value is a no-op write. The
 * scenarios.lastOutputHash / lastComputedAt / lastEngineVersion fields are
 * updated in the same transaction so the parent never disagrees with the
 * latest results row.
 */
import {
  scenarios,
  scenarioResults,
  type ScenarioResult,
  type InsertScenarioResult,
} from "@workspace/db";
import { db } from "../../db";
import { eq, desc, sql } from "drizzle-orm";

export class FinancialSharingResultsStorage {
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
}
