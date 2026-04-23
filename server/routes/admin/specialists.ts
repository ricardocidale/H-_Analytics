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
import type { SpecialistDefinition } from "@shared/schema/specialist";
import { specialistDisplayName } from "@shared/schema/specialist";
import {
  findInvalidRequiredFieldKeys,
  getValidRequiredFieldKeys,
} from "../../../engine/analyst/registry/required-field-keys";
import {
  updateLlmConfigSchema,
  updateRequiredFieldsSchema,
  updateFieldTogglesSchema,
  updatePrerequisiteTogglesSchema,
  updateRuntimeSchema,
  updateCadenceSchema,
  updateSpecialistIdentitySchema,
  type SpecialistConfigPublicView,
  type SpecialistIdentityPublicView,
  type ResourceKind,
  toResourcePublicView,
  deriveHealthStatus,
  PROBE_PROFILES,
  type ResourceHealthStatus,
  type ProbeStatus,
} from "@shared/schema";
import { PREREQUISITES } from "../../../engine/analyst/registry/prerequisites";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  resolveSpecialistIdentity,
  type Gender,
  type IdentityCatalogDefault,
} from "../../../engine/analyst/identity";

/**
 * Look up the catalog factory-default identity for any id accepted by the
 * Phase-3 identity routes. Returns the orchestrator default for "gaspar"
 * (which is not part of SPECIALIST_CATALOG), or the catalog entry for one
 * of the 12 specialists. Returns null for unknown ids so the route can
 * 404 cleanly.
 */
function getIdentityCatalogDefault(id: string): IdentityCatalogDefault | null {
  if (id === ORCHESTRATOR_SPECIALIST_ID) {
    return { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender };
  }
  const def = getSpecialistById(id);
  if (!def) return null;
  return { humanName: def.humanName, gender: def.gender };
}

const idParamSchema = z.object({ id: z.string().min(1) });

function toConfigView(
  row: {
    specialistId: string;
    promptTemplate: string;
    modelResourceId: number | null;
    requiredFields: string[];
    fieldRequirements: Record<string, "hard" | "recommended" | "off">;
    prerequisiteToggles: Record<string, boolean>;
    runtimeConfig: Record<string, unknown>;
    refreshCadenceDays: number | null;
    lastObservedMissing: string[];
    lastObservedMissingAt: Date | null;
    version: number;
    updatedAt: Date;
  },
  def?: SpecialistDefinition,
): SpecialistConfigPublicView {
  const allow = getValidRequiredFieldKeys(row.specialistId);
  const definition = def ?? getSpecialistById(row.specialistId);
  const catalogDefault = definition?.refreshCadenceDays ?? null;
  const override = row.refreshCadenceDays ?? null;
  return {
    specialistId: row.specialistId,
    promptTemplate: row.promptTemplate,
    modelResourceId: row.modelResourceId,
    requiredFields: row.requiredFields ?? [],
    validRequiredFieldKeys: allow === null ? null : [...allow],
    fieldRequirements: row.fieldRequirements ?? {},
    prerequisiteToggles: row.prerequisiteToggles ?? {},
    runtimeConfig: row.runtimeConfig ?? {},
    refreshCadenceDays: override ?? catalogDefault,
    defaultRefreshCadenceDays: catalogDefault,
    refreshCadenceOverridden: override !== null,
    lastObservedMissing: row.lastObservedMissing ?? [],
    lastObservedMissingAt: row.lastObservedMissingAt
      ? row.lastObservedMissingAt.toISOString()
      : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Derive the "effective hard-required field keys" for the specialist gate
 * during the toggle-UI transition. A field is hard-required iff its catalog
 * candidate entry's `fieldRequirements[key]` is `"hard"`. The legacy
 * `requiredFields` column remains writable through the legacy route, but
 * the gate prefers `fieldRequirements` when any candidate row is set so a
 * Specialist that has migrated to the toggle UI is gated correctly even
 * if the legacy column is stale.
 */
export function deriveHardRequiredFieldKeys(
  fieldRequirements: Record<string, "hard" | "recommended" | "off"> | null | undefined,
  fallbackLegacy: string[] | null | undefined,
): string[] {
  const map = fieldRequirements ?? {};
  const hardKeys = Object.entries(map)
    .filter(([, level]) => level === "hard")
    .map(([k]) => k);
  if (hardKeys.length > 0 || Object.keys(map).length > 0) return hardKeys;
  // No toggle state set yet — fall back to legacy list to preserve current
  // gate behavior on Specialists that haven't been migrated.
  return [...(fallbackLegacy ?? [])];
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
          humanName: d.humanName,
          gender: d.gender,
          description: d.description ?? null,
          subject: d.subject,
          capabilities: d.capabilities,
          status: d.status,
          candidateFields: d.candidateFields ?? [],
          prerequisites: (d.prerequisites ?? []).map((id) => ({
            id,
            label: PREREQUISITES[id]?.label ?? id,
            description: PREREQUISITES[id]?.description ?? "",
          })),
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
          humanName: def.humanName,
          gender: def.gender,
          description: def.description ?? null,
          subject: def.subject,
          capabilities: def.capabilities,
          status: def.status,
          assignmentRefs: def.assignmentRefs,
          // Surfaced so the Specialist page can render the editable
          // cadence card (only meaningful for Constants Specialists, i.e.
          // ones whose catalog entry declares `refreshCadenceDays`).
          constantsOwned: def.constantsOwned ?? [],
          defaultRefreshCadenceDays: def.refreshCadenceDays ?? null,
          candidateFields: def.candidateFields ?? [],
          prerequisites: (def.prerequisites ?? []).map((id) => ({
            id,
            label: PREREQUISITES[id]?.label ?? id,
            description: PREREQUISITES[id]?.description ?? "",
          })),
        },
        config: toConfigView(config, def),
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
      res.json(toConfigView(updated, def));
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
      res.json(toConfigView(updated, def));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist required fields", error);
    }
  });

  // ── Update Field Toggles (toggle UI) ────────────────────────────
  // Body: { fieldRequirements: Record<key,"hard"|"recommended"|"off">,
  //         changeSummary?: string }
  // Validates each key against the catalog `candidateFields[]` declaration.
  // Mirrors the hard-required subset into the legacy `requiredFields`
  // column so the in-flight surface-router gate stays honest during the
  // transition (see deriveHardRequiredFieldKeys helper).
  app.put("/api/admin/specialists/:id/field-toggles", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      if (!def.capabilities.includes("required-fields")) {
        return res.status(400).json({ error: "Specialist does not declare required-fields capability" });
      }
      const parsed = updateFieldTogglesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const candidateKeys = new Set((def.candidateFields ?? []).map((c) => c.key));
      const invalid = Object.keys(parsed.data.fieldRequirements).filter(
        (k) => !candidateKeys.has(k),
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `Unknown candidate field key(s) for ${id}: ${invalid.join(", ")}. Valid keys: ${Array.from(candidateKeys).join(", ")}`,
          invalidKeys: invalid,
          validKeys: Array.from(candidateKeys),
        });
      }
      const hardKeys = Object.entries(parsed.data.fieldRequirements)
        .filter(([, v]) => v === "hard")
        .map(([k]) => k);
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "field-toggles",
        {
          fieldRequirements: parsed.data.fieldRequirements,
          // Mirror hard subset into legacy column so existing readers
          // (surface-router gate, ModelDefaults rollup) stay correct.
          requiredFields: hardKeys,
        },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-field-toggles", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated, def));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist field toggles", error);
    }
  });

  // ── Update Prerequisite Toggles ─────────────────────────────────
  // Body: { prerequisiteToggles: Record<prereqId, boolean>, changeSummary?: string }
  // Each prereqId must appear in the Specialist's catalog `prerequisites[]`.
  app.put("/api/admin/specialists/:id/prerequisite-toggles", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const parsed = updatePrerequisiteTogglesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const allowedPrereqs = new Set(def.prerequisites ?? []);
      const invalid = Object.keys(parsed.data.prerequisiteToggles).filter(
        (k) => !allowedPrereqs.has(k),
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `Unknown prerequisite id(s) for ${id}: ${invalid.join(", ")}. Valid ids: ${Array.from(allowedPrereqs).join(", ")}`,
          invalidIds: invalid,
          validIds: Array.from(allowedPrereqs),
        });
      }
      const actorId = req.user!.id;
      const updated = await storage.updateSpecialistConfigSection(
        id,
        "prerequisite-toggles",
        { prerequisiteToggles: parsed.data.prerequisiteToggles },
        actorId,
        parsed.data.changeSummary,
      );
      logActivity(req, "update-specialist-prerequisite-toggles", "specialist_config", updated.id, `${id} v${updated.version}`);
      res.json(toConfigView(updated, def));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist prerequisite toggles", error);
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
      res.json(toConfigView(updated, def));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist runtime", error);
    }
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
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      if (def.refreshCadenceDays == null) {
        return res.status(400).json({
          error: "Specialist does not declare a scheduled refresh cadence",
        });
      }
      const parsed = updateCadenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
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
      res.json(toConfigView(updated, def));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update specialist cadence", error);
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

  // ── Identity (Phase 3 — admin-editable humanName + gender) ──────
  //
  // Accepts the 12 catalog specialist ids AND the synthetic id "gaspar"
  // (the orchestrator). The catalog supplies factory defaults; the
  // override row in `specialist_identity_overrides` wins per-field when
  // present. Per-field nullability lets an admin override only humanName
  // (e.g. spelling change) while leaving gender at the catalog default.
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
      const actorId = req.user!.id;
      const changeSummary = typeof req.body?.changeSummary === "string" ? req.body.changeSummary : undefined;
      await storage.resetIdentityOverride(id, actorId, changeSummary);
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
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
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
