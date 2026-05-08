/**
 * SpecialistIdentityStorage — admin override for per-Specialist identity
 * (humanName + gender). The Specialist catalog supplies factory defaults;
 * an override row in `specialist_identity_overrides` wins when present.
 *
 * Audit trail lives in `specialist_identity_override_versions` — every
 * upsert/reset writes a snapshot of prior + next state inside the same
 * transaction so the SpecialistPage Identity tab can render an edit
 * history.
 *
 * Spec: Phase 3 task #453. Resolver semantics are implemented in
 * `engine/analyst/identity.ts::resolveSpecialistIdentity` — keep this
 * storage layer thin and let the engine helper compose the view so the
 * client and server agree on precedence.
 */
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import {
  specialistIdentityOverrides,
  specialistIdentityOverrideVersions,
  type SpecialistIdentityOverrideRow,
  type SpecialistIdentityOverrideVersionRow,
  type SpecialistGender,
} from "@workspace/db";

export interface IdentityOverrideRecord {
  specialistId: string;
  humanName: string | null;
  gender: SpecialistGender | null;
  updatedByUserId: number | null;
  updatedAt: Date;
}

export interface IdentityOverridePatchInput {
  humanName: string | null;
  gender: SpecialistGender | null;
}

function rowToRecord(r: SpecialistIdentityOverrideRow): IdentityOverrideRecord {
  return {
    specialistId: r.specialistId,
    humanName: r.humanName,
    gender: r.gender,
    updatedByUserId: r.updatedByUserId,
    updatedAt: r.updatedAt,
  };
}

export class SpecialistIdentityStorage {
  /** Read the override row for a single specialist; null if no override. */
  async getIdentityOverride(specialistId: string): Promise<IdentityOverrideRecord | null> {
    const [row] = await db
      .select()
      .from(specialistIdentityOverrides)
      .where(eq(specialistIdentityOverrides.specialistId, specialistId))
      .limit(1);
    return row ? rowToRecord(row) : null;
  }

  /** Bulk read — used by the catalog list view to resolve all 12 + Gustavo. */
  async listIdentityOverrides(): Promise<IdentityOverrideRecord[]> {
    const rows = await db.select().from(specialistIdentityOverrides);
    return rows.map(rowToRecord);
  }

  /**
   * Upsert the override row + write an audit snapshot in one transaction.
   * Returns the new override record. Either field may be null to clear that
   * field's override (catalog wins for that field).
   */
  async upsertIdentityOverride(
    specialistId: string,
    patch: IdentityOverridePatchInput,
    actorUserId: number | null,
    changeSummary?: string,
  ): Promise<IdentityOverrideRecord> {
    return db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(specialistIdentityOverrides)
        .where(eq(specialistIdentityOverrides.specialistId, specialistId))
        .limit(1);

      const now = new Date();
      let next: SpecialistIdentityOverrideRow;
      if (prior) {
        const [updated] = await tx
          .update(specialistIdentityOverrides)
          .set({
            humanName: patch.humanName,
            gender: patch.gender,
            updatedByUserId: actorUserId,
            updatedAt: now,
          })
          .where(eq(specialistIdentityOverrides.specialistId, specialistId))
          .returning();
        next = updated;
      } else {
        const [inserted] = await tx
          .insert(specialistIdentityOverrides)
          .values({
            specialistId,
            humanName: patch.humanName,
            gender: patch.gender,
            updatedByUserId: actorUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        next = inserted;
      }

      await tx.insert(specialistIdentityOverrideVersions).values({
        specialistId,
        action: "upsert",
        prevHumanName: prior?.humanName ?? null,
        prevGender: prior?.gender ?? null,
        nextHumanName: next.humanName,
        nextGender: next.gender,
        changeSummary: changeSummary ?? null,
        changedByUserId: actorUserId,
        changedAt: now,
      });

      return rowToRecord(next);
    });
  }

  /**
   * Delete the override row entirely (catalog wins for both fields) and
   * record a "reset" audit entry. Idempotent — calling reset when no
   * override exists is a no-op (still writes the audit row so the action
   * is traceable).
   */
  async resetIdentityOverride(
    specialistId: string,
    actorUserId: number | null,
    changeSummary?: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(specialistIdentityOverrides)
        .where(eq(specialistIdentityOverrides.specialistId, specialistId))
        .limit(1);

      await tx
        .delete(specialistIdentityOverrides)
        .where(eq(specialistIdentityOverrides.specialistId, specialistId));

      await tx.insert(specialistIdentityOverrideVersions).values({
        specialistId,
        action: "reset",
        prevHumanName: prior?.humanName ?? null,
        prevGender: prior?.gender ?? null,
        nextHumanName: null,
        nextGender: null,
        changeSummary: changeSummary ?? null,
        changedByUserId: actorUserId,
        changedAt: new Date(),
      });
    });
  }

  /** History — newest first, capped to 50 entries. */
  async listIdentityOverrideHistory(
    specialistId: string,
    limit = 50,
  ): Promise<SpecialistIdentityOverrideVersionRow[]> {
    return db
      .select()
      .from(specialistIdentityOverrideVersions)
      .where(eq(specialistIdentityOverrideVersions.specialistId, specialistId))
      .orderBy(desc(specialistIdentityOverrideVersions.changedAt))
      .limit(limit);
  }
}
