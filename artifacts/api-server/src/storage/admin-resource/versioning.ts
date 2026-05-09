/**
 * Versioning + rollback for admin_resources.
 *
 * History is append-only: a rollback re-applies a past version's content as
 * a NEW version (current version + 1) rather than mutating earlier rows.
 * This keeps the audit trail strictly forward-only so it can be reasoned
 * about as a single-writer log.
 */
import { db } from "../../db";
import { and, desc, eq } from "drizzle-orm";
import {
  adminResources,
  adminResourceVersions,
  type AdminResourceRow,
  type AdminResourceVersionRow,
} from "@workspace/db";

export class AdminResourceVersioningStorage {
  async listAdminResourceVersions(resourceId: number): Promise<AdminResourceVersionRow[]> {
    return db
      .select()
      .from(adminResourceVersions)
      .where(eq(adminResourceVersions.resourceId, resourceId))
      .orderBy(desc(adminResourceVersions.version));
  }

  async getAdminResourceVersion(
    resourceId: number,
    version: number,
  ): Promise<AdminResourceVersionRow | undefined> {
    const [row] = await db
      .select()
      .from(adminResourceVersions)
      .where(and(eq(adminResourceVersions.resourceId, resourceId), eq(adminResourceVersions.version, version)));
    return row ?? undefined;
  }

  async rollbackAdminResource(
    id: number,
    targetVersion: number,
    actorUserId: number,
  ): Promise<AdminResourceRow | undefined> {
    return db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(adminResourceVersions)
        .where(and(eq(adminResourceVersions.resourceId, id), eq(adminResourceVersions.version, targetVersion)));
      if (!target) return undefined;

      const [current] = await tx.select().from(adminResources).where(eq(adminResources.id, id));
      if (!current) return undefined;

      const nextVersion = current.version + 1;
      const [row] = await tx
        .update(adminResources)
        .set({
          version: nextVersion,
          displayName: target.displayName,
          description: target.description,
          config: target.config ?? {},
          secretRef: target.secretRef,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
        })
        .where(eq(adminResources.id, id))
        .returning();

      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: `rollback to v${targetVersion}`,
        changedByUserId: actorUserId,
      });
      return row;
    });
  }
}
