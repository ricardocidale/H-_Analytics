import { calculationAuditLogs, type CalcAuditLog, type InsertCalcAuditLog } from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, lt, count } from "drizzle-orm";

export interface ICalcAuditStorage {
  saveCalcAuditLog(data: InsertCalcAuditLog): Promise<CalcAuditLog>;
  getCalcAuditLogs(scenarioId: number, userId: number, propertyId?: number, limit?: number): Promise<Omit<CalcAuditLog, "logEntries">[]>;
  getCalcAuditLog(id: number, userId: number): Promise<CalcAuditLog | undefined>;
  updateCalcAuditLogNote(id: number, userId: number, stepIndex: number, note: string): Promise<CalcAuditLog | undefined>;
}

export class CalcAuditStorage implements ICalcAuditStorage {
  async saveCalcAuditLog(data: InsertCalcAuditLog): Promise<CalcAuditLog> {
    const [log] = await db
      .insert(calculationAuditLogs)
      .values(data as typeof calculationAuditLogs.$inferInsert)
      .returning();

    await this.pruneOldLogs(data.scenarioId, data.propertyId);
    return log;
  }

  async getCalcAuditLogs(
    scenarioId: number,
    userId: number,
    propertyId?: number,
    limit = 20,
  ): Promise<Omit<CalcAuditLog, "logEntries">[]> {
    const conditions = [
      eq(calculationAuditLogs.scenarioId, scenarioId),
      eq(calculationAuditLogs.userId, userId),
    ];
    if (propertyId !== undefined) {
      conditions.push(eq(calculationAuditLogs.propertyId, propertyId));
    }

    const rows = await db
      .select({
        id: calculationAuditLogs.id,
        scenarioId: calculationAuditLogs.scenarioId,
        propertyId: calculationAuditLogs.propertyId,
        userId: calculationAuditLogs.userId,
        computedAt: calculationAuditLogs.computedAt,
        engineVersion: calculationAuditLogs.engineVersion,
        inputHash: calculationAuditLogs.inputHash,
        outputHash: calculationAuditLogs.outputHash,
        auditOpinion: calculationAuditLogs.auditOpinion,
        durationMs: calculationAuditLogs.durationMs,
        totalSteps: calculationAuditLogs.totalSteps,
      })
      .from(calculationAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(calculationAuditLogs.computedAt))
      .limit(limit);

    return rows;
  }

  async getCalcAuditLog(id: number, userId: number): Promise<CalcAuditLog | undefined> {
    const [log] = await db
      .select()
      .from(calculationAuditLogs)
      .where(and(eq(calculationAuditLogs.id, id), eq(calculationAuditLogs.userId, userId)))
      .limit(1);
    return log;
  }

  async updateCalcAuditLogNote(
    id: number,
    userId: number,
    stepIndex: number,
    note: string,
  ): Promise<CalcAuditLog | undefined> {
    const log = await this.getCalcAuditLog(id, userId);
    if (!log) return undefined;

    const entries = [...log.logEntries];
    if (stepIndex < 0 || stepIndex >= entries.length) return undefined;

    entries[stepIndex] = { ...entries[stepIndex], note };

    const [updated] = await db
      .update(calculationAuditLogs)
      .set({ logEntries: entries })
      .where(eq(calculationAuditLogs.id, id))
      .returning();

    return updated;
  }

  private async pruneOldLogs(scenarioId: number, propertyId: number): Promise<void> {
    const conditions = and(
      eq(calculationAuditLogs.scenarioId, scenarioId),
      eq(calculationAuditLogs.propertyId, propertyId),
    );

    const [{ total }] = await db
      .select({ total: count() })
      .from(calculationAuditLogs)
      .where(conditions);

    if (total > 10) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await db
        .delete(calculationAuditLogs)
        .where(and(conditions, lt(calculationAuditLogs.computedAt, cutoff)));
    }
  }
}
