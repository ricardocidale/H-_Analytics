/**
 * Break-glass override storage (super-admin only at the route layer).
 *
 * Overrides are append-only: revoke sets revokedAt instead of deleting the
 * row so the audit trail is preserved.
 */
import { db } from "../../db";
import { desc, eq } from "drizzle-orm";
import {
  auditBreakGlassOverrides,
  type BreakGlassOverrideRow,
  type InsertBreakGlassOverride,
} from "@workspace/db";

export class AdminResourceBreakGlassStorage {
  async listBreakGlassOverrides(specialistId?: string): Promise<BreakGlassOverrideRow[]> {
    if (specialistId) {
      return db
        .select()
        .from(auditBreakGlassOverrides)
        .where(eq(auditBreakGlassOverrides.specialistId, specialistId))
        .orderBy(desc(auditBreakGlassOverrides.createdAt));
    }
    return db
      .select()
      .from(auditBreakGlassOverrides)
      .orderBy(desc(auditBreakGlassOverrides.createdAt));
  }

  async createBreakGlassOverride(
    data: InsertBreakGlassOverride,
  ): Promise<BreakGlassOverrideRow> {
    const [row] = await db
      .insert(auditBreakGlassOverrides)
      .values({
        specialistId: data.specialistId,
        assignmentKind: data.assignmentKind,
        assignmentSlug: data.assignmentSlug,
        assignmentRole: data.assignmentRole ?? null,
        overrideResourceId: data.overrideResourceId ?? null,
        reason: data.reason,
        expiresAt: data.expiresAt,
        createdByUserId: data.createdByUserId,
      })
      .returning();
    return row;
  }

  async revokeBreakGlassOverride(id: number, actorUserId: number): Promise<BreakGlassOverrideRow | undefined> {
    const [row] = await db
      .update(auditBreakGlassOverrides)
      .set({ revokedAt: new Date(), revokedByUserId: actorUserId })
      .where(eq(auditBreakGlassOverrides.id, id))
      .returning();
    return row || undefined;
  }
}
