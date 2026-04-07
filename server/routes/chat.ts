import { type Express, type Request, type Response } from "express";
import { getGeminiClient, getPerplexityClient } from "../ai/clients";
import { requireAuth , getAuthUser } from "../auth";
import { aiRateLimit } from "../middleware/rate-limit";
import { storage } from "../storage";
import { buildPropertyContext } from "../ai/buildPropertyContext.js";
import { z } from "zod";
import { DEFAULT_PROJECTION_YEARS, DEFAULT_PROPERTY_INFLATION_RATE } from "@shared/constants";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { resolveLlm, getVendorService } from "../ai/resolve-llm";
import { logger } from "../logger";
import type { ResearchConfig } from "@shared/schema";
import { buildRebeccaContext } from "../ai/rebecca-context-builder";
import { retrieveDocumentContext, multiNamespaceQuery } from "../ai/pinecone-service";
import { retrieveRelevantChunks } from "../ai/knowledge-base";
import { searchAssets, buildAssetContext, type AssetMatch } from "../ai/asset-intelligence";

/**
 * CONTRACT: This endpoint provides AI chat about portfolio properties.
 * All financial metrics are computed via deterministic tools (calc/dispatch.ts),
 * never inline arithmetic. The LLM interprets pre-computed values only.
 */

import { MAX_MESSAGE_LENGTH, MAX_HISTORY_LENGTH } from "../constants";

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
});

const DEFAULT_SYSTEM_PROMPT = `You are Rebecca, a property investment analyst for a boutique hotel management company. You answer questions about the portfolio's properties, financial metrics, and hospitality industry concepts.

You know who is talking to you — the current user's name, role, email, and company are provided in the context. Address them by first name. Tailor your responses to their access level:
- Admin users can see ALL properties, ALL scenarios (including who created/owns each), and all system data. When an admin asks about scenarios, tell them who created each one.
- Regular users can only see the default portfolio properties plus their own scenarios. Do not reference other users' scenarios or data they cannot access.

You have access to the current portfolio data below. Use it to answer questions accurately. When discussing financials, be precise and cite specific numbers from the data. If asked about something not in the data, say so clearly.

Keep responses concise and professional. Use bullet points for lists. Format dollar amounts with commas. When comparing properties, use clear tables or structured comparisons.

When visual assets (photos, logos) are available in the context, use standard markdown image syntax to display them: ![caption](url). Always show relevant property photos when discussing a specific property and photos are available. When the user asks to see photos, logos, or images, include all relevant ones.

Do not make up data. Only reference what is provided in the context below.`;

function generateFollowUpChips(
  responseText: string,
  messageCount: number,
  fieldKey?: string,
): string[] {
  const chips: string[] = [];

  if (messageCount <= 2) {
    if (fieldKey) {
      chips.push("Why this range?", "Show comparables", "Impact on NOI");
    } else {
      chips.push("What are the key metrics?", "Compare properties", "Show me photos");
    }
  } else if (messageCount <= 5) {
    if (responseText.toLowerCase().includes("comparable") || responseText.toLowerCase().includes("similar")) {
      chips.push("Go deeper on comparables", "Show the relaxation trail");
    }
    if (fieldKey) {
      chips.push("Compare to company defaults", "Historical trends");
    } else {
      chips.push("What risks should I watch?", "Summarize key findings");
    }
  } else {
    chips.push("Summarize our conversation", "Any other insights?");
    if (fieldKey) {
      chips.push("Apply recommendation");
    }
  }

  return chips.slice(0, 3);
}

function deriveContextType(fieldCtx?: { entityType: string; fieldKey?: string }): string {
  if (!fieldCtx) return "general";
  if (fieldCtx.fieldKey) return "field";
  return fieldCtx.entityType;
}

function deriveContextKey(fieldCtx?: { entityType: string; entityId: number; fieldKey?: string }): string | null {
  if (!fieldCtx) return null;
  if (fieldCtx.fieldKey) {
    return `${fieldCtx.entityType}:${fieldCtx.entityId}:${fieldCtx.fieldKey}`;
  }
  return `${fieldCtx.entityType}:${fieldCtx.entityId}`;
}

export function register(app: Express) {
  app.get("/api/chat/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id as string, 10);
      if (isNaN(conversationId) || conversationId < 1) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }

      const userId = getAuthUser(req).id;
      const conv = await storage.getRebeccaConversation(conversationId);
      if (!conv || conv.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messages = await storage.getRebeccaMessages(conversationId);
      res.json({
        conversationId: conv.id,
        contextType: conv.contextType,
        contextKey: conv.contextKey,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch (error: any) {
      logger.error(`Failed to load conversation: ${error?.message || error}`, "chat");
      res.status(500).json({ error: "Failed to load conversation" });
    }
  });

  app.post("/api/chat", requireAuth, aiRateLimit(20), async (req: Request, res: Response) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const { message, history, fieldContext: fieldCtx, conversationId: reqConvId, newConversation } = parsed.data;

      const authUser = getAuthUser(req);
      const userId = authUser.id;
      const isAdmin = authUser.role === "admin";
      const userName = [authUser.firstName, authUser.lastName].filter(Boolean).join(" ") || authUser.email;

      const global = await storage.getGlobalAssumptions(userId);
      if (!(global as any)?.rebeccaEnabled) {
        return res.status(403).json({ error: "Chat assistant is not enabled" });
      }
      const allProperties = isAdmin
        ? await storage.getAllProperties()
        : await storage.getAllProperties(userId);
      const properties = allProperties.filter(p => p.isActive !== false);
      const propertyContext = buildPropertyContext(properties);

      const ga = global as any;
      const fundingInterestRate = ga?.fundingInterestRate ?? 0;
      const fundingLines: string[] = [];
      fundingLines.push(`Funding Source: ${ga?.fundingSourceLabel ?? "Funding Vehicle"}`);
      fundingLines.push(`Tranche 1: $${(ga?.safeTranche1Amount ?? 0).toLocaleString()} (${ga?.safeTranche1Date ?? "N/A"})`);
      fundingLines.push(`Tranche 2: $${(ga?.safeTranche2Amount ?? 0).toLocaleString()} (${ga?.safeTranche2Date ?? "N/A"})`);
      if ((ga?.safeValuationCap ?? 0) > 0) {
        fundingLines.push(`Valuation Cap: $${(ga.safeValuationCap).toLocaleString()}`);
      }
      if ((ga?.safeDiscountRate ?? 0) > 0) {
        fundingLines.push(`Discount Rate: ${(ga.safeDiscountRate * 100).toFixed(0)}%`);
      }
      if (fundingInterestRate > 0) {
        fundingLines.push(`Interest Rate: ${(fundingInterestRate * 100).toFixed(1)}% annual`);
        fundingLines.push(`Interest Payment: ${ga?.fundingInterestPaymentFrequency === "quarterly" ? "Paid Quarterly" : ga?.fundingInterestPaymentFrequency === "annually" ? "Paid Annually" : "Accrues Only"}`);
      }
      const baseFee = ga?.baseManagementFee ?? 0;
      const incentiveFee = ga?.incentiveManagementFee ?? 0;

      const userContextLines: string[] = [
        "CURRENT USER:",
        `Name: ${userName}`,
        `Email: ${authUser.email}`,
        `Role: ${authUser.role}`,
        `Company: ${authUser.company ?? "N/A"}`,
        `Title: ${authUser.title ?? "N/A"}`,
      ];

      let scenarioContextBlock = "";
      try {
        if (isAdmin) {
          const allScenarios = await storage.getAllScenarios();
          if (allScenarios.length > 0) {
            const scenarioLines = ["", "ALL SCENARIOS (admin view — you can see who owns each):"];
            for (const s of allScenarios.slice(0, 20)) {
              const ownerName = s.ownerName ?? s.ownerEmail;
              const propCount = Array.isArray(s.properties) ? s.properties.length : 0;
              const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "N/A";
              scenarioLines.push(`- "${s.name}" by ${ownerName} (${s.ownerEmail}) | ${propCount} properties | ${s.kind ?? "manual"} | updated ${updated}${s.isLocked ? " [LOCKED]" : ""}`);
            }
            if (allScenarios.length > 20) {
              scenarioLines.push(`  ... and ${allScenarios.length - 20} more scenarios`);
            }
            scenarioContextBlock = scenarioLines.join("\n");
          }
        } else {
          const userScenarios = await storage.getScenariosByUser(userId);
          if (userScenarios.length > 0) {
            const scenarioLines = ["", "YOUR SCENARIOS:"];
            for (const s of userScenarios.slice(0, 10)) {
              const propCount = Array.isArray(s.properties) ? s.properties.length : 0;
              const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "N/A";
              scenarioLines.push(`- "${s.name}" | ${propCount} properties | ${s.kind ?? "manual"} | updated ${updated}`);
            }
            scenarioContextBlock = scenarioLines.join("\n");
          }
        }
      } catch (err) {
        logger.warn(`Scenario context build failed (non-blocking): ${(err as Error).message}`, "chat");
      }

      const contextBlock = [
        ...userContextLines,
        "",
        "PORTFOLIO DATA:",
        propertyContext,
        "",
        `Company: ${ga?.companyName ?? "Management Company"}`,
        `Properties in Portfolio: ${properties.length}`,
        `Projection Years: ${ga?.projectionYears ?? DEFAULT_PROJECTION_YEARS}`,
        `Inflation Rate: ${((ga?.inflationRate ?? DEFAULT_PROPERTY_INFLATION_RATE) * 100).toFixed(1)}%`,
        `Base Management Fee: ${(baseFee * 100).toFixed(1)}%`,
        `Incentive Management Fee: ${(incentiveFee * 100).toFixed(1)}%`,
        "",
        "FUNDING:",
        ...fundingLines,
        scenarioContextBlock,
      ].join("\n");

      let documentContextBlock = "";
      try {
        const docPropertyId = fieldCtx?.entityType === "property" ? fieldCtx.entityId : undefined;
        const docResults = await retrieveDocumentContext({
          query: message,
          propertyId: docPropertyId,
          topK: 3,
        });
        if (docResults.length > 0) {
          const docLines = docResults.map(d =>
            `[${d.documentType}] ${d.propertyName} (score: ${d.score.toFixed(2)}):\n${d.content.slice(0, 800)}`
          );
          documentContextBlock = `\n\nRELEVANT DOCUMENTS:\n${docLines.join("\n\n")}`;
        }
      } catch (err) {
        logger.warn(`Document context retrieval failed (non-blocking): ${(err as Error).message}`, "chat");
      }

      let ragContextBlock = "";
      try {
        const [kbChunks, multiResults] = await Promise.all([
          retrieveRelevantChunks(message, 4),
          multiNamespaceQuery(message, ["research-history", "assumption-guidance"], 4),
        ]);

        const ragParts: string[] = [];
        const MAX_RAG_CHARS = 3000;
        let ragChars = 0;

        for (const chunk of kbChunks) {
          if (chunk.score < 0.3) continue;
          const entry = `[${chunk.source}] ${chunk.title} (${chunk.score.toFixed(2)}):\n${chunk.content.slice(0, 600)}`;
          if (ragChars + entry.length > MAX_RAG_CHARS) break;
          ragParts.push(entry);
          ragChars += entry.length;
        }

        for (const match of multiResults) {
          if (match.score < 0.3) continue;
          let body: string;
          let title: string;
          if (match.namespace === "research-history") {
            body = String(match.metadata.summary ?? "");
            title = `${match.metadata.location ?? ""} ${match.metadata.propertyType ?? ""} research`.trim();
          } else {
            const low = match.metadata.valueLow ?? "";
            const mid = match.metadata.valueMid ?? "";
            const high = match.metadata.valueHigh ?? "";
            const reasoning = String(match.metadata.reasoning ?? "");
            body = reasoning ? `Range: ${low}–${mid}–${high}. ${reasoning}` : `Range: ${low}–${mid}–${high}`;
            title = `${match.metadata.assumptionKey ?? match.id} guidance (${match.metadata.location ?? ""})`;
          }
          if (!body) continue;
          const entry = `[${match.namespace}] ${title} (${match.score.toFixed(2)}):\n${body.slice(0, 600)}`;
          if (ragChars + entry.length > MAX_RAG_CHARS) break;
          ragParts.push(entry);
          ragChars += entry.length;
        }

        if (ragParts.length > 0) {
          ragContextBlock = `\n\nKNOWLEDGE BASE & RESEARCH CONTEXT:\n${ragParts.join("\n\n")}`;
        }
      } catch (err) {
        logger.warn(`RAG context retrieval failed (non-blocking): ${(err as Error).message}`, "chat");
      }

      let assetContextBlock = "";
      let matchedAssets: AssetMatch[] = [];
      try {
        const visualKeywords = /\b(photo|photos|picture|pictures|image|images|logo|logos|show me|what does .* look like|how does .* look|visual|gallery|branding)\b/i;
        const propertyNameMatch = properties.find(p => p.name && message.toLowerCase().includes(p.name.toLowerCase()));
        if (visualKeywords.test(message) || propertyNameMatch) {
          const searchQuery = propertyNameMatch
            ? `${propertyNameMatch.name} ${message}`
            : message;
          const accessibleIds = isAdmin ? undefined : properties.map(p => p.id);
          matchedAssets = await searchAssets(searchQuery, 4, accessibleIds);
          if (matchedAssets.length > 0) {
            assetContextBlock = "\n\n" + buildAssetContext(matchedAssets);
          }
        }
      } catch (err) {
        logger.warn(`Asset search failed (non-blocking): ${(err as Error).message}`, "chat");
      }

      let rebeccaFieldBlock = "";
      let autoGreeting: string | null = null;
      if (fieldCtx) {
        try {
          if (fieldCtx.entityType === "property") {
            const entity = properties.find(p => p.id === fieldCtx.entityId);
            if (!entity) {
              return res.status(403).json({ error: "Entity not found or access denied" });
            }
          } else if (fieldCtx.entityType === "company") {
            if (authUser.companyId !== fieldCtx.entityId) {
              return res.status(403).json({ error: "Entity not found or access denied" });
            }
          }
          const ctxPayload = await buildRebeccaContext(userId, fieldCtx);
          const fieldParts: string[] = [
            "",
            "FOCUSED ENTITY CONTEXT:",
            ctxPayload.entitySummary,
          ];
          if (ctxPayload.fieldContext) {
            fieldParts.push("", "FIELD-SPECIFIC RESEARCH:", ctxPayload.fieldContext);
          }
          rebeccaFieldBlock = fieldParts.join("\n");
          autoGreeting = ctxPayload.autoGreeting;
        } catch (err) {
          logger.warn(`Failed to build Rebecca field context: ${(err as Error).message}`, "chat");
        }
      }

      const contextType = deriveContextType(fieldCtx);
      const contextKey = deriveContextKey(fieldCtx);
      const propertyId = fieldCtx?.entityType === "property" ? fieldCtx.entityId : null;

      let conversationId: number | null = null;

      if (reqConvId && !newConversation) {
        const existing = await storage.getRebeccaConversation(reqConvId);
        if (existing && existing.userId === userId) {
          const matchesContext = existing.contextType === contextType
            && existing.contextKey === contextKey;
          if (matchesContext) {
            conversationId = existing.id;
          }
        }
      }

      if (!conversationId) {
        if (newConversation) {
          const conv = await storage.createRebeccaConversation({
            userId,
            contextType,
            contextKey,
            propertyId: propertyId ?? undefined,
          });
          conversationId = conv.id;
        } else {
          const conv = await storage.getOrCreateConversation(
            userId,
            contextType,
            contextKey,
            propertyId,
          );
          conversationId = conv.id;
        }
      }

      let dbHistory: Array<{ role: string; content: string }> = [];
      try {
        const dbMessages = await storage.getRebeccaMessages(conversationId, MAX_HISTORY_LENGTH);
        dbHistory = dbMessages.map(m => ({ role: m.role, content: m.content }));
      } catch (err) {
        logger.warn(`Failed to load conversation history: ${(err as Error).message}`, "chat");
      }

      const effectiveHistory = dbHistory.length > 0 ? dbHistory : history;

      await storage.addRebeccaMessage({
        conversationId,
        role: "user",
        content: message,
      });

      const systemPrompt = (global as any)?.rebeccaSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
      const fullSystemPrompt = `${systemPrompt}\n\n${contextBlock}${rebeccaFieldBlock}${ragContextBlock}${documentContextBlock}${assetContextBlock}`;
      const engine = ga?.rebeccaChatEngine ?? "gemini";

      let responseText: string;

      if (engine === "perplexity") {
        const perplexity = getPerplexityClient();
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: fullSystemPrompt },
          ...effectiveHistory.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
          { role: "user", content: message },
        ];

        const startTime = Date.now();
        const completion = await perplexity.chat.completions.create({
          model: "sonar",
          messages,
          max_tokens: 1024,
        });

        const messageContent = completion.choices?.[0]?.message?.content;
        responseText = (typeof messageContent === "string" ? messageContent : "")
          || "I'm sorry, I couldn't generate a response. Please try again.";

        const citations = completion.citations ?? [];
        if (citations.length > 0) {
          const citationLines = citations.map((url: string, i: number) =>
            `[${i + 1}] ${url}`
          );
          responseText += "\n\n**Sources:**\n" + citationLines.join("\n");
        }

        const inTok = completion.usage?.prompt_tokens ?? Math.round(message.length / 4);
        const outTok = completion.usage?.completion_tokens ?? Math.round(responseText.length / 4);
        try { logApiCost({ timestamp: new Date().toISOString(), service: "perplexity", model: "sonar", operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("perplexity", "sonar", inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/chat" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }
      } else {
        const rc = (ga?.researchConfig as ResearchConfig) ?? {};
        const resolved = resolveLlm(rc, "chatbotLlm");
        const gemini = getGeminiClient();
        const chatHistory = effectiveHistory.map((msg) => ({
          role: msg.role === "user" ? "user" : ("model" as const),
          content: msg.content,
        }));
        const contents = [
          { role: "user" as const, parts: [{ text: fullSystemPrompt }] },
          { role: "model" as const, parts: [{ text: "Understood. I have the portfolio data and will answer questions based on it." }] },
          ...chatHistory.map((msg) => ({
            role: (msg.role === "user" ? "user" : "model") as "user" | "model",
            parts: [{ text: msg.content }],
          })),
          { role: "user" as const, parts: [{ text: message }] },
        ];

        const startTime = Date.now();
        const response = await gemini.models.generateContent({
          model: resolved.model,
          contents,
          config: { maxOutputTokens: 1024 },
        });

        responseText = response.text
          || "I'm sorry, I couldn't generate a response. Please try again.";

        const svc = getVendorService(resolved.vendor);
        const inTok = response.usageMetadata?.promptTokenCount ?? Math.round(message.length / 4);
        const outTok = response.usageMetadata?.candidatesTokenCount ?? Math.round(responseText.length / 4);
        try { logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/chat" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }
      }

      await storage.addRebeccaMessage({
        conversationId,
        role: "assistant",
        content: responseText,
      });

      const totalMessages = dbHistory.length + 2;
      const suggestedChips = generateFollowUpChips(responseText, totalMessages, fieldCtx?.fieldKey);

      res.json({
        response: responseText,
        conversationId,
        suggestedChips,
        ...(autoGreeting ? { autoGreeting } : {}),
        ...(matchedAssets.length > 0 ? { assets: matchedAssets } : {}),
      });
    } catch (error: any) {
      logger.error(`Chat error: ${error?.message || error}`, "chat");
      if (error?.message?.includes("API key not configured")) {
        return res.status(503).json({ error: "Chat service is not available" });
      }
      res.status(500).json({ error: "Failed to generate response" });
    }
  });
}
