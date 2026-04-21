/**
 * Admin Resources REST surface (P2).
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Doctrine: replit.md "Resources sidebar section (NEW, canonical SoT)" block.
 *
 * Routes:
 *   GET    /api/admin/resources?kind=api          — list (optionally filtered)
 *   GET    /api/admin/resources/:id               — detail
 *   POST   /api/admin/resources                   — create (returns full view)
 *   PUT    /api/admin/resources/:id               — versioned edit + impact
 *   POST   /api/admin/resources/:id/rollback      — restore a past version
 *   DELETE /api/admin/resources/:id               — delete
 *   GET    /api/admin/resources/:id/versions      — version history
 *   GET    /api/admin/resources/:id/impact        — Specialists wired here
 *   POST   /api/admin/specialist-catalog/sync     — re-run materialization
 *
 * Break-glass surface (super-admin only):
 *   GET    /api/admin/break-glass-overrides
 *   POST   /api/admin/break-glass-overrides
 *   POST   /api/admin/break-glass-overrides/:id/revoke
 *
 * Every Resource ever returned to a client goes through `toResourcePublicView`
 * so `secret_ref` (a key-name into the project secret store) cannot leak.
 */
import type { Express } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../storage";
import { requireAdmin, requireSuperAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import {
  ResourceKindSchema,
  ResourceSlugSchema,
  insertAdminResourceSchema,
  insertBreakGlassOverrideSchema,
  toResourcePublicView,
} from "@shared/schema";
import { syncSpecialistCatalog } from "../../jobs/catalog-sync";

const updateResourceSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secretRef: z.string().min(1).nullable().optional(),
  changeSummary: z.string().min(1).optional(),
});

const rollbackSchema = z.object({
  targetVersion: z.number().int().min(1),
});

const listQuerySchema = z.object({
  kind: ResourceKindSchema.optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function registerAdminResourceRoutes(app: Express) {
  // ── List ────────────────────────────────────────────────────────
  app.get("/api/admin/resources", requireAdmin, async (req, res) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const rows = await storage.listAdminResources(parsed.data.kind);
      res.json(rows.map(toResourcePublicView));
    } catch (error) {
      logAndSendError(res, "Failed to list admin resources", error);
    }
  });

  // ── Detail ──────────────────────────────────────────────────────
  app.get("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(404).json({ error: "Resource not found" });
      res.json(toResourcePublicView(row));
    } catch (error) {
      logAndSendError(res, "Failed to fetch admin resource", error);
    }
  });

  // ── Create ──────────────────────────────────────────────────────
  app.post("/api/admin/resources", requireAdmin, async (req, res) => {
    try {
      const parsed = insertAdminResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      // Reject duplicates explicitly (cleaner than catching the unique-index error).
      const existing = await storage.getAdminResourceBySlug(parsed.data.kind, parsed.data.slug);
      if (existing) {
        return res.status(409).json({ error: `Resource ${parsed.data.kind}/${parsed.data.slug} already exists` });
      }
      const actorId = req.user!.id;
      const row = await storage.createAdminResource(parsed.data, actorId);
      logActivity(req, "create-admin-resource", "admin_resource", row.id, `${row.kind}/${row.slug}`);
      res.status(201).json(toResourcePublicView(row));
    } catch (error) {
      logAndSendError(res, "Failed to create admin resource", error);
    }
  });

  // ── Update (versioned, returns impact list) ────────────────────
  app.put("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = updateResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const actorId = req.user!.id;
      const row = await storage.updateAdminResource(id, parsed.data, actorId);
      if (!row) return res.status(404).json({ error: "Resource not found" });
      const impact = await storage.listResourceImpact(id);
      logActivity(req, "update-admin-resource", "admin_resource", id, `v${row.version}`);
      res.json({ resource: toResourcePublicView(row), impact });
    } catch (error) {
      logAndSendError(res, "Failed to update admin resource", error);
    }
  });

  // ── Rollback ────────────────────────────────────────────────────
  app.post("/api/admin/resources/:id/rollback", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = rollbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const actorId = req.user!.id;
      const row = await storage.rollbackAdminResource(id, parsed.data.targetVersion, actorId);
      if (!row) {
        return res.status(404).json({ error: "Resource or target version not found" });
      }
      logActivity(req, "rollback-admin-resource", "admin_resource", id, `to v${parsed.data.targetVersion}`);
      res.json(toResourcePublicView(row));
    } catch (error) {
      logAndSendError(res, "Failed to rollback admin resource", error);
    }
  });

  // ── Delete ──────────────────────────────────────────────────────
  app.delete("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const ok = await storage.deleteAdminResource(id);
      if (!ok) return res.status(404).json({ error: "Resource not found" });
      logActivity(req, "delete-admin-resource", "admin_resource", id);
      res.status(204).end();
    } catch (error) {
      logAndSendError(res, "Failed to delete admin resource", error);
    }
  });

  // ── Versions ────────────────────────────────────────────────────
  app.get("/api/admin/resources/:id/versions", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const versions = await storage.listAdminResourceVersions(id);
      // Strip secret_ref out of version snapshots in API responses too.
      res.json(
        versions.map((v) => ({
          id: v.id,
          version: v.version,
          displayName: v.displayName,
          description: v.description,
          config: v.config ?? {},
          hasSecret: typeof v.secretRef === "string" && v.secretRef.length > 0,
          changeSummary: v.changeSummary,
          changedByUserId: v.changedByUserId,
          changedAt: v.changedAt.toISOString(),
        })),
      );
    } catch (error) {
      logAndSendError(res, "Failed to list resource versions", error);
    }
  });

  // ── Impact list ─────────────────────────────────────────────────
  app.get("/api/admin/resources/:id/impact", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const impact = await storage.listResourceImpact(id);
      res.json(impact);
    } catch (error) {
      logAndSendError(res, "Failed to load resource impact list", error);
    }
  });

  // ── Catalog sync (admin-triggered) ──────────────────────────────
  app.post("/api/admin/specialist-catalog/sync", requireAdmin, async (req, res) => {
    try {
      const result = await syncSpecialistCatalog();
      logActivity(req, "sync-specialist-catalog", "specialist_catalog", null,
        `${result.inserted}+/${result.updated}~/${result.removed}-`);
      res.json(result);
    } catch (error) {
      logAndSendError(res, "Failed to sync specialist catalog", error);
    }
  });

  // ────────────────────────────────────────────────────────────────
  // Break-glass overrides — SUPER-ADMIN ONLY.
  // ────────────────────────────────────────────────────────────────
  const breakGlassListQuery = z.object({
    specialistId: z.string().min(1).optional(),
  });
  const breakGlassCreateBody = z.object({
    specialistId: z.string().min(1),
    assignmentKind: ResourceKindSchema,
    assignmentSlug: ResourceSlugSchema,
    assignmentRole: z.string().min(1).nullable().optional(),
    overrideResourceId: z.number().int().positive().nullable().optional(),
    reason: z.string().min(8),
    expiresAt: z.coerce.date(),
  });

  app.get("/api/admin/break-glass-overrides", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = breakGlassListQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const rows = await storage.listBreakGlassOverrides(parsed.data.specialistId);
      res.json(rows);
    } catch (error) {
      logAndSendError(res, "Failed to list break-glass overrides", error);
    }
  });

  app.post("/api/admin/break-glass-overrides", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = breakGlassCreateBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const actorId = req.user!.id;
      if (parsed.data.expiresAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: "expiresAt must be in the future" });
      }
      const row = await storage.createBreakGlassOverride({
        specialistId: parsed.data.specialistId,
        assignmentKind: parsed.data.assignmentKind,
        assignmentSlug: parsed.data.assignmentSlug,
        assignmentRole: parsed.data.assignmentRole ?? null,
        overrideResourceId: parsed.data.overrideResourceId ?? null,
        reason: parsed.data.reason,
        expiresAt: parsed.data.expiresAt,
        createdByUserId: actorId,
      });
      logActivity(req, "create-break-glass-override", "break_glass", row.id,
        `${row.specialistId} ${row.assignmentKind}/${row.assignmentSlug}`);
      res.status(201).json(row);
    } catch (error) {
      logAndSendError(res, "Failed to create break-glass override", error);
    }
  });

  app.post("/api/admin/break-glass-overrides/:id/revoke", requireSuperAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const actorId = req.user!.id;
      const row = await storage.revokeBreakGlassOverride(id, actorId);
      if (!row) return res.status(404).json({ error: "Override not found" });
      logActivity(req, "revoke-break-glass-override", "break_glass", id);
      res.json(row);
    } catch (error) {
      logAndSendError(res, "Failed to revoke break-glass override", error);
    }
  });
}
