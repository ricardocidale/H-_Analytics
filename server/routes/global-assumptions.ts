import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManagementAccess, requireAdmin , getAuthUser } from "../auth";
import { insertGlobalAssumptionsSchema, updateServiceTemplateSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logActivity, logAndSendError, parseParamId } from "./helpers";
import { z } from "zod";
import { invalidateComputeCache } from "../finance/cache";
import { flag } from "../feature-flags";

const appearanceDefaultsSchema = z.object({
  defaultColorMode: z.enum(["light", "auto", "dark"]).nullable().optional(),
  defaultBgAnimation: z.enum(["enabled", "auto", "disabled"]).nullable().optional(),
  defaultFontPreference: z.enum(["default", "sans", "system", "dyslexic"]).nullable().optional(),
});

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // GLOBAL ASSUMPTIONS
  // The "Settings" page: financial model parameters, company info, feature toggles.
  // PUT uses upsert logic (creates on first save, updates thereafter).
  // ────────────────────────────────────────────────────────────

  app.get("/api/global-assumptions", requireAuth, async (req, res) => {
    try {
      const assumptions = await storage.getGlobalAssumptions(getAuthUser(req).id);
      res.json({ ...assumptions, rebeccaV2: flag("REBECCA_V2"), adminIntelV2: flag("ADMIN_INTEL_V2") });
    } catch (error) {
      logAndSendError(res, "Failed to fetch global assumptions", error);
    }
  });

  // PATCH — partial updates for admin-configurable subsections (e.g. Rebecca config)
  const rebeccaPatchSchema = z.object({
    rebeccaEnabled: z.boolean().optional(),
    rebeccaDisplayName: z.string().min(1).max(50).optional(),
    rebeccaSystemPrompt: z.string().max(5000).nullable().optional(),
    rebeccaChatEngine: z.enum(["gemini", "perplexity"]).optional(),
  });

  app.patch("/api/global-assumptions", requireAdmin, async (req, res) => {
    try {
      const validation = rebeccaPatchSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found" });
      }
      const patch: Record<string, unknown> = { ...validation.data, updatedAt: new Date() };
      const updated = await storage.patchGlobalAssumptions(current.id, patch);
      logActivity(req, "update", "global_assumptions", updated.id, "Rebecca Config");
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to update global assumptions", error);
    }
  });

  app.put("/api/global-assumptions", requireAdmin, async (req, res) => {
    try {
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      const merged = { ...(current ?? {}), ...req.body };
      delete merged.id;
      delete merged.createdAt;
      delete merged.updatedAt;
      delete merged.companyLogoUrl;

      const validation = insertGlobalAssumptionsSchema.safeParse(merged);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      
      const assumptions = await storage.upsertGlobalAssumptions(validation.data, getAuthUser(req).id);
      invalidateComputeCache();
      logActivity(req, "update", "global_assumptions", assumptions.id, "System Settings");
      res.json(assumptions);
    } catch (error) {
      logAndSendError(res, "Failed to update global assumptions", error);
    }
  });

  app.get("/api/appearance-defaults", requireAuth, async (req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      res.json({
        defaultColorMode: ga?.defaultColorMode ?? null,
        defaultBgAnimation: ga?.defaultBgAnimation ?? null,
        defaultFontPreference: ga?.defaultFontPreference ?? null,
      });
    } catch (error) {
      logAndSendError(res, "Failed to fetch appearance defaults", error);
    }
  });

  app.patch("/api/appearance-defaults", requireAdmin, async (req, res) => {
    try {
      const validation = appearanceDefaultsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found" });
      }
      const patch: Record<string, unknown> = {};
      if (validation.data.defaultColorMode !== undefined) patch.defaultColorMode = validation.data.defaultColorMode;
      if (validation.data.defaultBgAnimation !== undefined) patch.defaultBgAnimation = validation.data.defaultBgAnimation;
      if (validation.data.defaultFontPreference !== undefined) patch.defaultFontPreference = validation.data.defaultFontPreference;
      const updated = await storage.patchGlobalAssumptions(current.id, patch);
      logActivity(req, "update", "global_assumptions", updated.id, "Appearance Defaults");
      res.json({
        defaultColorMode: updated.defaultColorMode ?? null,
        defaultBgAnimation: updated.defaultBgAnimation ?? null,
        defaultFontPreference: updated.defaultFontPreference ?? null,
      });
    } catch (error) {
      logAndSendError(res, "Failed to update appearance defaults", error);
    }
  });

  app.get("/api/company/service-templates", requireManagementAccess, async (_req, res) => {
    try {
      const templates = await storage.getAllServiceTemplates();
      res.json(templates);
    } catch (error) {
      logAndSendError(res, "Failed to fetch service templates", error);
    }
  });

  app.patch("/api/company/service-templates/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "template ID");
      if (id === null) return;

      const validation = updateServiceTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const template = await storage.updateServiceTemplate(id, validation.data);
      if (!template) return res.status(404).json({ error: "Service template not found" });
      logActivity(req, "update-service-template", "service-template", id, template.name);
      res.json(template);
    } catch (error) {
      logAndSendError(res, "Failed to update service template", error);
    }
  });
}
