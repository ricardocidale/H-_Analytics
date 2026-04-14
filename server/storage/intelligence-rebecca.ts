import {
  rebeccaConversations, rebeccaMessages, rebeccaEmails,
  rebeccaFeedback, rebeccaGuardrails,
  rebeccaKnowledgeBase, rebeccaKnowledgeHistory,
  type RebeccaConversation, type InsertRebeccaConversation,
  type RebeccaMessage, type InsertRebeccaMessage,
  type RebeccaEmail, type InsertRebeccaEmail,
  type RebeccaFeedback, type InsertRebeccaFeedback,
  type RebeccaGuardrail, type InsertRebeccaGuardrail,
  type RebeccaKBEntry, type InsertRebeccaKBEntry,
  type RebeccaKBHistory,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, gte, isNull, sql } from "drizzle-orm";

export class IntelligenceRebeccaStorage {

  async createRebeccaConversation(data: InsertRebeccaConversation): Promise<RebeccaConversation> {
    const [conv] = await db.insert(rebeccaConversations)
      .values(data as typeof rebeccaConversations.$inferInsert)
      .returning();
    return conv;
  }

  async getRebeccaConversation(conversationId: number): Promise<RebeccaConversation | undefined> {
    const [conv] = await db.select().from(rebeccaConversations)
      .where(eq(rebeccaConversations.id, conversationId))
      .limit(1);
    return conv;
  }

  async getOrCreateConversation(
    userId: number,
    contextType: string,
    contextKey: string | null,
    propertyId?: number | null,
    model?: string | null,
  ): Promise<RebeccaConversation> {
    const conditions = [
      eq(rebeccaConversations.userId, userId),
      eq(rebeccaConversations.contextType, contextType),
    ];
    if (contextKey) {
      conditions.push(eq(rebeccaConversations.contextKey, contextKey));
    } else {
      conditions.push(isNull(rebeccaConversations.contextKey));
    }
    if (propertyId) {
      conditions.push(eq(rebeccaConversations.propertyId, propertyId));
    }

    const existing = await db.select().from(rebeccaConversations)
      .where(and(...conditions))
      .orderBy(desc(rebeccaConversations.lastMessageAt))
      .limit(1);

    if (existing.length > 0) return existing[0];

    return this.createRebeccaConversation({
      userId,
      contextType,
      contextKey,
      propertyId: propertyId ?? undefined,
      model: model ?? undefined,
    });
  }

  async getRebeccaConversations(userId?: number): Promise<RebeccaConversation[]> {
    const q = db.select().from(rebeccaConversations)
      .orderBy(desc(rebeccaConversations.lastMessageAt));
    if (userId) return q.where(eq(rebeccaConversations.userId, userId));
    return q;
  }

  async updateRebeccaConversationModel(conversationId: number, model: string): Promise<void> {
    await db.update(rebeccaConversations)
      .set({ model })
      .where(eq(rebeccaConversations.id, conversationId));
  }

  async updateRebeccaConversationLanguage(conversationId: number, language: string): Promise<void> {
    await db.update(rebeccaConversations)
      .set({ language })
      .where(eq(rebeccaConversations.id, conversationId));
  }

  async addRebeccaMessage(data: InsertRebeccaMessage): Promise<RebeccaMessage> {
    const [msg] = await db.insert(rebeccaMessages)
      .values(data as typeof rebeccaMessages.$inferInsert)
      .returning();
    await db.update(rebeccaConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(rebeccaConversations.id, data.conversationId));
    return msg;
  }

  async getRebeccaMessages(conversationId: number, limit?: number): Promise<RebeccaMessage[]> {
    if (limit) {
      const rows = await db.select().from(rebeccaMessages)
        .where(eq(rebeccaMessages.conversationId, conversationId))
        .orderBy(desc(rebeccaMessages.createdAt))
        .limit(limit);
      return rows.reverse();
    }
    return db.select().from(rebeccaMessages)
      .where(eq(rebeccaMessages.conversationId, conversationId))
      .orderBy(rebeccaMessages.createdAt);
  }

  async getAllRebeccaMessageStats(): Promise<Array<{ conversationId: number; role: string; createdAt: Date; metadata: Record<string, unknown> | null }>> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db.select({
      conversationId: rebeccaMessages.conversationId,
      role: rebeccaMessages.role,
      createdAt: rebeccaMessages.createdAt,
      metadata: rebeccaMessages.metadata,
    }).from(rebeccaMessages)
      .where(gte(rebeccaMessages.createdAt, cutoff))
      .limit(10000);
    return rows;
  }

  async createRebeccaEmail(data: InsertRebeccaEmail): Promise<RebeccaEmail> {
    const [email] = await db.insert(rebeccaEmails)
      .values(data as typeof rebeccaEmails.$inferInsert)
      .returning();
    return email;
  }

  async createRebeccaFeedback(data: InsertRebeccaFeedback): Promise<RebeccaFeedback> {
    const [fb] = await db.insert(rebeccaFeedback)
      .values(data as typeof rebeccaFeedback.$inferInsert)
      .returning();
    return fb;
  }

  async getRebeccaFeedback(status?: string): Promise<RebeccaFeedback[]> {
    if (status) {
      return db.select().from(rebeccaFeedback)
        .where(eq(rebeccaFeedback.status, status))
        .orderBy(desc(rebeccaFeedback.createdAt));
    }
    return db.select().from(rebeccaFeedback).orderBy(desc(rebeccaFeedback.createdAt));
  }

  async updateRebeccaFeedbackStatus(feedbackId: number, status: string): Promise<RebeccaFeedback | undefined> {
    const [updated] = await db.update(rebeccaFeedback)
      .set({ status })
      .where(eq(rebeccaFeedback.id, feedbackId))
      .returning();
    return updated;
  }

  async getRebeccaGuardrails(): Promise<RebeccaGuardrail[]> {
    return db.select().from(rebeccaGuardrails).orderBy(rebeccaGuardrails.sortOrder);
  }

  async getActiveRebeccaGuardrails(): Promise<RebeccaGuardrail[]> {
    return db.select().from(rebeccaGuardrails)
      .where(eq(rebeccaGuardrails.isActive, true))
      .orderBy(rebeccaGuardrails.sortOrder);
  }

  async createRebeccaGuardrail(data: InsertRebeccaGuardrail): Promise<RebeccaGuardrail> {
    const [row] = await db.insert(rebeccaGuardrails)
      .values(data as typeof rebeccaGuardrails.$inferInsert)
      .returning();
    return row;
  }

  async updateRebeccaGuardrail(id: number, data: Partial<InsertRebeccaGuardrail>): Promise<RebeccaGuardrail | undefined> {
    const [row] = await db.update(rebeccaGuardrails)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rebeccaGuardrails.id, id))
      .returning();
    return row;
  }

  async deleteRebeccaGuardrail(id: number): Promise<boolean> {
    const result = await db.delete(rebeccaGuardrails)
      .where(eq(rebeccaGuardrails.id, id))
      .returning();
    return result.length > 0;
  }

  async getRebeccaKBEntries(category?: string): Promise<RebeccaKBEntry[]> {
    if (category && category !== "all") {
      return db.select().from(rebeccaKnowledgeBase)
        .where(eq(rebeccaKnowledgeBase.category, category))
        .orderBy(desc(rebeccaKnowledgeBase.priority), rebeccaKnowledgeBase.title);
    }
    return db.select().from(rebeccaKnowledgeBase)
      .orderBy(desc(rebeccaKnowledgeBase.priority), rebeccaKnowledgeBase.title);
  }

  async getActiveRebeccaKBEntries(): Promise<RebeccaKBEntry[]> {
    return db.select().from(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.isActive, true))
      .orderBy(desc(rebeccaKnowledgeBase.priority), rebeccaKnowledgeBase.title);
  }

  async getRebeccaKBEntry(id: number): Promise<RebeccaKBEntry | undefined> {
    const [row] = await db.select().from(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.id, id)).limit(1);
    return row;
  }

  async createRebeccaKBEntry(data: InsertRebeccaKBEntry): Promise<RebeccaKBEntry> {
    const [row] = await db.insert(rebeccaKnowledgeBase)
      .values(data as typeof rebeccaKnowledgeBase.$inferInsert)
      .returning();
    return row;
  }

  async updateRebeccaKBEntry(id: number, data: Partial<InsertRebeccaKBEntry>, changedBy?: string): Promise<RebeccaKBEntry | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(rebeccaKnowledgeBase)
        .where(eq(rebeccaKnowledgeBase.id, id)).limit(1);
      if (!existing) return undefined;

      await tx.insert(rebeccaKnowledgeHistory).values({
        entryId: id,
        snapshot: {
          title: existing.title,
          content: existing.content,
          category: existing.category,
          source: existing.source,
          tags: existing.tags,
          priority: existing.priority,
          isActive: existing.isActive,
        },
        changedBy: changedBy ?? null,
      } as typeof rebeccaKnowledgeHistory.$inferInsert);

      const [updated] = await tx.update(rebeccaKnowledgeBase)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(rebeccaKnowledgeBase.id, id))
        .returning();
      return updated;
    });
  }

  async deleteRebeccaKBEntry(id: number): Promise<boolean> {
    const result = await db.delete(rebeccaKnowledgeBase)
      .where(eq(rebeccaKnowledgeBase.id, id))
      .returning();
    return result.length > 0;
  }

  async getRebeccaKBHistory(entryId: number): Promise<RebeccaKBHistory[]> {
    return db.select().from(rebeccaKnowledgeHistory)
      .where(eq(rebeccaKnowledgeHistory.entryId, entryId))
      .orderBy(desc(rebeccaKnowledgeHistory.createdAt));
  }

  async rollbackRebeccaKBEntry(entryId: number, historyId: number, changedBy?: string): Promise<RebeccaKBEntry | undefined> {
    const [historyRow] = await db.select().from(rebeccaKnowledgeHistory)
      .where(and(eq(rebeccaKnowledgeHistory.id, historyId), eq(rebeccaKnowledgeHistory.entryId, entryId)))
      .limit(1);
    if (!historyRow) return undefined;

    const snap = historyRow.snapshot as Record<string, unknown>;
    return this.updateRebeccaKBEntry(entryId, {
      title: snap.title as string,
      content: snap.content as string,
      category: snap.category as string,
      source: snap.source as string,
      tags: snap.tags as string[],
      priority: snap.priority as number,
      isActive: snap.isActive as boolean,
    }, changedBy);
  }

  async getRebeccaKBStats(): Promise<{ total: number; active: number; byCategory: Record<string, number> }> {
    const rows = await db.execute(sql`
      SELECT category, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_active)::int AS active_count
      FROM rebecca_knowledge_base GROUP BY category
    `);
    const byCategory: Record<string, number> = {};
    let total = 0;
    let active = 0;
    for (const row of (rows.rows ?? []) as { category: string; count: number; active_count: number }[]) {
      byCategory[row.category] = row.count;
      total += row.count;
      active += row.active_count;
    }
    return { total, active, byCategory };
  }
}
