/**
 * Specialist → Resource impact + idempotent catalog sync.
 *
 * `listResourceImpact` and `listSpecialistAssignments` are pure reads.
 * `syncSpecialistCatalog` materializes a code-side declaration list into
 * the specialist_assignments table: insert new declarations, update those
 * whose required-flag or resource binding changed, and remove rows the
 * catalog no longer declares. Slugs that don't yet resolve to an
 * admin_resources row are still inserted (with resourceId=null) so the
 * declaration is preserved; the unresolved count is returned for callers
 * to surface.
 */
import { db } from "../../db";
import { and, eq } from "drizzle-orm";
import {
  adminResources,
  specialistAssignments,
  type SpecialistAssignmentRow,
} from "@shared/schema";
import type { CatalogSyncDeclaration, CatalogSyncResult, ResourceImpactEntry } from "./types";

function declKey(specialistId: string, kind: string, slug: string, role: string | null): string {
  return `${specialistId}|${kind}|${slug}|${role ?? ""}`;
}

export class AdminResourceAssignmentsStorage {
  async listResourceImpact(resourceId: number): Promise<ResourceImpactEntry[]> {
    const rows = await db
      .select()
      .from(specialistAssignments)
      .where(eq(specialistAssignments.resourceId, resourceId));
    return rows.map((r) => ({
      specialistId: r.specialistId,
      assignmentKind: r.assignmentKind,
      assignmentSlug: r.assignmentSlug,
      assignmentRole: r.assignmentRole,
      required: r.required,
    }));
  }

  async listSpecialistAssignments(specialistId?: string): Promise<SpecialistAssignmentRow[]> {
    if (specialistId) {
      return db
        .select()
        .from(specialistAssignments)
        .where(eq(specialistAssignments.specialistId, specialistId))
        .orderBy(specialistAssignments.assignmentKind, specialistAssignments.assignmentSlug);
    }
    return db
      .select()
      .from(specialistAssignments)
      .orderBy(specialistAssignments.specialistId, specialistAssignments.assignmentKind);
  }

  async syncSpecialistCatalog(
    declarations: CatalogSyncDeclaration[],
  ): Promise<CatalogSyncResult> {
    return db.transaction(async (tx) => {
      const existing = await tx.select().from(specialistAssignments);
      const existingByKey = new Map<string, SpecialistAssignmentRow>();
      for (const row of existing) {
        existingByKey.set(declKey(row.specialistId, row.assignmentKind, row.assignmentSlug, row.assignmentRole), row);
      }

      // Resolve slugs to resource ids in one pass per (kind, slug) pair.
      const resourceLookupCache = new Map<string, number | null>();
      const resolveResourceId = async (kind: string, slug: string): Promise<number | null> => {
        const cacheKey = `${kind}:${slug}`;
        if (resourceLookupCache.has(cacheKey)) return resourceLookupCache.get(cacheKey)!;
        const [r] = await tx
          .select({ id: adminResources.id })
          .from(adminResources)
          .where(and(eq(adminResources.kind, kind), eq(adminResources.slug, slug)));
        const id = r?.id ?? null;
        resourceLookupCache.set(cacheKey, id);
        return id;
      };

      const wantKeys = new Set<string>();
      let inserted = 0;
      let updated = 0;
      let unresolvedSlugs = 0;

      for (const decl of declarations) {
        const role = decl.assignmentRole ?? null;
        const key = declKey(decl.specialistId, decl.assignmentKind, decl.assignmentSlug, role);
        wantKeys.add(key);

        const resourceId = await resolveResourceId(decl.assignmentKind, decl.assignmentSlug);
        if (resourceId === null) unresolvedSlugs++;

        const prev = existingByKey.get(key);
        if (!prev) {
          await tx.insert(specialistAssignments).values({
            specialistId: decl.specialistId,
            assignmentKind: decl.assignmentKind,
            assignmentSlug: decl.assignmentSlug,
            assignmentRole: role,
            required: decl.required,
            resourceId,
          });
          inserted++;
        } else if (
          prev.required !== decl.required ||
          prev.resourceId !== resourceId
        ) {
          await tx
            .update(specialistAssignments)
            .set({ required: decl.required, resourceId, materializedAt: new Date() })
            .where(eq(specialistAssignments.id, prev.id));
          updated++;
        }
      }

      // Remove rows the catalog no longer declares.
      let removed = 0;
      for (const entry of Array.from(existingByKey.entries())) {
        const [key, row] = entry;
        if (!wantKeys.has(key)) {
          await tx.delete(specialistAssignments).where(eq(specialistAssignments.id, row.id));
          removed++;
        }
      }

      return { inserted, updated, removed, unresolvedSlugs };
    });
  }
}
