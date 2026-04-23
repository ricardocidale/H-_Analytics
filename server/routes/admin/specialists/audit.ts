/**
 * Admin Specialist audit (config version history) route (Task #482 split).
 *
 *   GET /api/admin/specialists/:id/audit
 *
 * Read-only history of `specialist_configs` snapshots — separated from the
 * mutating sub-routers so its bounded query/projection is easy to scan.
 */
import type { Express } from "express";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logAndSendError } from "../../helpers";
import { getSpecialistById } from "../../../../engine/analyst/registry/specialist-catalog";
import { idParamSchema } from "./_shared";

export function registerAuditRoutes(app: Express) {
  app.get("/api/admin/specialists/:id/audit", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const versions = await storage.listSpecialistConfigVersions(id, limit);
      res.json(
        versions.map((v) => ({
          id: v.id,
          version: v.version,
          section: v.section,
          changeSummary: v.changeSummary,
          changedByUserId: v.changedByUserId,
          changedAt: v.changedAt.toISOString(),
          // Snapshot fields from the PRE-edit state (the version row records
          // what was just replaced); useful for "diff against latest" UI.
          promptTemplate: v.promptTemplate,
          modelResourceId: v.modelResourceId,
          requiredFields: v.requiredFields,
          fieldRequirements: v.fieldRequirements,
          prerequisiteToggles: v.prerequisiteToggles,
          runtimeConfig: v.runtimeConfig,
          refreshCadenceDays: v.refreshCadenceDays,
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist audit history", error);
    }
  });
}
