import { type Express } from "express";
import { requireAdmin } from "../../auth";
import { updateServiceTemplateSchema, insertServiceTemplateSchema } from "@workspace/db";
import { storage } from "../../storage";
import { invalidateComputeCache } from "../../finance/cache";
import { logAndSendError, logActivity, parseParamId, zodErrorMessage } from "../helpers";

export function registerServiceRoutes(app: Express) {
  // ────────────────────────────────────────────────────────────
  // ADMIN: CENTRALIZED SERVICE TEMPLATES
  // CRUD for company service templates. Controls which services
  // the management company provides and their cost-plus markup.
  // ────────────────────────────────────────────────────────────

  app.get("/api/admin/service-templates", requireAdmin, async (_req, res) => {
    try {
      const templates = await storage.getAllServiceTemplates();
      res.json(templates);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch service templates", error, "ASVC-001");
    }
  });

  app.post("/api/admin/service-templates", requireAdmin, async (req, res) => {
    try {
      const validation = insertServiceTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }
      const template = await storage.createServiceTemplate(validation.data);
      invalidateComputeCache();
      logActivity(req, "create-service-template", "service-template", template.id, template.name);
      res.status(201).json(template);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create service template", error, "ASVC-002");
    }
  });

  app.patch("/api/admin/service-templates/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "template ID");
      if (id === null) return;

      const validation = updateServiceTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }

      const template = await storage.updateServiceTemplate(id, validation.data);
      if (!template) return res.status(404).json({ error: "Service template not found", code: "ASVC-006" });
      invalidateComputeCache();
      logActivity(req, "update-service-template", "service-template", id, template.name);
      res.json(template);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update service template", error, "ASVC-003");
    }
  });

  app.delete("/api/admin/service-templates/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "template ID");
      if (id === null) return;

      const existing = await storage.getServiceTemplate(id);
      if (!existing) return res.status(404).json({ error: "Service template not found", code: "ASVC-007" });

      await storage.deleteServiceTemplate(id);
      invalidateComputeCache();
      logActivity(req, "delete-service-template", "service-template", id, existing.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete service template", error, "ASVC-004");
    }
  });

  app.post("/api/admin/service-templates/sync", requireAdmin, async (_req, res) => {
    try {
      const result = await storage.syncTemplatesToProperties();
      invalidateComputeCache();
      res.json({
        message: `Sync complete: ${result.created} fee categories created, ${result.skipped} already existed`,
        ...result,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to sync service templates to properties", error, "ASVC-005");
    }
  });
}
