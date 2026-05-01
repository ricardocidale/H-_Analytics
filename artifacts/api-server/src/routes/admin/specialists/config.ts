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
import {
  getSpecialistById,
  getLockedHardCandidateKeys,
} from "@engine/analyst/registry/specialist-catalog";
import { idParamSchema } from "./_shared";

export function registerConfigRoutes(app: Express) {
  // Disabled: LlmConfigTab is read-only per specialists-are-dev-defined-only.md §3.3.
  // Prompt templates, model selection, and routing rules are dev-defined.
  app.put("/api/admin/specialists/:id/llm-config", requireAdmin, (_req, res) => {
    res.status(405).json({ error: "Specialist LLM config is dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });

  // Disabled: RequiredFieldsTab is read-only per specialists-are-dev-defined-only.md §3.1.
  app.put("/api/admin/specialists/:id/required-fields", requireAdmin, (_req, res) => {
    res.status(405).json({ error: "Specialist required fields are dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
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
      const { recordRecommendationEventSchema } = await import("@workspace/db");
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
      // reject `promote-hard` events on candidates that are not
      // catalog-locked. The hard tier is owned by the catalog; a recommendation
      // event cannot create one. (`promote-recommended` and `ignore` remain
      // free; `promote-hard` on an already-locked field is a no-op-but-allowed.)
      if (parsed.data.action === "promote-hard") {
        const lockedHard = new Set(getLockedHardCandidateKeys(id));
        if (!lockedHard.has(parsed.data.fieldKey)) {
          return res.status(400).json({
            error: `Cannot promote "${parsed.data.fieldKey}" to hard-required: not catalog-locked. The hard tier is owned by the catalog.`,
            lockedHardKeys: Array.from(lockedHard),
          });
        }
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

  // Disabled: field-toggles and prerequisite-toggles are dev-defined per
  // specialists-are-dev-defined-only.md §3.1. UI tabs are now read-only.
  app.put("/api/admin/specialists/:id/field-toggles", requireAdmin, (_req, res) => {
    res.status(405).json({ error: "Specialist field toggles are dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });

  app.put("/api/admin/specialists/:id/prerequisite-toggles", requireAdmin, (_req, res) => {
    res.status(405).json({ error: "Specialist prerequisite toggles are dev-defined. Edit the catalog and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });
}
