/**
 * Admin-editable resource ↔ specialist connections (Task #496).
 *
 * Backs the Sources tab on every Specialist & Analyst page and the
 * "Connected to" multi-select in the Resources area. Layered ON TOP of the
 * read-only catalog (`specialist_assignments`); both sources are merged at
 * the route level so the Sources tab reflects catalog wiring + admin edits.
 */
import { db } from "../../db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  resourceSpecialistConnections,
  type ConnectionTarget,
  type ResourceSpecialistConnectionRow,
} from "@shared/schema";

export class AdminResourceConnectionsStorage {
  async listConnectionsForResource(resourceId: number): Promise<ResourceSpecialistConnectionRow[]> {
    return db
      .select()
      .from(resourceSpecialistConnections)
      .where(eq(resourceSpecialistConnections.resourceId, resourceId));
  }

  async listConnectionsForResources(
    resourceIds: number[],
  ): Promise<ResourceSpecialistConnectionRow[]> {
    if (resourceIds.length === 0) return [];
    return db
      .select()
      .from(resourceSpecialistConnections)
      .where(inArray(resourceSpecialistConnections.resourceId, resourceIds));
  }

  async listResourceIdsForTarget(target: ConnectionTarget): Promise<number[]> {
    const rows = await db
      .select({ resourceId: resourceSpecialistConnections.resourceId })
      .from(resourceSpecialistConnections)
      .where(eq(resourceSpecialistConnections.target, target));
    return rows.map((r) => r.resourceId);
  }

  /**
   * Backfill `resource_specialist_connections` from the catalog-materialized
   * `specialist_assignments` table. Mirrors the one-shot seed that the
   * admin-resources-004 migration runs, but is safe to call repeatedly:
   *
   *   - INSERT … ON CONFLICT DO NOTHING means existing admin edits are
   *     untouched (the unique index on (resource_id, target) dedupes).
   *   - Rows whose `resource_id` is still null (catalog declarations whose
   *     slug hasn't been materialized into an admin_resources row yet) are
   *     skipped — they'll get materialized the next time this runs after
   *     someone creates the missing resource.
   *
   * Returns the number of NEW connection rows inserted (existing rows are
   * not counted) so callers can log meaningful boot/runtime telemetry.
   *
   * Note: this intentionally does NOT delete existing admin-set connections
   * even if the catalog no longer references them. Connection rows are
   * admin-editable; once seeded, they live on their own — removing them is
   * an explicit admin action via the Resources editor, not a catalog
   * side-effect.
   */
  async backfillConnectionsFromCatalog(): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO resource_specialist_connections (resource_id, target)
      SELECT DISTINCT sa.resource_id, 'specialist:' || sa.specialist_id
      FROM specialist_assignments sa
      WHERE sa.resource_id IS NOT NULL
      ON CONFLICT (resource_id, target) DO NOTHING
      RETURNING id
    `);
    return Array.isArray(result.rows) ? result.rows.length : 0;
  }

  /**
   * Replace the full set of connections for a single resource with the
   * provided target list. Idempotent: existing rows survive, missing rows
   * get inserted, removed targets get deleted. The whole thing runs in a
   * single transaction so the resource never appears partially-connected.
   */
  async replaceConnectionsForResource(
    resourceId: number,
    targets: ConnectionTarget[],
  ): Promise<ResourceSpecialistConnectionRow[]> {
    const unique = Array.from(new Set(targets));
    return db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(resourceSpecialistConnections)
        .where(eq(resourceSpecialistConnections.resourceId, resourceId));
      const existingTargets = new Set(existing.map((r) => r.target));
      const desiredTargets = new Set(unique);

      const toInsert = unique.filter((t) => !existingTargets.has(t));
      const toDelete = existing
        .filter((r) => !desiredTargets.has(r.target))
        .map((r) => r.target);

      if (toDelete.length > 0) {
        await tx
          .delete(resourceSpecialistConnections)
          .where(
            and(
              eq(resourceSpecialistConnections.resourceId, resourceId),
              inArray(resourceSpecialistConnections.target, toDelete),
            ),
          );
      }
      if (toInsert.length > 0) {
        await tx
          .insert(resourceSpecialistConnections)
          .values(toInsert.map((target) => ({ resourceId, target })))
          .onConflictDoNothing();
      }
      return tx
        .select()
        .from(resourceSpecialistConnections)
        .where(eq(resourceSpecialistConnections.resourceId, resourceId));
    });
  }
}
