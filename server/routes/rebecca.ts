import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { logger } from "../logger";
import { logActivity, parseRouteId } from "./helpers";
import { insertRebeccaGuardrailSchema, insertRebeccaKBSchema } from "@shared/schema";
import { upsertChunks, deleteVectors, vectorCount } from "../ai/pinecone-service";

const emailRequestSchema = z.object({
  conversationId: z.number().int().positive(),
  recipientEmail: z.string().email().max(320),
});

const feedbackRequestSchema = z.object({
  conversationId: z.number().int().positive(),
  category: z.enum(["incorrect", "unhelpful", "missing_data", "other"]),
  notes: z.string().max(2000).optional(),
  conversationContext: z.record(z.unknown()).optional(),
});

export function register(app: Express) {
  app.post("/api/rebecca/email", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = emailRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }

      const userId = getAuthUser(req).id;
      const { conversationId, recipientEmail } = parsed.data;

      const conv = await storage.getRebeccaConversation(conversationId);
      if (!conv || conv.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const dbMessages = await storage.getRebeccaMessages(conversationId);
      if (dbMessages.length === 0) {
        return res.status(400).json({ error: "No messages in conversation" });
      }

      const summary = dbMessages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n");

      const subject = `Rebecca AI Summary — ${conv.contextType} ${conv.contextKey ?? ""}`.trim();
      const htmlContent = buildEmailHtml(subject, summary);

      await sendNotificationEmail({
        to: recipientEmail,
        subject,
        title: subject,
        body: summary,
      });

      const email = await storage.createRebeccaEmail({
        conversationId,
        userId,
        recipientEmail,
        subject,
        htmlContent,
        status: "sent",
        sentAt: new Date(),
      });

      logActivity(req, "send-rebecca-email", "rebecca_conversation", conversationId, recipientEmail, { subject });
      logger.info(`Rebecca email sent to ${recipientEmail} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, emailId: email.id });
    } catch (err: unknown) {
      logger.error(`Failed to send Rebecca email: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.post("/api/rebecca/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = feedbackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }

      const userId = getAuthUser(req).id;
      const { conversationId, category, notes, conversationContext } = parsed.data;

      const conv = await storage.getRebeccaConversation(conversationId);
      if (!conv || conv.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const feedback = await storage.createRebeccaFeedback({
        conversationId,
        userId,
        category,
        notes: notes ?? null,
        conversationContext: conversationContext ?? null,
      });

      logActivity(req, "submit-rebecca-feedback", "rebecca_conversation", conversationId, category, { category, notes: notes?.slice(0, 100) });
      logger.info(`Rebecca feedback submitted: ${category} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, feedbackId: feedback.id });
    } catch (err: unknown) {
      logger.error(`Failed to store Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/rebecca/conversations", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const conversations = await storage.getRebeccaConversations();
      return res.json(conversations);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca conversations: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  app.get("/api/rebecca/conversations/:id/messages", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const conversationId = parseRouteId(req.params.id);
      if (!conversationId) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }
      const messages = await storage.getRebeccaMessages(conversationId);
      return res.json(messages);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca messages: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list messages" });
    }
  });

  app.get("/api/rebecca/feedback", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const feedback = await storage.getRebeccaFeedback(status);
      return res.json(feedback);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list feedback" });
    }
  });

  app.patch("/api/rebecca/feedback/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const feedbackId = parseRouteId(req.params.id);
      if (!feedbackId) {
        return res.status(400).json({ error: "Invalid feedback ID" });
      }
      const statusSchema = z.object({
        status: z.enum(["new", "reviewed", "resolved"]),
      });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status: " + parsed.error.issues[0]?.message });
      }
      const updated = await storage.updateRebeccaFeedbackStatus(feedbackId, parsed.data.status);
      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      logActivity(req, "update-rebecca-feedback", "rebecca_feedback", feedbackId, parsed.data.status);
      logger.info(`Rebecca feedback ${feedbackId} status updated to ${parsed.data.status}`, "rebecca");
      return res.json(updated);
    } catch (err: unknown) {
      logger.error(`Failed to update Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  app.get("/api/rebecca/guardrails", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const guardrails = await storage.getRebeccaGuardrails();
      return res.json(guardrails);
    } catch (err: unknown) {
      logger.error(`Failed to list guardrails: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list guardrails" });
    }
  });

  app.post("/api/rebecca/guardrails", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = insertRebeccaGuardrailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const guardrail = await storage.createRebeccaGuardrail(parsed.data);
      logActivity(req, "create-guardrail", "rebecca_guardrail", guardrail.id, guardrail.label);
      logger.info(`Rebecca guardrail created: ${guardrail.label}`, "rebecca");
      return res.json(guardrail);
    } catch (err: unknown) {
      logger.error(`Failed to create guardrail: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to create guardrail" });
    }
  });

  app.patch("/api/rebecca/guardrails/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid guardrail ID" });
      }
      const updateSchema = insertRebeccaGuardrailSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const updated = await storage.updateRebeccaGuardrail(id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Guardrail not found" });
      }
      logActivity(req, "update-guardrail", "rebecca_guardrail", id, updated.label);
      logger.info(`Rebecca guardrail ${id} updated`, "rebecca");
      return res.json(updated);
    } catch (err: unknown) {
      logger.error(`Failed to update guardrail: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to update guardrail" });
    }
  });

  app.delete("/api/rebecca/guardrails/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid guardrail ID" });
      }
      const deleted = await storage.deleteRebeccaGuardrail(id);
      if (!deleted) {
        return res.status(404).json({ error: "Guardrail not found" });
      }
      logActivity(req, "delete-guardrail", "rebecca_guardrail", id);
      logger.info(`Rebecca guardrail ${id} deleted`, "rebecca");
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error(`Failed to delete guardrail: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to delete guardrail" });
    }
  });

  app.get("/api/rebecca/kb", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const entries = await storage.getRebeccaKBEntries(category);
      return res.json(entries);
    } catch (err: unknown) {
      logger.error(`Failed to list KB entries: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list KB entries" });
    }
  });

  app.get("/api/rebecca/kb/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getRebeccaKBStats();
      let vectorCt = 0;
      try { vectorCt = await vectorCount("knowledge-base"); } catch (err: unknown) { logger.warn(`Failed to get Pinecone vector count: ${err instanceof Error ? err.message : String(err)}`, "rebecca"); }
      return res.json({ ...stats, vectorCount: vectorCt });
    } catch (err: unknown) {
      logger.error(`Failed to get KB stats: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to get KB stats" });
    }
  });

  app.post("/api/rebecca/kb", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = insertRebeccaKBSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const entry = await storage.createRebeccaKBEntry(parsed.data);
      syncKBEntryToPinecone(entry.id, entry.title, entry.content, entry.category);
      logActivity(req, "create-kb-entry", "rebecca_kb", entry.id, entry.title, { category: entry.category });
      logger.info(`KB entry created: ${entry.title}`, "rebecca");
      return res.json(entry);
    } catch (err: unknown) {
      logger.error(`Failed to create KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to create KB entry" });
    }
  });

  app.patch("/api/rebecca/kb/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid KB entry ID" });

      const updateSchema = insertRebeccaKBSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const user = getAuthUser(req);
      const updated = await storage.updateRebeccaKBEntry(id, parsed.data, user.email);
      if (!updated) return res.status(404).json({ error: "KB entry not found" });

      if (updated.isActive) {
        syncKBEntryToPinecone(updated.id, updated.title, updated.content, updated.category);
      } else {
        deleteVectors("knowledge-base", [`admin-kb:${updated.id}`]).catch(e =>
          logger.warn(`Pinecone delete failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
        );
      }
      logActivity(req, "update-kb-entry", "rebecca_kb", id, updated.title, { category: updated.category });
      logger.info(`KB entry ${id} updated by ${user.email}`, "rebecca");
      return res.json(updated);
    } catch (err: unknown) {
      logger.error(`Failed to update KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to update KB entry" });
    }
  });

  app.delete("/api/rebecca/kb/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid KB entry ID" });

      const deleted = await storage.deleteRebeccaKBEntry(id);
      if (!deleted) return res.status(404).json({ error: "KB entry not found" });

      deleteVectors("knowledge-base", [`admin-kb:${id}`]).catch(e =>
        logger.warn(`Pinecone delete failed for KB ${id}: ${e instanceof Error ? e.message : e}`, "rebecca")
      );
      logActivity(req, "delete-kb-entry", "rebecca_kb", id);
      logger.info(`KB entry ${id} deleted`, "rebecca");
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error(`Failed to delete KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to delete KB entry" });
    }
  });

  app.get("/api/rebecca/kb/:id/history", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const entryId = parseRouteId(req.params.id);
      if (!entryId) return res.status(400).json({ error: "Invalid KB entry ID" });

      const history = await storage.getRebeccaKBHistory(entryId);
      return res.json(history);
    } catch (err: unknown) {
      logger.error(`Failed to get KB history: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to get KB history" });
    }
  });

  app.post("/api/rebecca/kb/:id/rollback/:historyId", requireAuth, requireAdmin, async (req: Request<{ id: string; historyId: string }>, res: Response) => {
    try {
      const entryId = parseRouteId(req.params.id);
      const historyId = parseRouteId(req.params.historyId);
      if (!entryId || !historyId) return res.status(400).json({ error: "Invalid IDs" });

      const user = getAuthUser(req);
      const restored = await storage.rollbackRebeccaKBEntry(entryId, historyId, user.email);
      if (!restored) return res.status(404).json({ error: "History entry not found" });

      if (restored.isActive) {
        syncKBEntryToPinecone(restored.id, restored.title, restored.content, restored.category);
      } else {
        deleteVectors("knowledge-base", [`admin-kb:${restored.id}`]).catch(e =>
          logger.warn(`Pinecone delete failed for KB ${restored.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
        );
      }
      logActivity(req, "rollback-kb-entry", "rebecca_kb", entryId, restored.title, { historyId });
      logger.info(`KB entry ${entryId} rolled back to history ${historyId} by ${user.email}`, "rebecca");
      return res.json(restored);
    } catch (err: unknown) {
      logger.error(`Failed to rollback KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to rollback KB entry" });
    }
  });

  app.get("/api/rebecca/analytics", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [conversations, allMessages] = await Promise.all([
        storage.getRebeccaConversations(),
        storage.getAllRebeccaMessageStats(),
      ]);

      const totalConversations = conversations.length;
      const totalMessages = allMessages.length;
      const uniqueUsers = new Set(conversations.map(c => c.userId)).size;

      const turnsPerConv: Record<number, number> = {};
      for (const m of allMessages) {
        turnsPerConv[m.conversationId] = (turnsPerConv[m.conversationId] ?? 0) + 1;
      }
      const turnCounts = Object.values(turnsPerConv).sort((a, b) => a - b);
      const avgTurnsPerConversation = turnCounts.length > 0
        ? Math.round((turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length) * 10) / 10
        : 0;
      const medianTurns = turnCounts.length > 0
        ? turnCounts.length % 2 === 0
          ? (turnCounts[turnCounts.length / 2 - 1] + turnCounts[turnCounts.length / 2]) / 2
          : turnCounts[Math.floor(turnCounts.length / 2)]
        : 0;

      const singleTurnCount = turnCounts.filter(t => t <= 2).length;
      const deepCount = turnCounts.filter(t => t >= 5).length;
      const singleTurnRate = totalConversations > 0 ? Math.round((singleTurnCount / totalConversations) * 100) : 0;
      const deepConversationRate = totalConversations > 0 ? Math.round((deepCount / totalConversations) * 100) : 0;

      const contextBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const ct = c.contextType ?? "general";
        contextBreakdown[ct] = (contextBreakdown[ct] ?? 0) + 1;
      }

      const modelBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const m = c.model ?? "unknown";
        modelBreakdown[m] = (modelBreakdown[m] ?? 0) + 1;
      }

      const responseModeBreakdown: Record<string, number> = {};
      for (const m of allMessages) {
        if (m.role === "assistant" && m.metadata) {
          const mode = String((m.metadata as Record<string, unknown>).responseMode ?? "standard");
          responseModeBreakdown[mode] = (responseModeBreakdown[mode] ?? 0) + 1;
        }
      }

      const topicBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const topic = c.contextType ?? "general";
        topicBreakdown[topic] = (topicBreakdown[topic] ?? 0) + 1;
      }

      const languageBreakdown: Record<string, number> = {};
      for (const m of allMessages) {
        if (m.role === "user" && m.metadata) {
          const lang = String((m.metadata as Record<string, unknown>).language ?? "en");
          languageBreakdown[lang] = (languageBreakdown[lang] ?? 0) + 1;
        } else if (m.role === "user") {
          languageBreakdown["en"] = (languageBreakdown["en"] ?? 0) + 1;
        }
      }

      const dailyVolumes: Record<string, { conversations: number; messages: number }> = {};
      for (const c of conversations) {
        const day = new Date(c.startedAt).toISOString().slice(0, 10);
        if (!dailyVolumes[day]) dailyVolumes[day] = { conversations: 0, messages: 0 };
        dailyVolumes[day].conversations++;
      }
      for (const m of allMessages) {
        const day = new Date(m.createdAt).toISOString().slice(0, 10);
        if (!dailyVolumes[day]) dailyVolumes[day] = { conversations: 0, messages: 0 };
        dailyVolumes[day].messages++;
      }

      const sortedDays = Object.entries(dailyVolumes)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, data]) => ({ date, ...data }));

      const feedback = await storage.getRebeccaFeedback();
      const feedbackByCategory: Record<string, number> = {};
      for (const f of feedback) {
        feedbackByCategory[f.category] = (feedbackByCategory[f.category] ?? 0) + 1;
      }

      res.json({
        totalConversations,
        totalMessages,
        uniqueUsers,
        avgTurnsPerConversation,
        medianTurns,
        singleTurnRate,
        deepConversationRate,
        contextBreakdown,
        topicBreakdown,
        languageBreakdown,
        modelBreakdown,
        responseModeBreakdown,
        dailyVolumes: sortedDays,
        feedbackBreakdown: feedbackByCategory,
        totalFeedback: feedback.length,
      });
    } catch (err: unknown) {
      logger.error(`Failed to compute analytics: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });
}

function syncKBEntryToPinecone(entryId: number, title: string, content: string, category: string) {
  upsertChunks("knowledge-base", [{
    id: `admin-kb:${entryId}`,
    text: `${title}\n\n${content}`,
    metadata: { title, content: content.slice(0, 3_000), source: "admin-kb", category },
  }]).catch(e =>
    logger.warn(`Pinecone sync failed for KB ${entryId}: ${e instanceof Error ? e.message : e}`, "rebecca")
  );
}

function buildEmailHtml(subject: string, summary: string): string {
  const paragraphs = summary.split("\n").filter(Boolean).map(p => `<p>${p}</p>`).join("");
  return `<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a1a2e; margin-bottom: 16px;">${subject}</h2>
    <div style="color: #333; line-height: 1.6;">${paragraphs}</div>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e5e5;" />
    <p style="color: #888; font-size: 12px;">Generated by Rebecca AI Analytics</p>
  </div>`;
}
