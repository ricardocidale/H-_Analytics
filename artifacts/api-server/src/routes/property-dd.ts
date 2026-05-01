/**
 * Hospitality Due-Diligence routes (Task #811).
 *
 * Endpoints:
 *   GET   /api/properties/:id/dd        — items + summary for a property
 *   POST  /api/properties/:id/dd/seed   — seed missing template rows
 *   PATCH /api/properties/:id/dd/:itemId — edit a per-property item
 *   POST  /api/properties/:id/dd/analyst-review — trigger Analyst pass
 *
 *   GET   /api/dd-template              — read-only template (any user)
 *   GET   /api/admin/dd-template        — admin-edited template rows
 *   PATCH /api/admin/dd-template/:id    — edit a template row
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, checkPropertyAccess, getAuthUser } from "../auth";
import { fromZodError } from "zod-validation-error/v3";
import { logActivity, logAndSendError, parseRouteId, sendError } from "./helpers";
import { logger } from "../logger";
import {
  updatePropertyDdItemSchema,
  updateDdTemplateItemSchema,
} from "@workspace/db";

export function register(app: Express) {
  // --- Per-property DD ---

  app.get("/api/properties/:id/dd", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return sendError(res, 400, "Invalid property id");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied");
      }

      // Auto-seed on first read so the tab renders the canonical checklist
      // without a separate "create" action.
      const items = await storage.seedPropertyDdItems(propertyId);
      const summary = await storage.getPropertyDdSummary(propertyId);
      res.json({ items, summary });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to load DD checklist", err, "property-dd");
    }
  });

  app.post("/api/properties/:id/dd/seed", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return sendError(res, 400, "Invalid property id");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied");
      }
      const items = await storage.seedPropertyDdItems(propertyId);
      const summary = await storage.getPropertyDdSummary(propertyId);
      logActivity(req, "dd:seed", "property", propertyId, null, { count: items.length });
      res.json({ items, summary });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to seed DD checklist", err, "property-dd");
    }
  });

  app.patch("/api/properties/:id/dd/:itemId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const itemId = parseRouteId(req.params.itemId);
      if (!propertyId || !itemId) return sendError(res, 400, "Invalid id");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied");
      }

      const existing = await storage.getPropertyDdItemById(itemId);
      if (!existing) return sendError(res, 404, "DD item not found");
      if (existing.propertyId !== propertyId) {
        return sendError(res, 404, "DD item not found");
      }

      const parsed = updatePropertyDdItemSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, fromZodError(parsed.error as any).message);

      const row = await storage.updatePropertyDdItem(itemId, parsed.data);
      const summary = await storage.getPropertyDdSummary(propertyId);
      logActivity(req, "dd:update", "property", propertyId, null, { itemId, fields: Object.keys(parsed.data) });
      res.json({ item: row, summary });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to update DD item", err, "property-dd");
    }
  });

  app.post("/api/properties/:id/dd/analyst-review", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return sendError(res, 400, "Invalid property id");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied");
      }

      const summary = await storage.getPropertyDdSummary(propertyId);
      // The Analyst review is intentionally a structured rollup of open
      // findings; the LLM call lives in the Risk Specialist (Task #801) and
      // is invoked separately. This endpoint produces the deterministic
      // payload the Risk Specialist consumes and that Acquisition Export
      // pulls into the deal memo.
      const payload = {
        propertyId,
        generatedAt: new Date().toISOString(),
        goIndicator: summary.goIndicator,
        goReason: summary.goReason,
        openFindings: summary.openFindings,
        workstreamRollup: summary.workstreams,
        budgetTotal: summary.budgetTotal,
        spendCommitted: summary.spendCommitted,
      };
      logActivity(req, "dd:analyst-review", "property", propertyId, null, {
        openFindings: summary.openFindings.length,
        goIndicator: summary.goIndicator,
      });
      logger.info(
        `DD analyst review for property ${propertyId}: ${summary.goIndicator} (${summary.openFindings.length} open findings)`,
        "property-dd",
      );
      res.json(payload);
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to run DD analyst review", err, "property-dd");
    }
  });

  // --- Read-only template (any authenticated user) ---
  // Used by surfaces that preview the canonical checklist on targets that
  // don't yet have a property record (Property Finder), so the preview
  // reflects admin edits to the template, not just the code defaults.
  app.get("/api/dd-template", requireAuth, async (_req, res) => {
    try {
      const items = await storage.getDdTemplate();
      res.json({ items });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to load DD template", err, "property-dd");
    }
  });

  // --- Admin: edit DD template ---

  app.get("/api/admin/dd-template", requireAdmin, async (_req, res) => {
    try {
      const items = await storage.getDdTemplate();
      res.json({ items });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to load DD template", err, "property-dd");
    }
  });

  app.patch("/api/admin/dd-template/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return sendError(res, 400, "Invalid id");
      const parsed = updateDdTemplateItemSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, fromZodError(parsed.error as any).message);
      const row = await storage.updateDdTemplateItem(id, parsed.data);
      if (!row) return sendError(res, 404, "Template item not found");
      logActivity(req, "dd:template:update", "dd-template", id, null, { fields: Object.keys(parsed.data) });
      res.json({ item: row });
    } catch (err: unknown) {
      return logAndSendError(res, "Failed to update DD template item", err, "property-dd");
    }
  });
}
