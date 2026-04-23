/**
 * Admin Specialist config-section update routes (Task #482 split).
 *
 *   PUT  /api/admin/specialists/:id/llm-config
 *   PUT  /api/admin/specialists/:id/required-fields
 *   POST /api/admin/specialists/:id/recommendation-event
 *   GET  /api/admin/specialists/:id/recommendation-stats
 *   PUT  /api/admin/specialists/:id/field-toggles
 *   PUT  /api/admin/specialists/:id/prerequisite-toggles
 *
 * All these handlers mutate (or read calibration telemetry for) the
 * `specialist_configs` row and share the same validation pattern
 * (parse params → load def → capability check → parse body → call
 * `storage.updateSpecialistConfigSection` → return `toConfigView`).
 */
import type { Express } from "express";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { aiRateLimit } from "../../../middleware/rate-limit";
import { logActivity, logAndSendError } from "../../helpers";
import { getSpecialistById } from "../../../../engine/analyst/registry/specialist-catalog";
import {
  findInvalidRequiredFieldKeys,
  getValidRequiredFieldKeys,
} from "../../../../engine/analyst/registry/required-field-keys";
import {
  updateLlmConfigSchema,
  updateRequiredFieldsSchema,
  updateFieldTogglesSchema,
  updatePrerequisiteTogglesSchema,
} from "@shared/schema";
import { idParamSchema, toConfigView } from "./_shared";

export function registerConfigRoutes(app: Express) {
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

  // ── Promote/Ignore observed-missing telemetry ────────────────────
  // Body: { fieldKey: string, action: "promote-recommended"|"promote-hard"|"ignore" }
  // Append-only. Promote actions ALSO flip the toggle (functional), but the
  // event row is independent so a toggle revert by another admin does not
  // delete the prior promote signal. Ignore actions are pure telemetry —
  // they do not touch the toggle state, only inform the catalog calibration
  // (high ignore-ratio means "candidate is noise, drop from catalog").
  app.post("/api/admin/specialists/:id/recommendation-event", requireAdmin, aiRateLimit(100, 60_000), async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const { recordRecommendationEventSchema } = await import("@shared/schema");
      const parsed = recordRecommendationEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      // Validate fieldKey against the catalog candidate-fields list — admins
      // can only act on declared candidates, never arbitrary strings.
      const candidateKeys = new Set((def.candidateFields ?? []).map((c) => c.key));
      if (!candidateKeys.has(parsed.data.fieldKey)) {
        return res.status(400).json({
          error: `Field key "${parsed.data.fieldKey}" is not a declared candidate of ${id}`,
        });
      }
      const actorId = req.user!.id;
      const event = await storage.recordRecommendationEvent(
        id,
        parsed.data.fieldKey,
        parsed.data.action,
        actorId,
      );
      logActivity(
        req,
        "specialist-recommendation-event",
        "specialist_config",
        event.id,
        `${id} ${parsed.data.action} ${parsed.data.fieldKey}`,
      );
      res.json(event);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to record specialist recommendation event", error);
    }
  });

  // GET stats for the Required Fields tab — promote-vs-ignore counts per
  // candidate field. Drives the calibration hint shown next to each row.
  app.get("/api/admin/specialists/:id/recommendation-stats", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const stats = await storage.getRecommendationEventStats(id);
      res.json(stats);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist recommendation stats", error);
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
}
