/**
 * Admin Specialist REST surface (P5).
 *
 * Spec: docs/architecture/resources-control-plane.md (Specialist page section)
 * Doctrine: replit.md "AI Research sidebar section" + "Wiring authority —
 *           code-only with break-glass" blocks (LOCKED 2026-04-21).
 *
 * Routes:
 *   GET  /api/admin/specialists                       — full catalog (with config status)
 *   GET  /api/admin/specialists/:id                   — definition + config + assignments-with-health
 *   PUT  /api/admin/specialists/:id/llm-config        — promptTemplate + modelResourceId
 *   PUT  /api/admin/specialists/:id/required-fields   — string[]
 *   PUT  /api/admin/specialists/:id/runtime           — runtimeConfig jsonb
 *   GET  /api/admin/specialists/:id/audit             — config version history
 *
 * Read-only rule: there is intentionally NO route to relink resource
 * assignments through the Specialist surface. Assignments are code-only
 * (Specialist catalog → catalog-sync → specialist_assignments). Edits
 * happen on the canonical Resources pages; incident reroutes go through
 * the break-glass override route family in `resources.ts`.
 */
import type { Express } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logActivity, logAndSendError } from "../helpers";
import {
  SPECIALIST_CATALOG,
  getSpecialistById,
} from "../../../engine/analyst/registry/specialist-catalog";
import { specialistDisplayName } from "@shared/schema/specialist";
import {
  findInvalidRequiredFieldKeys,
  getValidRequiredFieldKeys,
} from "../../../engine/analyst/registry/required-field-keys";
import {
  updateLlmConfigSchema,
  updateRequiredFieldsSchema,
  updateRuntimeSchema,
  type SpecialistConfigPublicView,
  type ResourceKind,
  toResourcePublicView,
  deriveHealthStatus,
  PROBE_PROFILES,
  type ResourceHealthStatus,
  type ProbeStatus,
} from "@shared/schema";

const idParamSchema = z.object({ id: z.string().min(1) });

function toConfigView(row: {
  specialistId: string;
  promptTemplate: string;
  modelResourceId: number | null;
  requiredFields: string[];
  runtimeConfig: Record<string, unknown>;
  version: number;
  updatedAt: Date;
}): SpecialistConfigPublicView {
  const allow = getValidRequiredFieldKeys(row.specialistId);
  return {
    specialistId: row.specialistId,
    promptTemplate: row.promptTemplate,
    modelResourceId: row.modelResourceId,
    requiredFields: row.requiredFields ?? [],
    validRequiredFieldKeys: allow === null ? null : [...allow],
    runtimeConfig: row.runtimeConfig ?? {},
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerAdminSpecialistRoutes(app: Express) {
  // ── List catalog ────────────────────────────────────────────────
  app.get("/api/admin/specialists", requireAdmin, async (_req, res) => {
    try {
      res.json(
        SPECIALIST_CATALOG.map((d) => ({
          id: d.id,
          letter: d.letter,
          realName: d.realName,
          displayName: specialistDisplayName(d),
          description: d.description ?? null,
          subject: d.subject,
          capabilities: d.capabilities,
          status: d.status,
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list specialists", error);
    }
  });

  // ── Detail (definition + config + assignments-with-health) ──────
  app.get("/api/admin/specialists/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const config = await storage.getOrCreateSpecialistConfig(id);

      // Materialize assignments + health. Joins specialist_assignments → admin_resources.
      const rows = await storage.listSpecialistAssignments(id);
      const now = new Date();
      const assignments = await Promise.all(
        rows.map(async (row) => {
          const resource = row.resourceId
            ? await storage.getAdminResourceById(row.resourceId)
            : undefined;
          let health: { status: ResourceHealthStatus; lastChecked: string | null; lastStatus: ProbeStatus | null } = {
            status: "gray",
            lastChecked: null,
            lastStatus: null,
          };
          if (resource) {
            const latest = await storage.getLatestHealthCheck(resource.id);
            health = {
              status: deriveHealthStatus({
                lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
                lastCheckedAt: latest?.checkedAt ?? null,
                kind: resource.kind as ResourceKind,
                now,
              }),
              lastChecked: latest?.checkedAt ? latest.checkedAt.toISOString() : null,
              lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
            };
          }
          return {
            kind: row.assignmentKind as ResourceKind,
            slug: row.assignmentSlug,
            role: row.assignmentRole,
            required: row.required,
            resource: resource ? toResourcePublicView(resource, now) : null,
            health,
          };
        }),
      );

      res.json({
        definition: {
          id: def.id,
          letter: def.letter,
          realName: def.realName,
          displayName: specialistDisplayName(def),
          description: def.description ?? null,
          subject: def.subject,
          capabilities: def.capabilities,
          status: def.status,
          assignmentRefs: def.assignmentRefs,
        },
        config: toConfigView(config),
        assignments,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch specialist", error);
    }
  });

  // ── Update LLM config (promptTemplate + modelResourceId) ────────
  app.put("/api/admin/specialists/:id/llm-config", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      if (!def.capabilities.includes("llm-config")) {
        return res.status(400).json({ error: "Specialist does not declare llm-config capability" });
      }
      const parsed = updateLlmConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      // Validate the model resource (if any) exists and is kind=model.
      if (parsed.data.modelResourceId !== null) {
        const resource = await storage.getAdminResourceById(parsed.data.modelResourceId);
        if (!resource) return res.status(400).json({ error: "modelResourceId not found" });
        if (resource.kind !== "model") {
          return res.status(400).json({ error: "modelResourceId must reference a Resource of kind=model" });
        }
      }
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "llm-config",
        { promptTemplate: parsed.data.promptTemplate, modelResourceId: parsed.data.modelResourceId },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-llm-config", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist LLM config", error);
    }
  });

  // ── Update Required Fields ──────────────────────────────────────
  app.put("/api/admin/specialists/:id/required-fields", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      if (!def.capabilities.includes("required-fields")) {
        return res.status(400).json({ error: "Specialist does not declare required-fields capability" });
      }
      const parsed = updateRequiredFieldsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      // P6a follow-up: enforce per-Specialist allow-list on requiredFields.
      // Specialists with a wired allow-list (mgmt-co.funding,
      // mgmt-co.revenue) reject keys outside the list. Specialists without
      // an allow-list (`null`) accept any string for backward-compat.
      const invalid = findInvalidRequiredFieldKeys(id, parsed.data.fields);
      if (invalid.length > 0) {
        const allow = getValidRequiredFieldKeys(id) ?? [];
        return res.status(400).json({
          error: `Unknown required-field key(s) for ${id}: ${invalid.join(", ")}. Valid keys: ${allow.join(", ")}`,
          invalidKeys: invalid,
          validKeys: [...allow],
        });
      }
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "required-fields",
        { requiredFields: parsed.data.fields },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-required-fields", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist required fields", error);
    }
  });

  // ── Update Runtime ──────────────────────────────────────────────
  app.put("/api/admin/specialists/:id/runtime", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      if (!def.capabilities.includes("runtime")) {
        return res.status(400).json({ error: "Specialist does not declare runtime capability" });
      }
      const parsed = updateRuntimeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "runtime",
        { runtimeConfig: parsed.data.runtimeConfig },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-runtime", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist runtime", error);
    }
  });

  // ── Probe (dry-run "Test agent") ────────────────────────────────
  app.post("/api/admin/specialists/:id/probe", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });

      const ranAt = new Date();
      const rows = await storage.listSpecialistAssignments(id);

      type ProbeStepStatus = "pass" | "fail" | "skipped";
      const steps: Array<{
        name: string;
        description: string;
        status: ProbeStepStatus;
        message: string;
      }> = [];

      if (rows.length === 0) {
        steps.push({
          name: "Catalog declaration",
          description: `Specialist ${def.realName} has no resource assignments.`,
          status: "pass",
          message: "Catalog entry validated.",
        });
      } else {
        for (const row of rows) {
          const name = row.assignmentRole
            ? `${row.assignmentRole} (${row.assignmentSlug})`
            : row.assignmentSlug;
          const description = `${row.assignmentKind} · ${row.assignmentSlug}${
            row.required ? " · required" : " · optional"
          }`;

          const resource = row.resourceId
            ? await storage.getAdminResourceById(row.resourceId)
            : undefined;

          if (!resource) {
            steps.push({
              name,
              description,
              status: row.required ? "fail" : "skipped",
              message: "No resource wired for this assignment.",
            });
            continue;
          }

          const latest = await storage.getLatestHealthCheck(resource.id);
          const health = deriveHealthStatus({
            lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
            lastCheckedAt: latest?.checkedAt ?? null,
            kind: resource.kind as ResourceKind,
            now: ranAt,
          });

          let status: ProbeStepStatus;
          if (health === "green") status = "pass";
          else if (health === "red") status = "fail";
          else status = "skipped";

          const checkedAt = latest?.checkedAt
            ? latest.checkedAt.toISOString()
            : "never";
          const lastStatus = latest?.status ?? "unknown";
          steps.push({
            name,
            description,
            status,
            message: `Health=${health} · last probe=${lastStatus} @ ${checkedAt}`,
          });
        }
      }

      res.json({
        specialistId: id,
        ranAt: ranAt.toISOString(),
        steps,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to probe specialist", error);
    }
  });

  // ── Audit (config version history) ──────────────────────────────
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
          runtimeConfig: v.runtimeConfig,
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist audit history", error);
    }
  });
}
