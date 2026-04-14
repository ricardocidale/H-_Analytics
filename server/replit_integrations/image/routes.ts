import type { Express, Request, Response } from "express";
import { openai, generateImageBuffer, getGeminiClient } from "./client";
import { requireAuth, isApiRateLimited, getAuthUser } from "../../auth";
import { getStorageProvider } from "../../providers/storage";
import { replicateService, getAvailableStyles, type ReplicateStyleKey } from "../../integrations/replicate";
import { z } from "zod";
import { logApiCost, estimateCost, unitCost } from "../../middleware/cost-logger";
import { storage } from "../../storage";
import { resolveLlm, getVendorService } from "../../ai/resolve-llm";
import type { ResearchConfig } from "@shared/schema";
import { logger } from "../../logger";

const generatePropertyImageSchema = z.object({
  prompt: z.string().optional().default(""),
  style: z.enum([
    "standard",
    "architectural-exterior",
    "interior-design",
    "renovation-concept",
    "photo-upscale",
    "virtual-staging",
    "background-remove",
    "photo-to-render",
  ]).optional().default("standard"),
  beforeImageUrl: z.string().min(1).optional(),
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
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: size as "1024x1024" | "512x512" | "256x256",
      });

      try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: "gpt-image-1", operation: "image-gen", estimatedCostUsd: unitCost("gpt-image-1"), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/generate-image" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }

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
      const styles = getAvailableStyles();
      res.json({ styles });
    } catch (error: unknown) {
      logger.error(`Error fetching Replicate styles: ${error instanceof Error ? error.message : error}`, "image-gen");
      res.status(500).json({ error: "Failed to fetch available styles" });
    }
  });

  app.post("/api/generate-property-image", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "generate-image", 5)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const parsed = generatePropertyImageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      }
      const { prompt, style, beforeImageUrl } = parsed.data;

      const isReplicateStyle = style && style !== "standard";
      let imageBuffer: Buffer;
      let usedFallback = false;

      const startTime = Date.now();
      if (isReplicateStyle) {
        try {
          imageBuffer = await replicateService.generateImage(
            style as ReplicateStyleKey,
            prompt,
            beforeImageUrl
          );
          try { logApiCost({ timestamp: new Date().toISOString(), service: "replicate", model: style, operation: "image-gen", estimatedCostUsd: unitCost("replicate-image"), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/generate-property-image" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
        } catch (replicateError: unknown) {
          logger.warn(
            `Replicate generation failed, falling back to standard: ${replicateError instanceof Error ? replicateError.message : replicateError}`,
            "image-gen"
          );
          imageBuffer = await generateImageBuffer(prompt, "1024x1024");
          usedFallback = true;
          try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: "gpt-image-1", operation: "image-gen-fallback", estimatedCostUsd: unitCost("gpt-image-1"), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/generate-property-image" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
        }
      } else {
        imageBuffer = await generateImageBuffer(prompt, "1024x1024");
        try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: "gpt-image-1", operation: "image-gen", estimatedCostUsd: unitCost("gpt-image-1"), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/generate-property-image" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
      }

      const storageProvider = getStorageProvider();
      const objectPath = await storageProvider.uploadBuffer(
        `generated/${Date.now()}`,
        imageBuffer,
        "image/png",
      );

      // Include base64 so callers can persist the image binary in Neon PostgreSQL
      // via the imageData field on property_photos (storage-independent persistence).
      const imageDataBase64 = imageBuffer.toString("base64");

      res.json({
        objectPath,
        imageData: imageDataBase64,
        isAiGenerated: true,
        style: usedFallback ? "standard" : (style || "standard"),
        usedFallback,
        fallbackNotice: usedFallback ? "Using standard generation — specialized rendering unavailable" : undefined,
      });
    } catch (error: unknown) {
      logger.error(`Error generating property image: ${error instanceof Error ? error.message : error}`, "image-gen");
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
