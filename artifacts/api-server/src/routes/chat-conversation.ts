import { type Request } from "express";
import { storage } from "../storage";
import { logger } from "../logger";
import { MAX_HISTORY_LENGTH } from "../constants";
import { logActivity } from "./helpers";

export async function resolveConversationId(params: {
  userId: number;
  reqConvId: number | undefined;
  newConversation: boolean | undefined;
  contextType: string;
  contextKey: string | null;
  propertyId: number | null;
  req: Request;
}): Promise<number> {
  const { userId, reqConvId, newConversation, contextType, contextKey, propertyId, req } = params;

  if (reqConvId && !newConversation) {
    const existing = await storage.getRebeccaConversation(reqConvId);
    if (existing && existing.userId === userId) {
      if (existing.contextType === contextType && existing.contextKey === contextKey) {
        return existing.id;
      }
    }
  }

  if (newConversation) {
    const conv = await storage.createRebeccaConversation({
      userId,
      contextType,
      contextKey,
      propertyId: propertyId ?? undefined,
    });
    logActivity(req, "start-rebecca-conversation", "rebecca_conversation", conv.id, contextType, {
      contextKey,
      propertyId,
    });
    return conv.id;
  }

  const conv = await storage.getOrCreateConversation(
    userId,
    contextType,
    contextKey,
    propertyId,
  );
  return conv.id;
}

export async function loadChatHistory(params: {
  conversationId: number;
  isPreview: boolean;
  clientHistory: Array<{ role: string; content: string }>;
}): Promise<Array<{ role: string; content: string }>> {
  const { conversationId, isPreview, clientHistory } = params;
  if (isPreview) return clientHistory;
  try {
    const dbMessages = await storage.getRebeccaMessages(conversationId, MAX_HISTORY_LENGTH);
    const dbHistory = dbMessages.map((m) => ({ role: m.role, content: m.content }));
    return dbHistory.length > 0 ? dbHistory : clientHistory;
  } catch (err: unknown) {
    logger.warn(
      `Failed to load conversation history: ${err instanceof Error ? err.message : String(err)}`,
      "chat",
    );
    return clientHistory;
  }
}

export async function saveUserMessage(params: {
  conversationId: number;
  isPreview: boolean;
  message: string;
  detectedLanguage: string;
}): Promise<void> {
  const { conversationId, isPreview, message, detectedLanguage } = params;
  if (isPreview) return;
  await storage.addRebeccaMessage({
    conversationId,
    role: "user",
    content: message,
    metadata: { language: detectedLanguage },
  });
  try {
    await storage.updateRebeccaConversationLanguage(conversationId, detectedLanguage);
  } catch (e: unknown) {
    logger.warn(
      `Failed to update conversation language: ${e instanceof Error ? e.message : String(e)}`,
      "chat",
    );
  }
}
