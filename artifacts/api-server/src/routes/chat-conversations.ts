import { type Express, type Request, type Response } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import { logger } from "../logger";
import { parseRouteId } from "./helpers";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@shared/constants";

export function registerConversationRoutes(app: Express) {
  app.get("/api/chat/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUser(req).id;
      const conversations = await storage.getRebeccaConversations(userId);
      res.json(
        conversations.map((c) => ({
          id: c.id,
          contextType: c.contextType,
          contextKey: c.contextKey,
          propertyId: c.propertyId,
          startedAt: c.startedAt,
          lastMessageAt: c.lastMessageAt,
        })),
      );
    } catch (error: unknown) {
      logger.error(
        `Failed to list conversations: ${error instanceof Error ? error.message : String(error)}`,
        "chat",
      );
      res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({ error: "Failed to list conversations", code: "CHAT-001" });
    }
  });

  app.get(
    "/api/chat/conversations/:id/messages",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const conversationId = parseRouteId(req.params.id);
        if (!conversationId) {
          return res.status(HTTP_STATUS_BAD_REQUEST).json({ error: "Invalid conversation ID", code: "CHAT-002" });
        }

        const userId = getAuthUser(req).id;
        const conv = await storage.getRebeccaConversation(conversationId);
        if (!conv || conv.userId !== userId) {
          return res.status(404).json({ error: "Conversation not found", code: "CHAT-003" });
        }

        const messages = await storage.getRebeccaMessages(conversationId);
        res.json({
          conversationId: conv.id,
          contextType: conv.contextType,
          contextKey: conv.contextKey,
          messages: messages.map((m) => {
            // Task #550 — surface persisted retrieval sources alongside each
            // assistant message so the user-facing chat can render the same
            // "Sources used" panel as the admin Test Chat preview when
            // reloading a conversation.
            const meta = (m.metadata ?? {}) as Record<string, unknown>;
            const rawSources = Array.isArray(meta.sources) ? meta.sources : [];
            const sources = rawSources
              .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === "object")
              .map((s) => {
                const rawScore = typeof s.score === "number" ? s.score : Number(s.score);
                const rawWeight = typeof s.weight === "number" ? s.weight : Number(s.weight);
                return {
                  title: String(s.title ?? ""),
                  namespace: String(s.namespace ?? ""),
                  score: Number.isFinite(rawScore) ? rawScore : 0,
                  weight: Number.isFinite(rawWeight) ? rawWeight : 0,
                };
              });
            return {
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              ...(m.role === "assistant" ? { sources } : {}),
            };
          }),
        });
      } catch (error: unknown) {
        logger.error(
          `Failed to load conversation: ${error instanceof Error ? error.message : String(error)}`,
          "chat",
        );
        res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({ error: "Failed to load conversation", code: "CHAT-004" });
      }
    },
  );
}
