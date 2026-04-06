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

/**
 * CONTRACT: This endpoint provides AI chat about portfolio properties.
 * All financial metrics are computed via deterministic tools (calc/dispatch.ts),
 * never inline arithmetic. The LLM interprets pre-computed values only.
 */

import { MAX_MESSAGE_LENGTH, MAX_HISTORY_LENGTH } from "../constants";


const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  history: z.array(chatMessageSchema).max(MAX_HISTORY_LENGTH).optional().default([]),
});

// Using centralized singleton from server/ai/clients.ts

const DEFAULT_SYSTEM_PROMPT = `You are Rebecca, a property investment analyst for a boutique hotel management company. You answer questions about the portfolio's properties, financial metrics, and hospitality industry concepts.

You have access to the current portfolio data below. Use it to answer questions accurately. When discussing financials, be precise and cite specific numbers from the data. If asked about something not in the data, say so clearly.

Keep responses concise and professional. Use bullet points for lists. Format dollar amounts with commas. When comparing properties, use clear tables or structured comparisons.

Do not make up data. Only reference what is provided in the context below.`;

export function register(app: Express) {
  app.post("/api/chat", requireAuth, aiRateLimit(20), async (req: Request, res: Response) => {
    try {
      // Validate input with Zod
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const { message, history } = parsed.data;

      const userId = getAuthUser(req).id;

      const global = await storage.getGlobalAssumptions(userId);
      if (!(global as any)?.rebeccaEnabled) {
        return res.status(403).json({ error: "Chat assistant is not enabled" });
      }
      const allProperties = await storage.getAllProperties(userId);
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

      const contextBlock = [
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
      ].join("\n");

      const systemPrompt = (global as any)?.rebeccaSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
      const fullSystemPrompt = `${systemPrompt}\n\n${contextBlock}`;
      const engine = ga?.rebeccaChatEngine ?? "gemini";

      if (engine === "perplexity") {
        const perplexity = getPerplexityClient();
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: fullSystemPrompt },
          ...history.map((msg) => ({
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
        let text = (typeof messageContent === "string" ? messageContent : "")
          || "I'm sorry, I couldn't generate a response. Please try again.";

        const citations = completion.citations ?? [];
        if (citations.length > 0) {
          const citationLines = citations.map((url: string, i: number) =>
            `[${i + 1}] ${url}`
          );
          text += "\n\n**Sources:**\n" + citationLines.join("\n");
        }

        const inTok = completion.usage?.prompt_tokens ?? Math.round(message.length / 4);
        const outTok = completion.usage?.completion_tokens ?? Math.round(text.length / 4);
        try { logApiCost({ timestamp: new Date().toISOString(), service: "perplexity", model: "sonar", operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("perplexity", "sonar", inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/chat" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }

        res.json({ response: text });
      } else {
        const rc = (ga?.researchConfig as ResearchConfig) ?? {};
        const resolved = resolveLlm(rc, "chatbotLlm");
        const gemini = getGeminiClient();
        const chatHistory = history.map((msg) => ({
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

        const text = response.text
          || "I'm sorry, I couldn't generate a response. Please try again.";

        const svc = getVendorService(resolved.vendor);
        const inTok = response.usageMetadata?.promptTokenCount ?? Math.round(message.length / 4);
        const outTok = response.usageMetadata?.candidatesTokenCount ?? Math.round(text.length / 4);
        try { logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/chat" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }

        res.json({ response: text });
      }
    } catch (error: any) {
      logger.error(`Chat error: ${error?.message || error}`, "chat");
      if (error?.message?.includes("API key not configured")) {
        return res.status(503).json({ error: "Chat service is not available" });
      }
      res.status(500).json({ error: "Failed to generate response" });
    }
  });
}
