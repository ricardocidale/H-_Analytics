import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin, isApiRateLimited, getAuthUser } from "../auth";
import { getStorageProvider } from "../providers/storage";
import {
  replicateService,
  isStyleEnabled,
  getAdminRateLimit,
  getDefaultImageSize,
  type ReplicateStyleKey,
} from "../integrations/replicate";
import { generateImageBuffer } from "../replit_integrations/image/client";
import { logApiCost, unitCost } from "../middleware/cost-logger";
import { storage } from "../storage";
import { logger, loggerFor } from "../logger";
import { getSpecialistById } from "../../engine/analyst/registry/specialist-catalog";

// Single funnel for every Replicate-style render. Both the per-property
// album button and the specialist console POST here so prompt config,
// rate limits, and the call log are shared. The render pipeline is owned
// by Fernanda (`photos.photo-enhancer`) — see
// engine/analyst/registry/specialist-catalog.ts for the catalog entry.
// Route paths keep the legacy `/photos-and-renders` slug so the album
// button (client/src/features/property-images/useGenerateImage.ts) keeps
// working without a frontend change.
const SPECIALIST_ID = "photos.photo-enhancer";

// Route-level errors narrate under Fernanda's persona name, derived
// from the catalog so the persona can be renamed in one place without
// desyncing the log prefix. Nested cost-logger try/catches keep their
// `cost-logger` source — those failures belong to the cost middleware,
// not Fernanda's job.
const fernandaLog = loggerFor(
  getSpecialistById(SPECIALIST_ID)?.humanName ?? "specialist",
);

const runSchema = z.object({
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
  propertyId: z.number().int().positive().optional(),
  originatedFrom: z.enum(["album", "specialist-page"]).optional().default("specialist-page"),
});

export function register(app: Express): void {
  app.post("/api/specialists/photos-and-renders/run", requireAdmin, async (req: Request, res: Response) => {
    const userId = getAuthUser(req).id;
    try {
      const rateLimit = await getAdminRateLimit();
      // Shared key with /api/generate-image so users can't bypass the cap by
      // switching between the album and the specialist page.
      if (isApiRateLimited(userId, "generate-image", rateLimit)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const parsed = runSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      }
      const { prompt, style, beforeImageUrl, propertyId, originatedFrom } = parsed.data;

      if (style && style !== "standard") {
        const enabled = await isStyleEnabled(style);
        if (!enabled) {
          return res.status(400).json({ error: `Style "${style}" is currently disabled by admin` });
        }
      }

      const isReplicateStyle = style && style !== "standard";
      const adminSize = (await getDefaultImageSize()) as "1024x1024" | "1024x1536" | "1536x1024" | "auto";

      const startedAt = Date.now();
      const runRecord = await storage.createResearchRun({
        entityType: propertyId ? "property" : "specialist-run",
        entityId: propertyId ?? 0,
        tier: 1,
        status: "running",
        modelPrimary: isReplicateStyle ? `replicate:${style}` : "openai:gpt-image-1",
        metadata: {
          specialistId: SPECIALIST_ID,
          style,
          propertyId: propertyId ?? null,
          originatedFrom,
          hasSourcePhoto: !!beforeImageUrl,
        },
      });

      let imageBuffer: Buffer;
      let usedFallback = false;
      try {
        if (isReplicateStyle) {
          try {
            imageBuffer = await replicateService.generateImage(
              style as ReplicateStyleKey,
              prompt,
              beforeImageUrl,
            );
            try { logApiCost({ timestamp: new Date().toISOString(), service: "replicate", model: style, operation: "image-gen", estimatedCostUsd: unitCost("replicate-image"), durationMs: Date.now() - startedAt, userId, route: "/api/specialists/photos-and-renders/run" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
          } catch (replicateError: unknown) {
            logger.warn(
              `Replicate generation failed, falling back: ${replicateError instanceof Error ? replicateError.message : replicateError}`,
              "specialist-photos-renders",
            );
            imageBuffer = await generateImageBuffer(prompt, adminSize);
            usedFallback = true;
            try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: "gpt-image-1", operation: "image-gen-fallback", estimatedCostUsd: unitCost("gpt-image-1"), durationMs: Date.now() - startedAt, userId, route: "/api/specialists/photos-and-renders/run" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
          }
        } else {
          imageBuffer = await generateImageBuffer(prompt, adminSize);
          try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model: "gpt-image-1", operation: "image-gen", estimatedCostUsd: unitCost("gpt-image-1"), durationMs: Date.now() - startedAt, userId, route: "/api/specialists/photos-and-renders/run" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
        }
      } catch (genError: unknown) {
        const message = genError instanceof Error ? genError.message : "Image generation failed";
        await storage.updateResearchRun(runRecord.id, {
          status: "failed",
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: message.slice(0, 1000),
        });
        throw genError;
      }

      let objectPath: string;
      const finalStyle = usedFallback ? "standard" : (style || "standard");
      try {
        const storageProvider = getStorageProvider();
        objectPath = await storageProvider.uploadBuffer(
          `generated/${Date.now()}`,
          imageBuffer,
          "image/png",
        );

        await storage.updateResearchRun(runRecord.id, {
          status: "completed",
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          metadata: {
            specialistId: SPECIALIST_ID,
            style,
            finalStyle,
            propertyId: propertyId ?? null,
            originatedFrom,
            hasSourcePhoto: !!beforeImageUrl,
            usedFallback,
            objectPath,
          },
        });
      } catch (postError: unknown) {
        const message = postError instanceof Error ? postError.message : "Post-generation failure";
        await storage.updateResearchRun(runRecord.id, {
          status: "failed",
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: message.slice(0, 1000),
        }).catch(() => undefined);
        throw postError;
      }

      res.json({
        objectPath,
        imageData: imageBuffer.toString("base64"),
        isAiGenerated: true,
        style: finalStyle,
        usedFallback,
        fallbackNotice: usedFallback ? "Using standard generation — specialized rendering unavailable" : undefined,
        specialistRunId: runRecord.id,
      });
    } catch (error: unknown) {
      fernandaLog.error(
        `Error running photos-and-renders specialist: ${error instanceof Error ? error.message : error}`,
      );
      const message = error instanceof Error ? error.message : "Failed to generate image";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/specialists/photos-and-renders/calls", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
      const runs = await storage.getResearchRunsForSpecialist(SPECIALIST_ID, limit);
      res.json({
        specialistId: SPECIALIST_ID,
        runs: runs.map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
          status: r.status,
          modelPrimary: r.modelPrimary,
          entityType: r.entityType,
          entityId: r.entityId,
          error: r.error,
          metadata: r.metadata,
        })),
      });
    } catch (error: unknown) {
      fernandaLog.error(
        `Error listing photos-and-renders specialist calls: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: "Failed to list specialist calls" });
    }
  });
}
