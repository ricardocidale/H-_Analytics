/**
 * Admin Specialist runtime/cadence/probe routes (Task #482 split).
 *
 *   PUT  /api/admin/specialists/:id/runtime
 *   PUT  /api/admin/specialists/:id/cadence
 *   POST /api/admin/specialists/:id/probe
 *
 * These three handlers control the runtime behavior of a Specialist
 * (jsonb runtime config, scheduled-refresh cadence override for
 * Constants Specialists, and the dry-run "Test agent" probe). They are
 * grouped because they all read assignments + health to validate the
 * Specialist's runtime fitness.
 */
import type { Express } from "express";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logActivity, logAndSendError, zodErrorMessage } from "../../helpers";
import { getSpecialistById } from "@engine/analyst/registry/specialist-catalog";
import {
  updateCadenceSchema,
  type ResourceKind,
  deriveHealthStatus,
  type ProbeStatus,
} from "@workspace/db";
import { idParamSchema, toConfigView } from "./_shared";
import { HTTP_405_METHOD_NOT_ALLOWED } from "../../../constants";
import { getSpecialistGlobalLlmDefaults } from "../../../ai/specialist-llm-resolver";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";

export function registerRuntimeRoutes(app: Express) {
  // Disabled: RuntimeTab JSON editor is read-only per specialists-are-dev-defined-only.md §3.
  // CadenceCard (/cadence endpoint below) remains admin-tunable — scheduling cadence
  // is operational config, not Specialist definition.
  app.put("/api/admin/specialists/:id/runtime", requireAdmin, (_req, res) => {
    res.status(HTTP_405_METHOD_NOT_ALLOWED).json({ error: "Specialist runtime config is dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md", code: "ASRT-003" });
  });

  // ── Update Refresh Cadence (Constants Specialists only) ─────────
  // Per-Specialist override for the scheduled Constants refresh cadence
  // (in days). Only valid when the catalog declares a
  // `refreshCadenceDays` for this Specialist — i.e. it's a Constants
  // Specialist (H–K). Body shape: { refreshCadenceDays: number | null,
  // changeSummary?: string }. Passing `null` clears the override and the
  // scheduler falls back to the catalog default.
  app.put("/api/admin/specialists/:id/cadence", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found", code: "ASRT-004" });
      if (def.refreshCadenceDays == null) {
        return res.status(400).json({
          error: "Specialist does not declare a scheduled refresh cadence",
        code: "ASRT-006" });
      }
      const parsed = updateCadenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "cadence",
        { refreshCadenceDays: parsed.data.refreshCadenceDays },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-cadence", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated, def, await getSpecialistGlobalLlmDefaults()));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist cadence", error, "ASRT-001");
    }
  });

  // ── Probe (dry-run "Test agent") ────────────────────────────────
  app.post("/api/admin/specialists/:id/probe", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      // Gustavo (Analyst Orchestrator) is not in SPECIALIST_CATALOG — he is an
      // in-process router. If this endpoint responds he is reachable by definition.
      if (id === ORCHESTRATOR_SPECIALIST_ID) {
        return res.json({
          specialistId: id,
          ranAt: new Date().toISOString(),
          steps: [
            {
              name: "Orchestrator availability",
              description: "Gustavo (Analyst Orchestrator) is an in-process router.",
              status: "pass",
              message: "Orchestrator is reachable.",
            },
          ],
        });
      }

      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Entity not found in Specialist catalog. For orchestrators or agents use /api/admin/intelligence/:entityCode/probe.", code: "ASRT-005" });

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
      logAndSendError(res, "Failed to probe specialist", error, "ASRT-002");
    }
  });
}
