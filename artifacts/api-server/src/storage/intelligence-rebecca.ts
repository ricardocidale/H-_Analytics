import {
  rebeccaConversations, rebeccaMessages, rebeccaEmails,
  rebeccaFeedback, rebeccaGuardrails,
  rebeccaKnowledgeBase, rebeccaKnowledgeHistory,
  rebeccaPreviewFixtures,
  rebeccaContextContractTurns,
  type RebeccaConversation, type InsertRebeccaConversation,
  type RebeccaMessage, type InsertRebeccaMessage,
  type RebeccaEmail, type InsertRebeccaEmail,
  type RebeccaFeedback, type InsertRebeccaFeedback,
  type RebeccaGuardrail, type InsertRebeccaGuardrail,
  type RebeccaKBEntry, type InsertRebeccaKBEntry,
  type RebeccaKBHistory,
  type RebeccaPreviewFixture, type InsertRebeccaPreviewFixture,
  type RebeccaFixtureReplaySummary,
} from "@workspace/db";
import { db } from "../db";
import { eq, and, desc, gte, isNull, sql } from "drizzle-orm";
import { containsLegacyUploadUrl, rewriteLegacyUploadsInText } from "../lib/canonical-asset-url";
import { logger } from "../logger";

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
    // Task #521 — pre-insert guard against re-introducing legacy
    // /objects/uploads/<uuid> URLs that 404 post R2 cutover. When a
    // canonical sink (property_photos row, sibling /api/media logo) owns
    // the same bytes, rewrite the fragment in place; otherwise leave the
    // content untouched so the reconcile script still flags it.
    let values: InsertRebeccaMessage = data;
    if (containsLegacyUploadUrl(data.content)) {
      try {
        const result = await rewriteLegacyUploadsInText(data.content);
        if (result.rewritten > 0) {
          logger.info(
            `Rewrote ${result.rewritten} legacy /objects/uploads URL(s) in rebecca_messages.content for conversation ${data.conversationId}`,
            "intelligence-rebecca",
          );
          values = { ...data, content: result.text };
        }
      } catch (err: unknown) {
        logger.warn(
          `addRebeccaMessage canonicalization failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
          "intelligence-rebecca",
        );
      }
    }
    const [msg] = await db.insert(rebeccaMessages)
      .values(values as typeof rebeccaMessages.$inferInsert)
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

  // ── Preview Fixtures (Task #538) ──────────────────────────────────────
  // Saved preview transcripts (settings snapshot + turns) used as
  // regression fixtures for Rebecca config changes.

  async listRebeccaPreviewFixtures(): Promise<RebeccaPreviewFixture[]> {
    return db.select().from(rebeccaPreviewFixtures)
      .orderBy(desc(rebeccaPreviewFixtures.createdAt));
  }

  async getRebeccaPreviewFixture(id: number): Promise<RebeccaPreviewFixture | undefined> {
    const [row] = await db.select().from(rebeccaPreviewFixtures)
      .where(eq(rebeccaPreviewFixtures.id, id)).limit(1);
    return row;
  }

  async getRebeccaPreviewFixtureByName(name: string): Promise<RebeccaPreviewFixture | undefined> {
    const [row] = await db.select().from(rebeccaPreviewFixtures)
      .where(eq(rebeccaPreviewFixtures.name, name)).limit(1);
    return row;
  }

  /**
   * Task #560 — overwrite the snapshotted contents of an existing fixture
   * (settings + turns + description + createdById) when the admin chose to
   * resolve an import name conflict by overwriting. Distinct from
   * `updateRebeccaPreviewFixture`, which only mutates name/description and
   * intentionally never touches the immutable snapshot fields.
   *
   * Replay tracking columns are reset since the imported snapshot is, by
   * definition, a brand-new baseline that hasn't been replayed yet.
   *
   * `expectedName` guards against the rename race: if another admin renames
   * the fixture between the by-name lookup and this update, the WHERE clause
   * matches zero rows and we return undefined instead of mutating the
   * (now wrong) target row. Caller treats undefined the same as "not found"
   * and reports a 409 to the user.
   */
  async replaceRebeccaPreviewFixtureContent(
    id: number,
    data: {
      description: string | null;
      settings: Record<string, unknown>;
      turns: typeof rebeccaPreviewFixtures.$inferSelect.turns;
      createdById: number | null;
      expectedName?: string;
    },
  ): Promise<RebeccaPreviewFixture | undefined> {
    const whereClause = data.expectedName !== undefined
      ? and(eq(rebeccaPreviewFixtures.id, id), eq(rebeccaPreviewFixtures.name, data.expectedName))
      : eq(rebeccaPreviewFixtures.id, id);
    const [row] = await db.update(rebeccaPreviewFixtures)
      .set({
        description: data.description,
        settings: data.settings,
        turns: data.turns,
        createdById: data.createdById,
        updatedAt: new Date(),
        lastReplayAt: null,
        lastReplayStatus: null,
        lastReplaySummary: null,
        lastReplayFingerprint: null,
      })
      .where(whereClause)
      .returning();
    return row;
  }

  async createRebeccaPreviewFixture(data: InsertRebeccaPreviewFixture): Promise<RebeccaPreviewFixture> {
    const [row] = await db.insert(rebeccaPreviewFixtures)
      .values(data as typeof rebeccaPreviewFixtures.$inferInsert)
      .returning();
    return row;
  }

  async updateRebeccaPreviewFixture(
    id: number,
    data: Partial<Pick<InsertRebeccaPreviewFixture, "name" | "description">>,
  ): Promise<RebeccaPreviewFixture | undefined> {
    const [row] = await db.update(rebeccaPreviewFixtures)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rebeccaPreviewFixtures.id, id))
      .returning();
    return row;
  }

  async deleteRebeccaPreviewFixture(id: number): Promise<boolean> {
    const result = await db.delete(rebeccaPreviewFixtures)
      .where(eq(rebeccaPreviewFixtures.id, id))
      .returning();
    return result.length > 0;
  }

  /**
   * Task #559 — persist the rolled-up outcome of one scheduled replay
   * cycle for a single fixture. Called from
   * `server/jobs/rebecca-fixture-replay.ts` after every replay attempt.
   *
   * `lastReplayFingerprint` is the per-cycle drift fingerprint (a stable
   * hash of the per-turn status shape). The scheduler uses it to suppress
   * repeat drift notifications: a second cycle with the same drift
   * fingerprint does not re-email admins. We always overwrite the column
   * — including with `null` when status is "pass" — so the next genuine
   * drift event is treated as fresh, not as a duplicate of an old one.
   */
  async recordRebeccaFixtureReplayResult(
    id: number,
    result: {
      lastReplayAt: Date;
      lastReplayStatus: "pass" | "drifted" | "errored" | "skipped";
      lastReplaySummary: RebeccaFixtureReplaySummary;
      lastReplayFingerprint: string | null;
    },
  ): Promise<RebeccaPreviewFixture | undefined> {
    const [row] = await db.update(rebeccaPreviewFixtures)
      .set({
        lastReplayAt: result.lastReplayAt,
        lastReplayStatus: result.lastReplayStatus,
        lastReplaySummary: result.lastReplaySummary,
        lastReplayFingerprint: result.lastReplayFingerprint,
      })
      .where(eq(rebeccaPreviewFixtures.id, id))
      .returning();
    return row;
  }

  async logRebeccaContextContractTurn(data: {
    conversationId?: number | null;
    messageId?: number | null;
    userId: number;
    contract: any;
  }): Promise<void> {
    try {
      await db.insert(rebeccaContextContractTurns)
        .values({
          conversationId: data.conversationId ?? null,
          messageId: data.messageId ?? null,
          userId: data.userId,
          contract: data.contract,
        } as typeof rebeccaContextContractTurns.$inferInsert);
    } catch (err) {
      logger.warn(
        `logRebeccaContextContractTurn failed: ${err instanceof Error ? err.message : String(err)}`,
        "intelligence-rebecca"
      );
    }
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
