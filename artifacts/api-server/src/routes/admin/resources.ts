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
import { storage } from "../../storage";
import { requireAdmin, requireSuperAdmin } from "../../auth";
import { logAndSendError, logActivity, zodErrorMessage } from "../helpers";
import {
  ResourceKindSchema,
  ResourceSlugSchema,
  insertAdminResourceSchema,
  toResourcePublicView,
} from "@workspace/db";
import { backfillCatalogConnections, syncSpecialistCatalog } from "../../jobs/catalog-sync";
import { logger } from "../../logger";
import { runProbe } from "../../jobs/probes";
import { validateIngestUrl } from "../../ai/iris/tools";
import type { ResourceKind } from "@workspace/db";
import {
  HTTP_201_CREATED,
  HTTP_204_NO_CONTENT,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_429_TOO_MANY_REQUESTS,
} from "../../constants";

/**
 * Validates `config.healthProbe.url` (if present) against the canonical
 * SSRF blocklist used by Iris. Returns a human-readable error string when
 * the URL is unsafe, or null when the config is clean / has no probe URL.
 */
function validateHealthProbeUrl(config: Record<string, unknown>): string | null {
  const probe = config.healthProbe;
  if (!probe || typeof probe !== "object" || Array.isArray(probe)) return null;
  const url = (probe as Record<string, unknown>).url;
  if (typeof url !== "string") return null;
  const err = validateIngestUrl(url);
  if (err) return `healthProbe.url is invalid — ${err}`;
  return null;
}

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
  kind: (ResourceKindSchema as any).optional(),
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
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const rows = await storage.listAdminResources(parsed.data.kind);
      // Wrap in an arrow so Array.map's `index` arg doesn't bind to `now`.
      res.json(rows.map((r) => toResourcePublicView(r)));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list admin resources", error);
    }
  });

  // ── Detail ──────────────────────────────────────────────────────
  app.get("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });
      res.json(toResourcePublicView(row));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch admin resource", error);
    }
  });

  // ── Create ──────────────────────────────────────────────────────
  app.post("/api/admin/resources", requireAdmin, async (req, res) => {
    try {
      const parsed = insertAdminResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      // Reject duplicates explicitly (cleaner than catching the unique-index error).
      const existing = await storage.getAdminResourceBySlug(parsed.data.kind, parsed.data.slug);
      if (existing) {
        return res.status(HTTP_409_CONFLICT).json({ error: `Resource ${parsed.data.kind}/${parsed.data.slug} already exists` });
      }
      const probeUrlError = validateHealthProbeUrl(parsed.data.config ?? {});
      if (probeUrlError) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: probeUrlError });
      }
      const actorId = req.user!.id;
      const row = await storage.createAdminResource(parsed.data, actorId);
      // Light up the Sources tab for any catalog declarations whose slug
      // just became resolvable. Best-effort: if the backfill fails we still
      // honour the create, since the next boot or admin sync will pick it
      // up — but log the failure so it's visible in startup audit trails.
      try {
        await backfillCatalogConnections();
      } catch (err: unknown) {
        logger.warn(
          `Resource created but catalog backfill failed: ${err instanceof Error ? err.message : String(err)}`,
          "admin-resources",
        );
      }
      logActivity(req, "create-admin-resource", "admin_resource", row.id, `${row.kind}/${row.slug}`);
      res.status(HTTP_201_CREATED).json(toResourcePublicView(row));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create admin resource", error);
    }
  });

  // ── Update (versioned, returns impact list) ────────────────────
  app.put("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = updateResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      if (parsed.data.config) {
        const probeUrlError = validateHealthProbeUrl(parsed.data.config);
        if (probeUrlError) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: probeUrlError });
        }
      }
      const actorId = req.user!.id;
      const row = await storage.updateAdminResource(id, parsed.data, actorId);
      if (!row) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });
      const impact = await storage.listResourceImpact(id);
      logActivity(req, "update-admin-resource", "admin_resource", id, `v${row.version}`);
      res.json({ resource: toResourcePublicView(row), impact });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update admin resource", error);
    }
  });

  // ── Rollback ────────────────────────────────────────────────────
  app.post("/api/admin/resources/:id/rollback", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = rollbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const actorId = req.user!.id;
      const row = await storage.rollbackAdminResource(id, parsed.data.targetVersion, actorId);
      if (!row) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource or target version not found" });
      }
      logActivity(req, "rollback-admin-resource", "admin_resource", id, `to v${parsed.data.targetVersion}`);
      res.json(toResourcePublicView(row));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to rollback admin resource", error);
    }
  });

  // ── Delete ──────────────────────────────────────────────────────
  app.delete("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const ok = await storage.deleteAdminResource(id);
      if (!ok) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });
      logActivity(req, "delete-admin-resource", "admin_resource", id);
      res.status(HTTP_204_NO_CONTENT).end();
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list resource versions", error);
    }
  });

  // ── Impact list ─────────────────────────────────────────────────
  app.get("/api/admin/resources/:id/impact", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const impact = await storage.listResourceImpact(id);
      res.json(impact);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource impact list", error);
    }
  });

  // ── Health (current status, freshness-aware) ────────────────────
  app.get("/api/admin/resources/:id/health", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const view = await storage.getResourceHealthView(id);
      if (!view) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });
      res.json({
        ...view,
        lastChecked: view.lastChecked ? view.lastChecked.toISOString() : null,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource health", error);
    }
  });

  // ── Health history (audit trail of probes) ──────────────────────
  app.get("/api/admin/resources/:id/health/history", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const rows = await storage.listHealthChecksForResource(id, limit);
      // Drop errorMessage for non-super-admins? No — admins already see it in
      // logActivity. Keep but never include resource secret material (probes
      // are designed to never put secrets in errorMessage).
      res.json(
        rows.map((r) => ({
          id: r.id,
          status: r.status,
          latencyMs: r.latencyMs,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          triggeredByUserId: r.triggeredByUserId,
          checkedAt: r.checkedAt.toISOString(),
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource health history", error);
    }
  });

  // ── Test button: synchronous probe with audit + per-actor rate limit ────
  app.post("/api/admin/resources/:id/test", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });

      const actorId = req.user!.id;
      const kind = row.kind as ResourceKind;
      const limited = await storage.isAdminTestRateLimited(id, actorId, kind);
      if (limited) {
        // Audit the throttled attempt too — every Test press leaves a trace.
        logActivity(req, "test-admin-resource-throttled", "admin_resource", id, `${row.kind}/${row.slug}`);
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({
          error: "Rate limit exceeded for Test on this resource. Try again in a minute.",
        });
      }

      const outcome = await runProbe(row);
      const persisted = await storage.recordProbeResult(id, kind, outcome, actorId);
      logActivity(req, "test-admin-resource", "admin_resource", id,
        `${row.kind}/${row.slug} → ${outcome.status}${outcome.errorCode ? ` (${outcome.errorCode})` : ""}`);
      res.json({
        status: outcome.status,
        latencyMs: outcome.latencyMs,
        errorCode: outcome.errorCode ?? null,
        errorMessage: outcome.errorMessage ?? null,
        checkedAt: persisted.checkedAt.toISOString(),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to test admin resource", error);
    }
  });

  // ── Regenerate button: dispatch Pietro minion to refresh a source's cache ──
  app.post("/api/admin/resources/:id/regenerate", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(HTTP_404_NOT_FOUND).json({ error: "Resource not found" });

      const { MINION_REGISTRY } = await import("../../ai/ambient/pietro-scheduler");
      const minion = MINION_REGISTRY[row.slug];
      if (!minion) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: `No minion registered for slug '${row.slug}'. Regenerate is only available for data-fetching sources.`,
        });
      }

      logActivity(req, "regenerate-admin-resource", "admin_resource", id, `${row.kind}/${row.slug}`);
      const result = await minion();
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to regenerate admin resource", error);
    }
  });

  // ── Catalog sync (admin-triggered) ──────────────────────────────
  app.post("/api/admin/specialist-catalog/sync", requireAdmin, async (req, res) => {
    try {
      const result = await syncSpecialistCatalog();
      logActivity(req, "sync-specialist-catalog", "specialist_catalog", null,
        `${result.inserted}+/${result.updated}~/${result.removed}-`);
      res.json(result);
    } catch (error: unknown) {
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
    assignmentKind: ResourceKindSchema as any,
    assignmentSlug: ResourceSlugSchema as any,
    assignmentRole: z.string().min(1).nullable().optional(),
    overrideResourceId: z.number().int().positive().nullable().optional(),
    reason: z.string().min(8),
    expiresAt: z.coerce.date(),
  });

  app.get("/api/admin/break-glass-overrides", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = breakGlassListQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const rows = await storage.listBreakGlassOverrides(parsed.data.specialistId);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list break-glass overrides", error);
    }
  });

  app.post("/api/admin/break-glass-overrides", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = breakGlassCreateBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const actorId = req.user!.id;
      if (parsed.data.expiresAt.getTime() <= Date.now()) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "expiresAt must be in the future" });
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
      res.status(HTTP_201_CREATED).json(row);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create break-glass override", error);
    }
  });

  app.post("/api/admin/break-glass-overrides/:id/revoke", requireSuperAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const actorId = req.user!.id;
      const row = await storage.revokeBreakGlassOverride(id, actorId);
      if (!row) return res.status(HTTP_404_NOT_FOUND).json({ error: "Override not found" });
      logActivity(req, "revoke-break-glass-override", "break_glass", id);
      res.json(row);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to revoke break-glass override", error);
    }
  });
}
