/**
 * CRUD methods for the admin_resources table.
 *
 * Every edit (create, update) writes the resulting row to
 * admin_resource_versions inside the same transaction so the version log
 * never lags the live row. `secret_ref` is a key-name (not a value), so it is
 * safe to include in the version snapshot.
 */
import { db } from "../../db";
import { and, eq } from "drizzle-orm";
import {
  adminResources,
  adminResourceVersions,
  type AdminResourceRow,
  type InsertAdminResource,
  type ResourceKind,
} from "@workspace/db";
import type { UpdateAdminResourcePatch } from "./types";

export class AdminResourceCrudStorage {
  async listAdminResources(kind?: ResourceKind): Promise<AdminResourceRow[]> {
    if (kind) {
      return db.select().from(adminResources).where(eq(adminResources.kind, kind)).orderBy(adminResources.slug);
    }
    return db.select().from(adminResources).orderBy(adminResources.kind, adminResources.slug);
  }

  async getAdminResourceById(id: number): Promise<AdminResourceRow | undefined> {
    const [row] = await db.select().from(adminResources).where(eq(adminResources.id, id));
    return row || undefined;
  }

  async getAdminResourceBySlug(kind: ResourceKind, slug: string): Promise<AdminResourceRow | undefined> {
    const [row] = await db
      .select()
      .from(adminResources)
      .where(and(eq(adminResources.kind, kind), eq(adminResources.slug, slug)));
    return row || undefined;
  }

  async createAdminResource(
    data: InsertAdminResource,
    actorUserId: number,
  ): Promise<AdminResourceRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(adminResources)
        .values({
          kind: data.kind,
          slug: data.slug,
          displayName: data.displayName,
          description: data.description ?? null,
          config: data.config ?? {},
          secretRef: data.secretRef ?? null,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        })
        .returning();
      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: "created",
        changedByUserId: actorUserId,
      });
      return row;
    });
  }

  async updateAdminResource(
    id: number,
    patch: UpdateAdminResourcePatch,
    actorUserId: number,
  ): Promise<AdminResourceRow | undefined> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(adminResources).where(eq(adminResources.id, id));
      if (!current) return undefined;

      const nextVersion = current.version + 1;
      const updates: Partial<typeof adminResources.$inferInsert> = {
        version: nextVersion,
        updatedAt: new Date(),
        updatedByUserId: actorUserId,
      };
      if (patch.displayName !== undefined) updates.displayName = patch.displayName;
      if (patch.description !== undefined) updates.description = patch.description;
      if (patch.config !== undefined) updates.config = patch.config;
      if (patch.secretRef !== undefined) updates.secretRef = patch.secretRef;
      if (patch.selfTestIntervalDays !== undefined) updates.selfTestIntervalDays = patch.selfTestIntervalDays;

      const [row] = await tx
        .update(adminResources)
        .set(updates)
        .where(eq(adminResources.id, id))
        .returning();

      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: patch.changeSummary ?? "updated",
        changedByUserId: actorUserId,
      });
      return row;
    });
  }

  async deleteAdminResource(id: number): Promise<boolean> {
    // Explicitly clear the version log inside a transaction before deleting
    // the resource. The schema declares ON DELETE CASCADE on
    // admin_resource_versions.resource_id, but `drizzle-kit push` against a
    // fresh CI Postgres has been observed to create the FK without the
    // cascade clause — making the parent DELETE leave orphan version rows.
    // Doing the cascade in code makes the behaviour DDL-independent and
    // keeps the whole "delete resource + its history" operation atomic.
    return db.transaction(async (tx) => {
      await tx.delete(adminResourceVersions).where(eq(adminResourceVersions.resourceId, id));
      const result = await tx.delete(adminResources).where(eq(adminResources.id, id)).returning({ id: adminResources.id });
      return result.length > 0;
    });
  }
}
