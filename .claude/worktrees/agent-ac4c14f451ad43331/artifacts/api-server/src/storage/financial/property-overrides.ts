/**
 * Per-scenario property override persistence + a cross-scenario field reader.
 *
 * `writePropertyOverrides` is delete-then-insert inside a transaction:
 * scenario overrides are always written as a complete replacement set, never
 * patched, so the table row matches the diff-engine output exactly.
 *
 * `getPropertyOverridesForField` powers the assumptions UI's "where else am
 * I overriding this field" panel — joins overrides → scenarios for the
 * current user (active scenarios only).
 */
import { scenarios, scenarioPropertyOverrides } from "@workspace/db";
import { db } from "../../db";
import { eq, isNull, and } from "drizzle-orm";
import { type PropertyDiff } from "../../scenarios/diff-engine";

export class PropertyOverridesStorage {
  async writePropertyOverrides(scenarioId: number, diffs: PropertyDiff[]): Promise<void> {
    if (diffs.length === 0) return;

    await db.transaction(async (tx) => {
      await tx.delete(scenarioPropertyOverrides).where(eq(scenarioPropertyOverrides.scenarioId, scenarioId));

      const values = diffs.map(d => ({
        scenarioId,
        propertyId: d.propertyId ?? undefined,
        propertyName: d.propertyName,
        changeType: d.changeType,
        overrides: d.overrides as Record<string, unknown>,
        basePropertySnapshot: d.baseSnapshot,
      }));

      await tx.insert(scenarioPropertyOverrides).values(values as Array<typeof scenarioPropertyOverrides.$inferInsert>);
    });
  }

  async getPropertyOverrides(scenarioId: number) {
    return await db.select().from(scenarioPropertyOverrides)
      .where(eq(scenarioPropertyOverrides.scenarioId, scenarioId));
  }

  async getPropertyOverridesForField(userId: number, field: string): Promise<Array<{ scenarioId: number; scenarioName: string; propertyName: string; value: unknown }>> {
    const rows = await db
      .select({
        scenarioId: scenarios.id,
        scenarioName: scenarios.name,
        propertyName: scenarioPropertyOverrides.propertyName,
        overrides: scenarioPropertyOverrides.overrides,
      })
      .from(scenarioPropertyOverrides)
      .innerJoin(scenarios, eq(scenarioPropertyOverrides.scenarioId, scenarios.id))
      .where(and(eq(scenarios.userId, userId), isNull(scenarios.deletedAt)));

    const results: Array<{ scenarioId: number; scenarioName: string; propertyName: string; value: unknown }> = [];
    for (const row of rows) {
      const ov = row.overrides as Record<string, unknown>;
      if (ov && field in ov) {
        results.push({
          scenarioId: row.scenarioId,
          scenarioName: row.scenarioName,
          propertyName: row.propertyName,
          value: ov[field],
        });
      }
    }
    return results;
  }
}
