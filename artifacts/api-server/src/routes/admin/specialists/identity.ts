/**
 * Admin Specialist identity routes (Task #482 split / Phase 3 #453).
 *
 *   GET    /api/admin/specialists/:id/identity
 *   PUT    /api/admin/specialists/:id/identity
 *   DELETE /api/admin/specialists/:id/identity
 *   GET    /api/admin/specialists/:id/identity/history
 *
 * Accepts the 12 catalog specialist ids AND the synthetic orchestrator id
 * (the orchestrator). The catalog supplies factory defaults; the
 * override row in `specialist_identity_overrides` wins per-field when
 * present. Per-field nullability lets an admin override only humanName
 * (e.g. spelling change) while leaving gender at the catalog default.
 */
import type { Express } from "express";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logAndSendError, zodErrorMessage } from "../../helpers";
import {
  type SpecialistIdentityPublicView,
} from "@workspace/db";
import {
  resolveSpecialistIdentity,
  type Gender,
} from "@engine/analyst/identity";
import {
  idParamSchema,
  identityHistoryQuerySchema,
  getIdentityCatalogDefault,
} from "./_shared";
import { HTTP_405_METHOD_NOT_ALLOWED } from "../../../constants";

export function registerIdentityRoutes(app: Express) {
  app.get("/api/admin/specialists/:id/identity", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found", code: "ASID-003" });
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
      logAndSendError(res, "Failed to load specialist identity", error, "ASID-001");
    }
  });

  // Disabled: IdentityTab is now read-only per specialists-are-dev-defined-only.md §3.2.
  // UI no longer calls this endpoint. Kept as 405 so any direct API callers get an
  // explicit signal rather than a silent hang.
  app.put("/api/admin/specialists/:id/identity", requireAdmin, (_req, res) => {
    res.status(HTTP_405_METHOD_NOT_ALLOWED).json({ error: "Specialist identity is dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md", code: "ASID-004" });
  });

  app.delete("/api/admin/specialists/:id/identity", requireAdmin, (_req, res) => {
    res.status(HTTP_405_METHOD_NOT_ALLOWED).json({ error: "Specialist identity is dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md", code: "ASID-005" });
  });

  app.get("/api/admin/specialists/:id/identity/history", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const catalog = getIdentityCatalogDefault(id);
      if (!catalog) return res.status(404).json({ error: "Specialist not found", code: "ASID-006" });
      const parsedQuery = identityHistoryQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({ error: zodErrorMessage(parsedQuery.error) });
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
      logAndSendError(res, "Failed to load specialist identity history", error, "ASID-002");
    }
  });
}
