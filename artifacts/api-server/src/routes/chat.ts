import { type Express, type Request, type Response } from "express";
import { mergeRebeccaSettings, computeBlocksIncluded, rebeccaSettingsPatchSchema, type RebeccaSettings } from "@shared/rebecca-settings";
import { requireAuth, getAuthUser } from "../auth";
import { aiRateLimit } from "../middleware/rate-limit";
import { storage } from "../storage";
import { z } from "zod";
import { isAdminRole } from "@shared/constants";
import { logger } from "../logger";
import { RESPONSE_MODE_CONFIG, detectLanguage, generateFollowUpChips, HELP_RESPONSE, FOLLOW_UPS_MARKER } from "./chat-prompts";
import { registerInsightRoute } from "./chat-insight";
import { logActivity } from "./helpers";
import { MAX_MESSAGE_LENGTH, MAX_HISTORY_LENGTH, HTTP_422_UNPROCESSABLE_ENTITY, HTTP_503_SERVICE_UNAVAILABLE } from "../constants";
import { collectChatSourcesFromManifest } from "./chat-sources";
import { buildContextContract } from "../ai/rebecca-context-contract";
import { getRebeccaTools } from "../chat/rebecca-tools";
import type { DataChangedEntry } from "../chat/rebecca-tool-types";
import { resolveDefaultModel, resolveResponseMode, responseModeSchema, callLlm, callLlmStream, ChatPolicyError, type MessageEntry } from "./chat-llm";
import { sseWrite, type ToolContext } from "./chat-sse";
import { buildChatContext, ContextAccessError } from "./chat-context";
import { buildFullSystemPrompt } from "./chat-prompt-builder";
import { runAgenticLoop } from "./chat-loop";
import { registerConversationRoutes } from "./chat-conversations";
import { resolveConversationId, loadChatHistory, saveUserMessage } from "./chat-conversation";
import { patchRebeccaSettings } from "./chat-settings";

export type { DataChangedEntry };
export { resolveResponseMode, callLlm, callLlmStream };

const fieldContextSchema = z.object({
  entityType: z.enum(["property", "company"]),
  entityId: z.number().int().positive(),
  fieldKey: z.string().max(100).optional(),
  scenarioId: z.number().int().positive().nullable().optional(),
}).optional();

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  history: z.array(chatMessageSchema).max(MAX_HISTORY_LENGTH).optional().default([]),
  fieldContext: fieldContextSchema,
  conversationId: z.number().int().positive().optional(),
  newConversation: z.boolean().optional(),
  responseMode: responseModeSchema,
  currentPage: z.string().max(60).optional(),
  // Task #499 — admin-only override used by the Test Chat preview to try
  // unsaved settings without persisting them. Ignored for non-admin callers.
  previewSettings: rebeccaSettingsPatchSchema.optional(),
  // When previewSettings are provided we don't want to log the conversation
  // to the saved Rebecca conversation thread.
  preview: z.boolean().optional(),
  stream: z.boolean().optional().default(false),
});

export function register(app: Express) {
  registerInsightRoute(app);
  registerConversationRoutes(app);

  app.post("/api/chat", requireAuth, aiRateLimit(20), async (req: Request, res: Response) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
    }
    let streamActive = false;
    const useStream = !!(parsed.data.stream && !parsed.data.preview);
    try {
      const { message, history, fieldContext: fieldCtx, conversationId: reqConvId, newConversation, responseMode: bodyResponseMode, currentPage } = parsed.data;

      const authUser = getAuthUser(req);
      const userId = authUser.id;
      const responseMode = resolveResponseMode(bodyResponseMode, authUser.rebeccaResponseMode);
      const modeConfig = RESPONSE_MODE_CONFIG[responseMode] ?? RESPONSE_MODE_CONFIG.standard;
      const isAdmin = isAdminRole(authUser.role);
      const userName = [authUser.firstName, authUser.lastName].filter(Boolean).join(" ") || authUser.email;

      const ga = await storage.getGlobalAssumptions(userId);
      if (!ga?.rebeccaEnabled) return res.status(403).json({ error: "Chat assistant is not enabled", code: "CHAT-005" });
      if (authUser.rebeccaOptOut) return res.status(403).json({ error: "Chat assistant is disabled in your profile settings", code: "CHAT-006" });

      // /help intercept — return capability list without invoking the LLM.
      if (message.trim() === "/help") {
        const helpPayload = { response: HELP_RESPONSE, conversationId: null, suggestedChips: ["Show me all properties", "Create a scenario", "Refresh benchmarks"], detectedLanguage: "en", sourcesUsed: [] };
        if (useStream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();
          sseWrite(res, "done", helpPayload);
          res.end();
        } else {
          res.json(helpPayload);
        }
        return;
      }

      // Task #499 — load persisted Rebecca settings, then apply any admin preview overlay.
      const baseSettings = mergeRebeccaSettings(ga.rebeccaConfig);
      const rebeccaSettings: RebeccaSettings = (isAdmin && parsed.data.previewSettings)
        ? patchRebeccaSettings(baseSettings, parsed.data.previewSettings)
        : baseSettings;
      const isPreview = isAdmin && (parsed.data.preview ?? !!parsed.data.previewSettings);

      const allProperties = isAdmin ? await storage.getAllProperties() : await storage.getAllProperties(userId);
      const properties = allProperties.filter((p) => p.isActive !== false);

      // Build all context blocks and run retrievals.
      let chatCtx: Awaited<ReturnType<typeof buildChatContext>>;
      try {
        chatCtx = await buildChatContext({ userId, isAdmin, authUser, ga, properties, fieldCtx, message, rebeccaSettings, currentPage, userName });
      } catch (err: unknown) {
        if (err instanceof ContextAccessError) return res.status(403).json({ error: err.message, code: err.code });
        throw err;
      }
      const { contextBlock, ragContextBlock, documentContextBlock, assetContextBlock, rebeccaFieldBlock, manifest, blockPresence, matchedAssets, autoGreeting, observations, contextType, contextKey, propertyId } = chatCtx;

      const conversationId = await resolveConversationId({ userId, isPreview, reqConvId, newConversation, contextType, contextKey, propertyId, req });
      const effectiveHistory = await loadChatHistory({ conversationId, isPreview, clientHistory: history });
      const detectedLanguage = detectLanguage(message);
      await saveUserMessage({ conversationId, isPreview, message, detectedLanguage });

      if (!isPreview && conversationId !== null) {
        try { await storage.updateRebeccaConversationModel(conversationId, `${rebeccaSettings.llm.provider}:${rebeccaSettings.llm.model}`); }
        catch (e: unknown) { logger.warn(`Failed to update conversation model: ${e instanceof Error ? e.message : String(e)}`, "chat"); }
      }

      // Assemble full system prompt including guardrails, overlays, recent activity and macro data.
      const fullSystemPrompt = await buildFullSystemPrompt({ ga, modePromptOverlay: modeConfig.promptOverlay, detectedLanguage, contextBlock, rebeccaFieldBlock, ragContextBlock, documentContextBlock, assetContextBlock, blockPresence, rebeccaSettings, userId, properties });

      // Task #499 — pluggable LLM dispatch with optional fallback.
      const legacyEngine = ga?.rebeccaChatEngine ?? "gemini";
      const provider = rebeccaSettings.llm.provider;
      const model = rebeccaSettings.llm.model || await resolveDefaultModel(provider);
      const sampling = { temperature: rebeccaSettings.llm.temperature, maxOutputTokens: Math.min(rebeccaSettings.llm.maxOutputTokens, modeConfig.maxTokens), topP: rebeccaSettings.llm.topP };
      const fallback = rebeccaSettings.llm.fallbackProvider
        ? { provider: rebeccaSettings.llm.fallbackProvider, model: rebeccaSettings.llm.fallbackModel || await resolveDefaultModel(rebeccaSettings.llm.fallbackProvider) }
        : null;
      const webSearchEnabled = rebeccaSettings.sources.webSearch.enabled;

      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        streamActive = true;
      }

      const dataChanged: DataChangedEntry[] = [];
      let responseText = "";
      let resolvedModelName = model;
      let resolvedProvider = provider;
      let primaryLoopExecutedTools = false;
      const rebeccaTools = getRebeccaTools();
      const toolCtx: ToolContext = { userId, req };
      const loopBase = { fullSystemPrompt, effectiveHistory: effectiveHistory as MessageEntry[], message, sampling, tools: rebeccaTools, toolCtx, useStream, webSearchEnabled, res, dataChanged, userId };

      try {
        responseText = await runAgenticLoop({ ...loopBase, provider, model, onToolExecuted: () => { primaryLoopExecutedTools = true; } });
      } catch (primaryErr: unknown) {
        logger.warn(`Primary LLM ${provider}:${model} failed: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`, "chat");
        if (fallback && !primaryLoopExecutedTools) {
          logger.info(`Falling back to ${fallback.provider}:${fallback.model}`, "chat");
          responseText = await runAgenticLoop({ ...loopBase, provider: fallback.provider, model: fallback.model, onToolExecuted: () => {} });
          resolvedModelName = fallback.model;
          resolvedProvider = fallback.provider;
        } else {
          throw primaryErr;
        }
      }

      // Web search only fires for Exa; mark presence honestly.
      blockPresence.webSearch = webSearchEnabled && resolvedProvider === "exa";
      const blocksIncluded = isAdmin ? computeBlocksIncluded(blockPresence, rebeccaSettings.sources) : undefined;
      void legacyEngine;

      // Task #539 / #551 — single registration point for the "Sources used" panel.
      // Task #550 — compute BEFORE persisting the assistant message.
      const sourcesUsedSorted = collectChatSourcesFromManifest(manifest, rebeccaSettings.sources);
      const totalMessages = (effectiveHistory as Array<unknown>).length + 2;

      // U7 — parse LLM-suggested follow-up chips from the FOLLOW_UPS: footer.
      let visibleResponseText = responseText;
      let suggestedChips: string[];
      const followUpsLineIdx = responseText.lastIndexOf(FOLLOW_UPS_MARKER);
      if (followUpsLineIdx !== -1) {
        const chipsRaw = responseText.slice(followUpsLineIdx + FOLLOW_UPS_MARKER.length).trim();
        const parsedChips = chipsRaw.split("|").map((s) => s.trim()).filter((s) => s.length > 0);
        if (parsedChips.length > 0) {
          suggestedChips = parsedChips.slice(0, 3);
          visibleResponseText = responseText.slice(0, followUpsLineIdx).trimEnd();
        } else {
          suggestedChips = generateFollowUpChips(responseText, totalMessages, fieldCtx?.fieldKey, detectedLanguage);
        }
      } else {
        suggestedChips = generateFollowUpChips(responseText, totalMessages, fieldCtx?.fieldKey, detectedLanguage);
      }

      if (!isPreview && conversationId !== null) {
        const assistantMessage = await storage.addRebeccaMessage({
          conversationId,
          role: "assistant",
          content: visibleResponseText,
          metadata: {
            responseMode,
            model: resolvedModelName,
            engine: resolvedProvider,
            // Task #550 — persist per-turn sources for the user-facing chat reload.
            sources: sourcesUsedSorted,
          },
        });
        void storage.logRebeccaContextContractTurn({
          conversationId: conversationId ?? undefined,
          messageId: assistantMessage.id,
          userId,
          contract: buildContextContract({
            conversationId: conversationId ?? undefined,
            messageId: assistantMessage.id,
            userId,
            requestContext: { contextType, contextKey, currentPage: currentPage ?? undefined, entityType: fieldCtx?.entityType, entityId: fieldCtx?.entityId },
            manifest,
            promptBlocksIncluded: blocksIncluded ?? [],
          }),
        }).catch((err) => logger.warn(`Context contract logging failed: ${err instanceof Error ? err.message : String(err)}`, "chat"));
      }

      // Preview mode never logs activity — there's no real conversation row
      // to reference (CodeRabbit PR-78).
      if (!isPreview && conversationId !== null) {
        logActivity(req, "rebecca-chat", "rebecca_conversation", conversationId, null, { responseMode, detectedLanguage, totalMessages });
      }

      const responsePayload = {
        response: visibleResponseText,
        conversationId,
        suggestedChips,
        detectedLanguage,
        sourcesUsed: sourcesUsedSorted,
        ...(blocksIncluded ? { blocksIncluded } : {}),
        ...(blocksIncluded ? { assembledSystemPrompt: fullSystemPrompt } : {}),
        ...(autoGreeting ? { autoGreeting } : {}),
        ...(matchedAssets.length > 0 ? { assets: matchedAssets } : {}),
        ...(observations.length > 0 ? { observations } : {}),
        ...(dataChanged.length > 0 ? { dataChanged } : {}),
      };

      if (useStream) { sseWrite(res, "done", responsePayload); res.end(); }
      else { res.json(responsePayload); }

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Chat error: ${msg}`, "chat");
      if (streamActive) {
        sseWrite(res, "error", { message: "Failed to generate response", retryable: true });
        res.end();
        try {
          const { processNotificationEvent } = await import("../notifications/engine");
          const { createEvent } = await import("../notifications/events");
          void processNotificationEvent(createEvent("LLM_MODEL_ISSUE", { message: `Rebecca streaming error: ${msg}`, metadata: { errorMessage: msg } }));
        } catch { /* non-fatal */ }
        return;
      }
      if (error instanceof ChatPolicyError) return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: msg });
      if (msg.includes("API key not configured")) return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: "Chat service is not available", code: "CHAT-009" });
      res.status(500).json({ error: "Failed to generate response", code: "CHAT-010" });
    }
  });
}
