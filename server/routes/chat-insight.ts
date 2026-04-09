import { type Express, type Request, type Response } from "express";
import { getGeminiClient } from "../ai/clients";
import { requireAuth } from "../auth";
import { aiRateLimit } from "../middleware/rate-limit";
import { storage } from "../storage";
import { z } from "zod";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { resolveLlm, getVendorService } from "../ai/resolve-llm";
import { logger } from "../logger";
import type { ResearchConfig } from "@shared/schema";
import { multiNamespaceQuery } from "../ai/pinecone-service";

const insightRequestSchema = z.object({
  noiMargin: z.number(),
  portfolioIRR: z.number(),
  year1Revenue: z.number(),
  year1NOI: z.number(),
  propertyCount: z.number().int(),
  totalRooms: z.number().int().optional(),
  revenueGrowth: z.number().optional(),
});

export function registerInsightRoute(app: Express) {
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
