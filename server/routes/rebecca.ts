import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { logger } from "../logger";

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

      logger.info(`Rebecca email sent to ${recipientEmail} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, emailId: email.id });
    } catch (err) {
      logger.error(`Failed to send Rebecca email: ${(err as Error).message}`, "rebecca");
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

      logger.info(`Rebecca feedback submitted: ${category} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, feedbackId: feedback.id });
    } catch (err) {
      logger.error(`Failed to store Rebecca feedback: ${(err as Error).message}`, "rebecca");
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/rebecca/conversations", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const conversations = await storage.getRebeccaConversations();
      return res.json(conversations);
    } catch (err) {
      logger.error(`Failed to list Rebecca conversations: ${(err as Error).message}`, "rebecca");
      return res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  app.get("/api/rebecca/feedback", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const feedback = await storage.getRebeccaFeedback(status);
      return res.json(feedback);
    } catch (err) {
      logger.error(`Failed to list Rebecca feedback: ${(err as Error).message}`, "rebecca");
      return res.status(500).json({ error: "Failed to list feedback" });
    }
  });
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
