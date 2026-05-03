/**
 * page-visits.ts — Track user visits to pages with inputs/assumptions.
 *
 * Powers the intelligence-first experience:
 * - First visit detection (endorsed = false)
 * - Save tracking (endorsed = true after first save)
 * - Analyst run tracking (lastAnalystRunAt)
 * - Compulsory field gating
 */

import type { Express } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import { logger } from "../logger";

const visitBodySchema = z.object({
  entityType: z.string().max(100).optional(),
  entityId: z.coerce.number().int().positive().optional(),
}).optional().default({});

const saveBodySchema = z.object({
  compulsoryFieldsComplete: z.boolean().optional().default(false),
}).optional().default({});

export function register(app: Express) {
  // Get visit record for current user + page
  app.get("/api/page-visit/:pageKey", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const pageKey = decodeURIComponent(String(req.params.pageKey));
      const visit = await storage.getPageVisit(user.id, pageKey);
      res.json(visit);
    } catch (error: unknown) {
      logger.error(`Failed to get page visit: ${error instanceof Error ? error.message : error}`, "page-visits");
      res.status(500).json({ error: "Failed to get page visit" });
    }
  });

  // Record a page visit (upsert)
  app.post("/api/page-visit/:pageKey/visit", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const pageKey = decodeURIComponent(String(req.params.pageKey));
      const parsed = visitBodySchema.safeParse(req.body);
      const { entityType, entityId } = parsed.success ? parsed.data : {};
      const visit = await storage.recordVisit(user.id, pageKey, entityType, entityId);
      res.json(visit);
    } catch (error: unknown) {
      logger.error(`Failed to record visit: ${error instanceof Error ? error.message : error}`, "page-visits");
      res.status(500).json({ error: "Failed to record visit" });
    }
  });

  // Record a save (marks page as endorsed)
  app.post("/api/page-visit/:pageKey/save", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const pageKey = decodeURIComponent(String(req.params.pageKey));
      const parsed = saveBodySchema.safeParse(req.body);
      const compulsoryFieldsComplete = parsed.success ? parsed.data.compulsoryFieldsComplete : false;
      const visit = await storage.recordSave(user.id, pageKey, compulsoryFieldsComplete);
      res.json(visit);
    } catch (error: unknown) {
      logger.error(`Failed to record save: ${error instanceof Error ? error.message : error}`, "page-visits");
      res.status(500).json({ error: "Failed to record save" });
    }
  });

  // Record an Analyst run completion
  app.post("/api/page-visit/:pageKey/analyst-run", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const pageKey = decodeURIComponent(String(req.params.pageKey));
      const visit = await storage.recordAnalystRun(user.id, pageKey);
      res.json(visit);
    } catch (error: unknown) {
      logger.error(`Failed to record analyst run: ${error instanceof Error ? error.message : error}`, "page-visits");
      res.status(500).json({ error: "Failed to record analyst run" });
    }
  });
}
