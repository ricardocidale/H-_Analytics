import {
  assumptionGuidance, guidanceDecisions, assumptionChangeLog, assumptionAcknowledgments,
  type AssumptionGuidance, type InsertAssumptionGuidance,
  type GuidanceDecision, type InsertGuidanceDecision,
  type AssumptionChangeLog, type InsertAssumptionChangeLog,
  type AssumptionAcknowledgment, type InsertAssumptionAcknowledgment,
} from "@workspace/db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import type { IntelligenceTx } from "./tx";

/**
 * ProposalsStorage — assumption guidance / decisions / change-log /
 * acknowledgments. These tables together back the "Analyst proposes,
 * user accepts or overrides" loop on the Assumptions surfaces.
 *
 * Methods take/return only Drizzle-typed rows and stay agnostic of the
 * surrounding HTTP/route layer; the orchestrator binds them onto the
 * public storage facade so callers see no shape change.
 */
export class ProposalsStorage {
  private readonly _ptx: IntelligenceTx;
  constructor(tx: IntelligenceTx) { this._ptx = tx; }

  async getAssumptionGuidance(scenarioId: number | null, entityType: string, entityId: number): Promise<AssumptionGuidance[]> {
    return this._ptx.db.select().from(assumptionGuidance)
      .where(and(
        scenarioId != null
          ? eq(assumptionGuidance.scenarioId, scenarioId)
          : isNull(assumptionGuidance.scenarioId),
        eq(assumptionGuidance.entityType, entityType),
        eq(assumptionGuidance.entityId, entityId),
      ))
      .orderBy(assumptionGuidance.assumptionKey);
  }

  async getAllAssumptionGuidance(): Promise<AssumptionGuidance[]> {
    return this._ptx.db.select().from(assumptionGuidance)
      .orderBy(assumptionGuidance.entityType, assumptionGuidance.entityId, assumptionGuidance.assumptionKey);
  }

  async getAllAssumptionGuidanceForScenario(scenarioId: number | null): Promise<AssumptionGuidance[]> {
    return this._ptx.db.select().from(assumptionGuidance)
      .where(
        scenarioId != null
          ? eq(assumptionGuidance.scenarioId, scenarioId)
          : isNull(assumptionGuidance.scenarioId),
      )
      .orderBy(assumptionGuidance.entityType, assumptionGuidance.entityId, assumptionGuidance.assumptionKey);
  }

  async upsertAssumptionGuidance(data: InsertAssumptionGuidance): Promise<AssumptionGuidance> {
    const conditions = [
      eq(assumptionGuidance.entityType, data.entityType),
      eq(assumptionGuidance.entityId, data.entityId),
      eq(assumptionGuidance.assumptionKey, data.assumptionKey),
      data.scenarioId
        ? eq(assumptionGuidance.scenarioId, data.scenarioId)
        : isNull(assumptionGuidance.scenarioId),
    ];

    return this._ptx.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(assumptionGuidance).where(and(...conditions)).limit(1);
      if (existing) {
        const [updated] = await tx.update(assumptionGuidance)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(assumptionGuidance.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(assumptionGuidance)
        .values(data as typeof assumptionGuidance.$inferInsert)
        .returning();
      return inserted;
    });
  }

  /**
   * Phase 5C-task-2/3 — mark all active (non-superseded) guidance rows for
   * this entity as superseded. Called from property + global-assumption save
   * routes when a material input key changes. One UPDATE, no per-row loop.
   * Idempotent: rows already superseded are filtered out by the IS NULL guard.
   */
  async markAssumptionGuidanceSuperseded(
    entityType: string,
    entityId: number,
    scenarioId: number | null,
  ): Promise<number> {
    const conditions = [
      eq(assumptionGuidance.entityType, entityType),
      eq(assumptionGuidance.entityId, entityId),
      scenarioId != null
        ? eq(assumptionGuidance.scenarioId, scenarioId)
        : isNull(assumptionGuidance.scenarioId),
      isNull(assumptionGuidance.supersededAt),
    ];
    const rows = await this._ptx.db
      .update(assumptionGuidance)
      .set({ supersededAt: sql`now()` })
      .where(and(...conditions))
      .returning({ id: assumptionGuidance.id });
    return rows.length;
  }

  async getAssumptionGuidanceById(id: number): Promise<AssumptionGuidance | undefined> {
    const [row] = await this._ptx.db.select().from(assumptionGuidance)
      .where(eq(assumptionGuidance.id, id))
      .limit(1);
    return row;
  }

  async createGuidanceDecision(data: InsertGuidanceDecision): Promise<GuidanceDecision> {
    const [decision] = await this._ptx.db.insert(guidanceDecisions)
      .values(data as typeof guidanceDecisions.$inferInsert)
      .returning();
    return decision;
  }

  async getGuidanceDecisions(guidanceId: number): Promise<GuidanceDecision[]> {
    return this._ptx.db.select().from(guidanceDecisions)
      .where(eq(guidanceDecisions.assumptionGuidanceId, guidanceId))
      .orderBy(desc(guidanceDecisions.createdAt));
  }

  // ── Assumption Change Log ────────────────────────────────────────

  async logAssumptionChange(data: InsertAssumptionChangeLog): Promise<AssumptionChangeLog> {
    const [row] = await this._ptx.db.insert(assumptionChangeLog)
      .values(data as typeof assumptionChangeLog.$inferInsert)
      .returning();
    return row;
  }

  async logAssumptionChanges(entries: InsertAssumptionChangeLog[]): Promise<void> {
    if (entries.length === 0) return;
    await this._ptx.db.insert(assumptionChangeLog)
      .values(entries as Array<typeof assumptionChangeLog.$inferInsert>);
  }

  async getAssumptionHistory(entityType: string, entityId: number, fieldName?: string): Promise<AssumptionChangeLog[]> {
    const conditions = [
      eq(assumptionChangeLog.entityType, entityType),
      eq(assumptionChangeLog.entityId, entityId),
    ];
    if (fieldName) conditions.push(eq(assumptionChangeLog.fieldName, fieldName));
    return this._ptx.db.select().from(assumptionChangeLog)
      .where(and(...conditions))
      .orderBy(desc(assumptionChangeLog.createdAt));
  }

  async getUnvalidatedAssumptions(entityType: string): Promise<AssumptionChangeLog[]> {
    // Fields set by seed that were never updated by analyst or manual override
    return this._ptx.db.select().from(assumptionChangeLog)
      .where(and(
        eq(assumptionChangeLog.entityType, entityType),
        eq(assumptionChangeLog.changeSource, "seed"),
      ))
      .orderBy(assumptionChangeLog.entityId, assumptionChangeLog.fieldName);
  }

  // ── Assumption Acknowledgments (Keep my value memory) ─────────
  // Returns the single ack row (if any) for the given entity+field tuple.
  // Used by the warning generator to suppress re-flagging an override that
  // is still inside its acknowledged window.
  async getAcknowledgment(
    entityType: string,
    entityId: number,
    fieldName: string,
    userId: number,
  ): Promise<AssumptionAcknowledgment | undefined> {
    const [row] = await this._ptx.db.select().from(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.fieldName, fieldName),
        eq(assumptionAcknowledgments.userId, userId),
      ))
      .limit(1);
    return row;
  }

  async listAcknowledgments(
    entityType: string,
    entityId: number,
    userId: number,
  ): Promise<AssumptionAcknowledgment[]> {
    return this._ptx.db.select().from(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.userId, userId),
      ));
  }

  // Upsert keyed on (entityType, entityId, fieldName, userId) — the unique
  // constraint. A second "Keep my value" on the same field by the same user
  // replaces the prior snapshot (new value or fresher recommended range).
  // Different users do NOT collide — each maintains their own ack state.
  async upsertAcknowledgment(
    data: InsertAssumptionAcknowledgment,
  ): Promise<AssumptionAcknowledgment> {
    const [row] = await this._ptx.db.insert(assumptionAcknowledgments)
      .values(data as typeof assumptionAcknowledgments.$inferInsert)
      .onConflictDoUpdate({
        target: [
          assumptionAcknowledgments.entityType,
          assumptionAcknowledgments.entityId,
          assumptionAcknowledgments.fieldName,
          assumptionAcknowledgments.userId,
        ],
        set: {
          valueAtAck: data.valueAtAck,
          rangeLowAtAck: data.rangeLowAtAck,
          rangeHighAtAck: data.rangeHighAtAck,
          ackedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  /**
   * Hard-delete a single assumption_guidance row by primary key.
   * Used by agent-side cleanup tools so stale/superseded guidance records
   * can be pruned without leaving orphan rows after a bulk supersede pass.
   */
  async deleteAssumptionGuidance(id: number): Promise<void> {
    await this._ptx.db
      .delete(assumptionGuidance)
      .where(eq(assumptionGuidance.id, id));
  }

  async deleteAcknowledgment(
    entityType: string,
    entityId: number,
    fieldName: string,
    userId: number,
  ): Promise<void> {
    await this._ptx.db.delete(assumptionAcknowledgments)
      .where(and(
        eq(assumptionAcknowledgments.entityType, entityType),
        eq(assumptionAcknowledgments.entityId, entityId),
        eq(assumptionAcknowledgments.fieldName, fieldName),
        eq(assumptionAcknowledgments.userId, userId),
      ));
  }
}
