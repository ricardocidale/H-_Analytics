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
import { evaluatePhotoEnhancerSpecialist } from "../../engine/analyst/surface/photos/photo-enhancer-evaluator";

// Photos & Renders gallery payload — one row per past render. Fully derived
// from the research_runs metadata persisted by runPhotoEnhancerPipeline so
// the gallery survives across sessions and devices (the prior client-side
// localStorage approach would lose history when an admin switched browsers).
// Field names mirror the pipeline metadata keys to keep the contract
// inspectable end-to-end.
interface PhotoEnhancerGalleryRow {
  id: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  status: string;
  modelPrimary: string | null;
  entityType: string;
  entityId: number;
  error: string | null;
  // Surfaced gallery fields (also present in metadata for back-compat).
  prompt: string;
  style: string | null;
  finalStyle: string | null;
  sourceImageUrl: string | null;
  objectPath: string | null;
  propertyId: number | null;
  originatedFrom: string | null;
  usedFallback: boolean;
  // Admin attribution — null when the run pre-dates Task #432 (we started
  // recording userId on every pipeline run as part of this change). The UI
  // shows "Unknown admin" for those legacy rows rather than dropping them.
  userId: number | null;
  userDisplayName: string | null;
  metadata: Record<string, unknown> | null;
}

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

// `dispatch` is the engine-style batch entry point — admins target one or
// more properties in a single call. Capped to keep one click from saturating
// the shared `generate-image` rate-limit bucket; the scheduler honors the
// same ceiling via its runtime config.
const dispatchSchema = z.object({
  propertyIds: z.array(z.number().int().positive()).min(1).max(50),
  style: z.enum(PHOTO_ENHANCER_STYLES).optional().default("standard"),
  prompt: z.string().optional().default(""),
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

      // Honor admin-edited config from `specialist_configs` — promptTemplate
      // is layered onto the runtime prompt and the modelResourceId is
      // recorded into the research_runs metadata so the call log shows the
      // assignment that was in effect for this render.
      const config = await storage.getSpecialistConfig(PHOTO_ENHANCER_SPECIALIST_ID);

      const result = await runPhotoEnhancerPipeline({
        userId,
        prompt,
        style,
        beforeImageUrl,
        propertyId,
        originatedFrom,
        route: "/api/specialists/photo-enhancer/run",
        promptTemplate: config?.promptTemplate ?? "",
        modelResourceId: config?.modelResourceId ?? null,
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
      // Pagination guards: clamp `limit` to [1, 100] (the gallery is a
      // thumbnail grid, not a CSV dump) and `offset` to a non-negative
      // integer so a malformed query string can't crash the SQL builder.
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 100)
        : 24;
      const offsetRaw = Number(req.query.offset);
      const offset = Number.isFinite(offsetRaw) && offsetRaw > 0
        ? Math.floor(offsetRaw)
        : 0;

      // Fetch one page of runs plus the total so the client can render a
      // "Showing N of M" badge and a Load more button without a second
      // round-trip.
      const [runs, total] = await Promise.all([
        storage.getResearchRunsForSpecialist(PHOTO_ENHANCER_SPECIALIST_ID, limit, offset),
        storage.countResearchRunsForSpecialist(PHOTO_ENHANCER_SPECIALIST_ID),
      ]);

      // Resolve admin attribution in one batch instead of N+1 lookups —
      // the gallery typically shows the same admin many times in a row, and
      // a tight loop of getUserById would blow up the request latency for
      // a busy install. Falls back to "Unknown admin" for legacy rows that
      // pre-date the userId stamp added in Task #432.
      const uniqueUserIds = Array.from(new Set(
        runs.map((r) => r.userId).filter((id): id is number => typeof id === "number"),
      ));
      const userMap = new Map<number, string>();
      await Promise.all(uniqueUserIds.map(async (userId) => {
        const user = await storage.getUserById(userId);
        if (user) {
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
          userMap.set(userId, fullName || user.email || `User #${userId}`);
        }
      }));

      const galleryRows: PhotoEnhancerGalleryRow[] = runs.map((r) => {
        const md = (r.metadata ?? {}) as Record<string, unknown>;
        const promptVal = typeof md.prompt === "string" ? md.prompt : "";
        const styleVal = typeof md.style === "string" ? md.style : null;
        const finalStyleVal = typeof md.finalStyle === "string"
          ? md.finalStyle
          : (styleVal ?? null);
        const sourceImageUrl = typeof md.sourceImageUrl === "string" ? md.sourceImageUrl : null;
        const objectPath = typeof md.objectPath === "string" ? md.objectPath : null;
        const mdPropertyIdRaw = md.propertyId;
        const propertyId = typeof mdPropertyIdRaw === "number"
          ? mdPropertyIdRaw
          : (r.entityType === "property" && r.entityId > 0 ? r.entityId : null);
        const originatedFrom = typeof md.originatedFrom === "string" ? md.originatedFrom : null;
        const usedFallback = md.usedFallback === true;
        return {
          id: r.id,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
          status: r.status,
          modelPrimary: r.modelPrimary,
          entityType: r.entityType,
          entityId: r.entityId,
          error: r.error,
          prompt: promptVal,
          style: styleVal,
          finalStyle: finalStyleVal,
          sourceImageUrl,
          objectPath,
          propertyId,
          originatedFrom,
          usedFallback,
          userId: r.userId ?? null,
          userDisplayName: r.userId !== null && r.userId !== undefined
            ? (userMap.get(r.userId) ?? null)
            : null,
          metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        };
      });

      res.json({
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
        total,
        limit,
        offset,
        runs: galleryRows,
      });
    } catch (error: unknown) {
      fernandaLog.error(
        `Error listing photos-and-renders specialist calls: ${error instanceof Error ? error.message : error}`,
      );
      res.status(500).json({ error: "Failed to list specialist calls" });
    }
  });

  // Engine-style batch dispatch — same code path the scheduler uses, exposed
  // to admins so a Photos & Renders refresh across N properties can be
  // kicked off manually without authoring N individual /run calls.
  app.post(
    "/api/specialists/photo-enhancer/dispatch",
    requireAdmin,
    async (req: Request, res: Response) => {
      const userId = getAuthUser(req).id;
      try {
        const rateLimit = await getAdminRateLimit();
        if (isApiRateLimited(userId, "generate-image", rateLimit)) {
          return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
        }
        const parsed = dispatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
        }
        const { propertyIds, style, prompt } = parsed.data;
        const summary = await evaluatePhotoEnhancerSpecialist({
          userId,
          propertyIds,
          style,
          prompt,
          originatedFrom: "specialist-page",
          route: "/api/specialists/photo-enhancer/dispatch",
        });
        res.json(summary);
      } catch (error: unknown) {
        // Mirror /run: known user/config errors map to 400 even on the
        // batch path so dashboards and admins see the same failure shape
        // regardless of which endpoint they hit. Per-property style-
        // disabled / SSRF failures are normally absorbed into the summary
        // by the evaluator; this catch only fires when the failure is
        // pre-loop (e.g. config lookup throws) or applies to the whole
        // dispatch.
        if (error instanceof PhotoEnhancerStyleDisabledError) {
          return res.status(400).json({ error: error.message, style: error.style });
        }
        if (error instanceof PhotoEnhancerInvalidSourceUrlError) {
          return res.status(400).json({ error: error.message });
        }
        fernandaLog.error(
          `Error dispatching photos-and-renders batch: ${error instanceof Error ? error.message : error}`,
        );
        res.status(500).json({ error: error instanceof Error ? error.message : "Dispatch failed" });
      }
    },
  );
}
