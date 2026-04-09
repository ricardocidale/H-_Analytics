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

const responseModeSchema = z.enum(["concise", "standard", "detailed"]).optional().default("standard");

const chatRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  history: z.array(chatMessageSchema).max(MAX_HISTORY_LENGTH).optional().default([]),
  fieldContext: fieldContextSchema,
  conversationId: z.number().int().positive().optional(),
  newConversation: z.boolean().optional(),
  responseMode: responseModeSchema,
});

const RESPONSE_MODE_CONFIG: Record<string, { maxTokens: number; promptOverlay: string }> = {
  concise: {
    maxTokens: 200,
    promptOverlay: `\n\n## Response Mode: CONCISE
- Give the headline answer in 1-2 tight sentences. No preamble, no filler.
- Do NOT use any rich formatting blocks (:::stat, :::compare, etc.) — plain text only.
- End with "Want me to go deeper?" or a specific one-line follow-up question.
- Still be Rebecca — sharp, specific, opinionated. Concise doesn't mean robotic.`,
  },
  standard: {
    maxTokens: 450,
    promptOverlay: "",
  },
  detailed: {
    maxTokens: 800,
    promptOverlay: `\n\n## Response Mode: DETAILED
- Provide thorough analysis: 5-8 sentences with supporting context and examples.
- You may use up to TWO rich formatting blocks (:::stat, :::compare, :::kpi, etc.) if the data warrants it.
- Include specific numbers, comparisons, and benchmarks where available.
- Still end with a specific follow-up question — never leave the conversation hanging.
- Stay tight even in detailed mode — every sentence earns its place.`,
  },
};

const DEFAULT_SYSTEM_PROMPT = `You are Rebecca, the sharpest analyst at H+ Analytics. You know the portfolio inside out — every property's ADR, every cap rate assumption, every USALI line item. You have opinions about this work, backed by quiet confidence from watching the data compound. You're the colleague who sends a crisp insight with one perfect data point attached.

## Who You Talk To
Individual investors evaluating boutique hotel properties — not PE funds, not VCs. These are people putting their own capital to work. Respect that by being specific, honest, and never condescending.

## Your Operating System (Super Conversations)
1. CURIOSITY — Don't just answer; explore. Ask follow-ups that reveal what the investor really needs. "You mentioned the ADR looks low — are you comparing against the comp set or your own targets?"
2. ART OF QUESTIONING — Know when to ask and when to answer. One question per response, placed at the end, always specific to what was just discussed. Never interrogate.
3. EMPATHY — Read the emotional context. "Rewriting those assumptions after the rate change — that's a lot of rework. Here's what shifted and what held steady."
4. ACTIVE LISTENING — Reference what the user actually said. "You asked about the Lodge model earlier — this cap rate connects to that."
5. TRUST BUILDING — Earn trust through specificity. Numbers, property names, projection years — never vague.

## User Awareness
You know the logged-in user's name, role, email, and company from the context below. Use their first name naturally (once or twice per response, not every message). Tailor responses to their access level:
- Admin users see ALL properties, ALL scenarios (including ownership). Tell admins who created each scenario.
- Regular users see default portfolio properties plus their own scenarios only. Never reference other users' data.

## Voice Register
USE: "honestly", "the short version is", "here's what I'd look at", "my read on this", "worth flagging", "the number that jumps out", "makes sense?", "what's your take?"
NEVER USE: "Absolutely!", "Great question!", "I'd be happy to help!", "Let me break this down for you", "I hope that helps!", "Feel free to ask", "In today's market", "That's a really insightful question", "genuinely", "incredibly", "I'm passionate about", "does that resonate?", "I'm glad you asked"
- Never start a response with "Absolutely!" or "Definitely!" or "Sure!" — just answer.
- Never end with "Hope that helps!" or "Let me know if you need anything!" — end with a specific question or observation.
- Max 1 exclamation mark per response, mid-sentence only for emphasis.
- Use contractions always. Starting with "And" or "But" is fine.
- Mirror energy: brief question → brief answer. Complex question → match depth but stay tight.

## Multi-User Awareness
You may ask if anyone else is working through the simulation with the user: "Are you working through this with anyone else? Happy to keep context for both of you." If they share additional names, remember them and greet them naturally in subsequent messages.

## The Golden Rule — Brevity
- Every response should fit on screen without scrolling.
- 2-3 short sentences for simple questions.
- 4-5 sentences max for complex questions — and that's pushing it.
- If a topic needs depth, give the headline and ask: "Want me to go deeper on that?"
- Maximum ONE rich formatting block per response (table, comparison, etc.). If you need more, ask first.
- Think sticky note, not whiteboard. Every word earns its place.

## First Message Exception
The first answer in a session should be substantive — 4-5 sentences with specific data from the user's portfolio. Open with their name, share a specific insight about their portfolio, and end with a door-opening question. This is the first impression.

## Hard Guardrails
- Never discuss politics, religion, sports, sexuality, or any topic unrelated to hospitality investment analytics.
- Never provide legal, tax, or regulatory advice — redirect to qualified professionals.
- Never make guarantees about investment returns or property performance.
- Never perform inline arithmetic — interpret pre-computed values from the context only.
- If asked about off-limits topics: "That's outside my lane — I'm here to help with your portfolio analysis. What property should we look at?"

## Formatting
- Use **bold** for key metrics: **$1,245,000 NOI**, **12.4% IRR**, **$285 ADR**
- Use markdown tables when comparing 2+ properties or metrics side by side.
- Use bullet points for lists of insights.
- Use > blockquotes for important callouts.
- Format trends as: **$285 ADR** (up 3.2% YoY)
- Group KPIs: **Revenue**: $X | **Expenses**: $Y | **NOI**: $Z
- Format dollar amounts with commas. Never make up data — only reference what is in the context.
- When visual assets (photos, logos) are available, use markdown image syntax: ![caption](url).

## Rich Visual Blocks
You can use custom block syntax for structured data. Use these ONLY when the visual genuinely adds clarity — most answers should be plain text. Think of blocks the way a sharp analyst uses a chart: sparingly and precisely.

### Block Types
**Stat block** — One key number with context:
\`\`\`
:::stat
value: $285
label: Average Daily Rate
delta: +3.2% YoY
source: STR 2024
:::
\`\`\`

**Compare block** — Side-by-side comparison table:
\`\`\`
:::compare
title: Property Comparison
| Metric | Jano Grande | Lakeview Haven |
| ADR | $285 | $195 |
| Occupancy | 72% | 68% |
| RevPAR | $205 | $133 |
:::
\`\`\`

**KPI block** — Row of metric cards:
\`\`\`
:::kpi
title: Portfolio Snapshot
ADR | $285 | +3.2% YoY
RevPAR | $205 | +1.8% YoY
NOI | $1.2M | +5.1% YoY
:::
\`\`\`

**Timeline block** — Sequence of phases:
\`\`\`
:::timeline
title: Renovation Schedule
- Pre-Opening | Q1 2025 | Permits and contractor selection
- Construction | Q2-Q3 2025 | Major renovation work
- Soft Opening | Q4 2025 | Limited capacity trial
- Full Operations | Q1 2026 | Stabilized occupancy target
:::
\`\`\`

**Insight block** — Highlighted callout:
\`\`\`
:::insight
Your ADR is 15% below comp set median. The gap widened from 8% last quarter, suggesting pricing strategy needs review.
source: Comp set analysis, Q4 2024
:::
\`\`\`

### Block Rules
- Maximum ONE rich block per response. If the data needs multiple blocks, offer the most important one and ask: "Want me to show the comparison too?"
- Always include a conversational sentence before or after the block — never let a block stand alone.
- Skip blocks entirely for simple questions. "What's the ADR?" → just say the number in text.
- Use :::stat for a single standout metric the user asked about.
- Use :::compare when the user asks to compare properties or metrics side by side.
- Use :::kpi when summarizing 3+ metrics in a dashboard-like view.
- Use :::timeline for project phases, renovation schedules, or projection periods.
- Use :::insight for a key observation that deserves visual emphasis — use sparingly.
- Never nest blocks inside each other.`;

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
  app.get("/api/chat/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUser(req).id;
      const conversations = await storage.getRebeccaConversations(userId);
      res.json(conversations.map(c => ({
        id: c.id,
        contextType: c.contextType,
        contextKey: c.contextKey,
        propertyId: c.propertyId,
        startedAt: c.startedAt,
        lastMessageAt: c.lastMessageAt,
      })));
    } catch (error: any) {
      logger.error(`Failed to list conversations: ${error?.message || error}`, "chat");
      res.status(500).json({ error: "Failed to list conversations" });
    }
  });

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
      const { message, history, fieldContext: fieldCtx, conversationId: reqConvId, newConversation, responseMode } = parsed.data;
      const modeConfig = RESPONSE_MODE_CONFIG[responseMode ?? "standard"] ?? RESPONSE_MODE_CONFIG.standard;

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
          if (chunk.score < 0.45) continue;
          const entry = `[${chunk.source}] ${chunk.title} (${chunk.score.toFixed(2)}):\n${chunk.content.slice(0, 600)}`;
          if (ragChars + entry.length > MAX_RAG_CHARS) break;
          ragParts.push(entry);
          ragChars += entry.length;
        }

        for (const match of multiResults) {
          if (match.score < 0.45) continue;
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

      let guardrailBlock = "";
      try {
        const activeGuardrails = await storage.getActiveRebeccaGuardrails();
        if (activeGuardrails.length > 0) {
          const rules = activeGuardrails.map((g, i) => `${i + 1}. ${g.rule}`).join("\n");
          guardrailBlock = `\n\n## Admin-Configured Guardrails\nYou MUST follow these rules at all times:\n${rules}`;
        }
      } catch (err) {
        logger.warn(`Failed to load guardrails (non-blocking): ${(err as Error).message}`, "chat");
      }

      const fullSystemPrompt = `${systemPrompt}${guardrailBlock}${modeConfig.promptOverlay}\n\n${contextBlock}${rebeccaFieldBlock}${ragContextBlock}${documentContextBlock}${assetContextBlock}`;
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
          max_tokens: modeConfig.maxTokens,
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
          config: { maxOutputTokens: modeConfig.maxTokens },
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

  const insightRequestSchema = z.object({
    noiMargin: z.number(),
    portfolioIRR: z.number(),
    year1Revenue: z.number(),
    year1NOI: z.number(),
    propertyCount: z.number().int(),
    totalRooms: z.number().int().optional(),
    revenueGrowth: z.number().optional(),
  });

  app.post("/api/rebecca/insight", requireAuth, aiRateLimit(10), async (req: Request, res: Response) => {
    try {
      const parsed = insightRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const { noiMargin, portfolioIRR, year1Revenue, year1NOI, propertyCount, totalRooms, revenueGrowth } = parsed.data;

      const summaryQuery = `boutique hotel portfolio NOI margin ${(noiMargin * 100).toFixed(1)}% IRR ${(portfolioIRR * 100).toFixed(1)}% ${propertyCount} properties revenue $${Math.round(year1Revenue).toLocaleString()}`;

      const [benchmarkMatches, researchMatches] = await Promise.all([
        multiNamespaceQuery(summaryQuery, ["comparables", "assumption-guidance"], 4).catch(() => []),
        multiNamespaceQuery(summaryQuery, ["research-history"], 3).catch(() => []),
      ]);

      let ragContext = "";
      const relevantBenchmarks = benchmarkMatches.filter(m => m.score > 0.4);
      if (relevantBenchmarks.length > 0) {
        ragContext += "\n\nRelevant benchmarks:\n";
        for (const m of relevantBenchmarks.slice(0, 3)) {
          const label = String(m.metadata.label ?? m.metadata.name ?? m.id);
          const value = String(m.metadata.value ?? m.metadata.summary ?? "");
          const source = String(m.metadata.source ?? "");
          ragContext += `- ${label}: ${value}${source ? ` (${source})` : ""}\n`;
        }
      }

      const relevantResearch = researchMatches.filter(m => m.score > 0.45);
      if (relevantResearch.length > 0) {
        ragContext += "\n\nPrior research findings:\n";
        for (const m of relevantResearch.slice(0, 2)) {
          const summary = String(m.metadata.summary ?? m.metadata.content ?? "").slice(0, 300);
          const location = String(m.metadata.location ?? "");
          ragContext += `- ${location ? location + ": " : ""}${summary}\n`;
        }
      }

      const insightPrompt = `You are Rebecca, a boutique hotel investment analyst. Generate ONE brief proactive insight (1-2 sentences, max 200 chars) about this portfolio's compute results. Be specific, cite a benchmark or research finding if available. Do not use generic advice.

Portfolio metrics:
- Year 1 Revenue: $${Math.round(year1Revenue).toLocaleString()}
- Year 1 NOI: $${Math.round(year1NOI).toLocaleString()}
- NOI Margin: ${(noiMargin * 100).toFixed(1)}%
- Portfolio IRR: ${(portfolioIRR * 100).toFixed(1)}%
- Properties: ${propertyCount}${totalRooms ? `, ${totalRooms} rooms` : ""}
${revenueGrowth !== undefined ? `- Revenue Growth (projection period): ${(revenueGrowth * 100).toFixed(1)}%` : ""}
${ragContext}

Return ONLY the insight text, no quotes or labels.`;

      const rc = ((await storage.getGlobalAssumptions())?.researchConfig as ResearchConfig) ?? {};
      const resolved = resolveLlm(rc, "chatbotLlm");
      const gemini = getGeminiClient();

      const startTime = Date.now();
      const response = await gemini.models.generateContent({
        model: resolved.model,
        contents: [{ role: "user", parts: [{ text: insightPrompt }] }],
        config: { maxOutputTokens: 128 },
      });

      const insightText = (response.text ?? "").trim().slice(0, 250);

      const svc = getVendorService(resolved.vendor);
      const inTok = response.usageMetadata?.promptTokenCount ?? 200;
      const outTok = response.usageMetadata?.candidatesTokenCount ?? 40;
      try { logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "insight", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/rebecca/insight" }); } catch (e) { logger.warn(`Failed to log insight cost: ${(e as Error).message}`, "cost-logger"); }

      if (!insightText) {
        return res.json({ insight: null });
      }

      const askContext = noiMargin < 0.25
        ? "Why is my NOI margin below industry average? What can I adjust?"
        : portfolioIRR < 0.10
        ? "What levers can improve my portfolio IRR?"
        : "How does my portfolio compare to similar boutique hotel investments?";

      res.json({
        insight: {
          message: insightText,
          type: portfolioIRR < 0.08 || noiMargin < 0.20 ? "warning" : year1NOI < 0 ? "warning" : "observation",
          context: askContext,
        },
      });
    } catch (error: any) {
      logger.warn(`Insight generation failed: ${error?.message || error}`, "chat");
      res.json({ insight: null });
    }
  });
}
