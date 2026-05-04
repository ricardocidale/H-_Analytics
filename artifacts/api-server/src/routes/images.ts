import type { Express, Request, Response } from "express";
import { getOpenAIClient, getGeminiClient } from "../image/client";
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { requireAuth, isApiRateLimited, getAuthUser } from "../auth";
import { getAvailableStylesFromDb, getAdminRateLimit } from "../integrations/replicate";
import { z } from "zod";
import { logApiCost, estimateCost, unitCost } from "../middleware/cost-logger";
import { storage } from "../storage";
import { resolveLlm, getVendorService } from "../ai/resolve-llm";
import type { ResearchConfig } from "@workspace/db";
import { logger } from "../logger";
import {
  PHOTO_ENHANCER_STYLES,
  PhotoEnhancerStyleDisabledError,
  PhotoEnhancerInvalidSourceUrlError,
  runPhotoEnhancerPipeline,
} from "../services/photo-enhancer-pipeline";

const generatePropertyImageSchema = z.object({
  prompt: z.string().optional().default(""),
  style: z.enum(PHOTO_ENHANCER_STYLES).optional().default("standard"),
  beforeImageUrl: z.string().min(1).optional(),
  propertyId: z.number().int().positive().optional(),
});

export function registerImageRoutes(app: Express): void {
  app.post("/api/generate-image", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "generate-image", 5)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const { prompt, size = "1024x1024" } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const startTime = Date.now();
      const { modelId: imageGenModelId } = await resolveLlmFor("image-generation");
      const response = await getOpenAIClient().images.generate({
        model: imageGenModelId,
        prompt,
        n: 1,
        size: size as "1024x1024" | "512x512" | "256x256",
      });

      try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: imageGenModelId, operation: "image-gen", estimatedCostUsd: unitCost(imageGenModelId), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/generate-image" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }

      const imageData = response.data?.[0];
      res.json({
        url: imageData?.url,
        b64_json: imageData?.b64_json,
      });
    } catch (error: unknown) {
      logger.error(`Error generating image: ${error instanceof Error ? error.message : error}`, "image-gen");
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  app.get("/api/replicate/styles", requireAuth, async (_req: Request, res: Response) => {
    try {
      const styles = await getAvailableStylesFromDb();
      res.json({ styles });
    } catch (error: unknown) {
      logger.error(`Error fetching Replicate styles: ${error instanceof Error ? error.message : error}`, "image-gen");
      res.status(500).json({ error: "Failed to fetch available styles" });
    }
  });

  // Legacy property-image endpoint. All real work is delegated to the
  // shared Photo Enhancer pipeline so this route and the specialist
  // console (/api/specialists/photo-enhancer/run) share one rate-limit
  // bucket, one SSRF guard, one OpenAI fallback, and one research_runs
  // call-log stream. Kept on the URL map so existing clients (admin
  // branding picker, legacy album buttons) keep working while callers
  // migrate to the specialist URL.
  app.post("/api/generate-property-image", requireAuth, async (req: Request, res: Response) => {
    const userId = getAuthUser(req).id;
    try {
      const rateLimit = await getAdminRateLimit();
      if (isApiRateLimited(userId, "generate-image", rateLimit)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const parsed = generatePropertyImageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      }
      const { prompt, style, beforeImageUrl, propertyId } = parsed.data;

      const result = await runPhotoEnhancerPipeline({
        userId,
        prompt,
        style,
        beforeImageUrl,
        propertyId,
        originatedFrom: "legacy",
        route: "/api/generate-property-image",
      });

      // Legacy response shape — omit specialistRunId to keep the contract
      // stable for old clients.
      res.json({
        objectPath: result.objectPath,
        imageData: result.imageData,
        isAiGenerated: result.isAiGenerated,
        style: result.style,
        usedFallback: result.usedFallback,
        fallbackNotice: result.fallbackNotice,
      });
    } catch (error: unknown) {
      if (error instanceof PhotoEnhancerStyleDisabledError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof PhotoEnhancerInvalidSourceUrlError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error(
        `Error generating property image: ${error instanceof Error ? error.message : error}`,
        "image-gen",
      );
      const message = error instanceof Error ? error.message : "Failed to generate image";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/enhance-logo-prompt", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "enhance-prompt", 10)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const { prompt, style } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const styleHint = style === "modern" ? " Lean towards modern, clean, minimalist aesthetics." :
                         style === "traditional" ? " Lean towards traditional, classic, timeless aesthetics." : "";

      const ga = await storage.getGlobalAssumptions(req.user?.id);
      const rc = (ga?.researchConfig as ResearchConfig) ?? {};
      const resolved = resolveLlm(rc, "aiUtilityLlm");
      const gemini = getGeminiClient();
      const startTime = Date.now();
      const response = await gemini.models.generateContent({
        model: resolved.model,
        contents: [{
          role: "user",
          parts: [{
            text: `You are a world-class logo design director. Enhance this logo description into a detailed, vivid prompt optimized for AI image generation. Keep it concise (2-3 sentences max). Focus on style, colors, composition, and mood.${styleHint} Output ONLY the enhanced prompt, nothing else.\n\nOriginal: ${prompt}`
          }]
        }],
      });

      const enhanced = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!enhanced) {
        throw new Error("No response from AI");
      }

      const svc = getVendorService(resolved.vendor);
      const inTok = response.usageMetadata?.promptTokenCount ?? Math.round(prompt.length / 4);
      const outTok = response.usageMetadata?.candidatesTokenCount ?? Math.round((enhanced?.length ?? 0) / 4);
      try { logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "enhance-logo-prompt", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/enhance-logo-prompt" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }

      res.json({ enhanced });
    } catch (error: unknown) {
      logger.error(`Error enhancing prompt: ${error instanceof Error ? error.message : error}`, "image-gen");
      const message = error instanceof Error ? error.message : "Failed to enhance prompt";
      res.status(500).json({ error: message });
    }
  });
}
