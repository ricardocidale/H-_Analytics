/**
 * Admin Specialist identity routes (Task #482 split / Phase 3 #453).
 *
 *   GET    /api/admin/specialists/:id/identity
 *   PUT    /api/admin/specialists/:id/identity
 *   DELETE /api/admin/specialists/:id/identity
 *   GET    /api/admin/specialists/:id/identity/history
 *
 * Accepts the 12 catalog specialist ids AND the synthetic id "gaspar"
 * (the orchestrator). The catalog supplies factory defaults; the
 * override row in `specialist_identity_overrides` wins per-field when
 * present. Per-field nullability lets an admin override only humanName
 * (e.g. spelling change) while leaving gender at the catalog default.
 */
import type { Express } from "express";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logActivity, logAndSendError } from "../../helpers";
import {
  updateSpecialistIdentitySchema,
  type SpecialistIdentityPublicView,
} from "@shared/schema";
import {
  resolveSpecialistIdentity,
  type Gender,
} from "../../../../engine/analyst/identity";
import {
  idParamSchema,
  resetIdentityBodySchema,
  identityHistoryQuerySchema,
  getIdentityCatalogDefault,
} from "./_shared";

export function registerIdentityRoutes(app: Express) {
  app.get("/api/admin/specialists/:id/identity", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found" });
      const override = await storage.getIdentityOverride(id);
      const resolved = resolveSpecialistIdentity(catalog, override);
      const view: SpecialistIdentityPublicView = {
        specialistId: id,
        catalog,
        override: override
          ? {
              humanName: override.humanName,
              gender: override.gender,
              updatedByUserId: override.updatedByUserId,
              updatedAt: override.updatedAt.toISOString(),
            }
          : null,
        resolved,
      };
      res.json(view);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist identity", error);
    }
  });

  app.put("/api/admin/specialists/:id/identity", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found" });
      const parsed = updateSpecialistIdentitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const actorId = req.user!.id;
      const updated = await storage.upsertIdentityOverride(
        id,
        { humanName: parsed.data.humanName, gender: parsed.data.gender },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(
        req,
        "update-specialist-identity",
        "specialist_identity_override",
        null,
        `${id}: humanName=${parsed.data.humanName ?? "(default)"}, gender=${parsed.data.gender ?? "(default)"}`,
      );
      const resolved = resolveSpecialistIdentity(catalog, updated);
      const view: SpecialistIdentityPublicView = {
        specialistId: id,
        catalog,
        override: {
          humanName: updated.humanName,
          gender: updated.gender,
          updatedByUserId: updated.updatedByUserId,
          updatedAt: updated.updatedAt.toISOString(),
        },
        resolved,
      };
      res.json(view);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist identity", error);
    }
  });

  app.delete("/api/admin/specialists/:id/identity", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found" });
      // Body is optional — admins reset by clicking "Restore default" with
      // no payload. When present, only `changeSummary` is accepted.
      const parsedBody = resetIdentityBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ error: fromZodError(parsedBody.error).message });
      }
      const actorId = req.user!.id;
      await storage.resetIdentityOverride(id, actorId, parsedBody.data.changeSummary);
      logActivity(req, "reset-specialist-identity", "specialist_identity_override", null, id);
      const resolved = resolveSpecialistIdentity(catalog, null);
      const view: SpecialistIdentityPublicView = {
        specialistId: id,
        catalog,
        override: null,
        resolved,
      };
      res.json(view);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reset specialist identity", error);
    }
  });

  app.get("/api/admin/specialists/:id/identity/history", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found" });
      const parsedQuery = identityHistoryQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({ error: fromZodError(parsedQuery.error).message });
      }
      const limit = parsedQuery.data.limit ?? 50;
      const rows = await storage.listIdentityOverrideHistory(id, limit);
      res.json(
        rows.map((r) => ({
          id: r.id,
          action: r.action,
          prevHumanName: r.prevHumanName,
          prevGender: r.prevGender as Gender | null,
          nextHumanName: r.nextHumanName,
          nextGender: r.nextGender as Gender | null,
          changeSummary: r.changeSummary,
          changedByUserId: r.changedByUserId,
          changedAt: r.changedAt.toISOString(),
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist identity history", error);
    }
  });
}
