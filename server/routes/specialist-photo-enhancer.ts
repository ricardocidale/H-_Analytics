import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin, isApiRateLimited, getAuthUser } from "../auth";
import { getAdminRateLimit } from "../integrations/replicate";
import { storage } from "../storage";
import { loggerFor } from "../logger";
import { getSpecialistById } from "../../engine/analyst/registry/specialist-catalog";
import {
  PHOTO_ENHANCER_SPECIALIST_ID,
  PHOTO_ENHANCER_STYLES,
  PhotoEnhancerStyleDisabledError,
  PhotoEnhancerInvalidSourceUrlError,
  runPhotoEnhancerPipeline,
} from "../services/photo-enhancer-pipeline";

// Fernanda's render pipeline. Single funnel for every Replicate-style
// render — both the per-property album button and the specialist
// console POST here delegate to `runPhotoEnhancerPipeline` so prompt
// config, rate limits, SSRF guard, research_runs writes, and the call
// log stay shared. Catalog entry: photos.photo-enhancer.

// Log key derived from the catalog so the persona can be renamed in
// one place without desyncing the prefix.
const fernandaLog = loggerFor(
  getSpecialistById(PHOTO_ENHANCER_SPECIALIST_ID)?.humanName ?? "specialist",
);

const runSchema = z.object({
  prompt: z.string().optional().default(""),
  style: z.enum(PHOTO_ENHANCER_STYLES).optional().default("standard"),
  beforeImageUrl: z.string().min(1).optional(),
  propertyId: z.number().int().positive().optional(),
  originatedFrom: z.enum(["album", "specialist-page"]).optional().default("specialist-page"),
});

export function register(app: Express): void {
  app.post("/api/specialists/photo-enhancer/run", requireAdmin, async (req: Request, res: Response) => {
    const userId = getAuthUser(req).id;
    try {
      const rateLimit = await getAdminRateLimit();
      // Shared key with /api/generate-image and /api/generate-property-image
      // so users can't bypass the cap by switching between the album, the
      // legacy endpoint, and the specialist console.
      if (isApiRateLimited(userId, "generate-image", rateLimit)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const parsed = runSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      }
      const { prompt, style, beforeImageUrl, propertyId, originatedFrom } = parsed.data;

      const result = await runPhotoEnhancerPipeline({
        userId,
        prompt,
        style,
        beforeImageUrl,
        propertyId,
        originatedFrom,
        route: "/api/specialists/photo-enhancer/run",
      });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof PhotoEnhancerStyleDisabledError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof PhotoEnhancerInvalidSourceUrlError) {
        return res.status(400).json({ error: error.message });
      }
      fernandaLog.error(
        `Error running photos-and-renders specialist: ${error instanceof Error ? error.message : error}`,
      );
      const message = error instanceof Error ? error.message : "Failed to generate image";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/specialists/photo-enhancer/calls", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
      const runs = await storage.getResearchRunsForSpecialist(PHOTO_ENHANCER_SPECIALIST_ID, limit);
      res.json({
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
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
