/**
 * Admin Specialist audit (config version history) route (Task #482 split,
 * extended in Task #495 with per-field diff labels).
 *
 *   GET /api/admin/specialists/:id/audit
 *
 * Read-only history of `specialist_configs` snapshots. For every snapshot we
 * also compute a `changedFieldLabels: string[]` array — the set of human-
 * readable labels for each field whose value differs from the row that
 * superseded it (the next-newer snapshot, or the live config row for the
 * newest entry). Workflow knobs are diffed key-by-key so the UI can show
 * "edited Staleness threshold, Daily token budget" instead of one opaque
 * "edited Workflow overrides" line.
 */
import type { Express } from "express";
import { storage } from "../../../storage";
import { requireAdmin } from "../../../auth";
import { logAndSendError } from "../../helpers";
import { getSpecialistById } from "../../../../engine/analyst/registry/specialist-catalog";
import { idParamSchema } from "./_shared";
import type {
  SpecialistConfigVersionRow,
  SpecialistConfigRow,
  SpecialistWorkflowOverrides,
} from "@shared/schema";

/**
 * Subset of fields shared by `SpecialistConfigVersionRow` (snapshot) and
 * `SpecialistConfigRow` (live state) that the diff compares. Centralising
 * the type lets the diff function consume either side without `as any`.
 */
type DiffableConfig = Pick<
  SpecialistConfigVersionRow,
  | "promptTemplate"
  | "modelResourceId"
  | "analystAModelResourceId"
  | "analystBModelResourceId"
  | "synthesisModelResourceId"
  | "fallbackModelResourceId"
  | "multiModelEnabled"
  | "workflowOverrides"
  | "requiredFields"
  | "fieldRequirements"
  | "prerequisiteToggles"
  | "runtimeConfig"
  | "refreshCadenceDays"
>;

/** Human-readable label per workflow override key. Order = display order. */
const WORKFLOW_LABELS: Array<[keyof SpecialistWorkflowOverrides, string]> = [
  ["stalenessThresholdHours",  "Staleness threshold"],
  ["maxConcurrentRuns",        "Max concurrent runs"],
  ["dailyTokenBudget",         "Daily token budget"],
  ["monthlyTokenBudget",       "Monthly token budget"],
  ["relaxationMaxLevel",       "Relaxation max level"],
  ["minEvidenceScore",         "Min evidence score"],
  ["minCompCount",             "Min comp count"],
  ["autoRefreshIntervalHours", "Auto-refresh interval"],
];

/** Top-level (non-workflow) field labels. */
const SCALAR_LABELS: Array<[keyof DiffableConfig, string]> = [
  ["promptTemplate",            "prompt"],
  ["modelResourceId",           "primary model"],
  ["analystAModelResourceId",   "Analyst A model"],
  ["analystBModelResourceId",   "Analyst B model"],
  ["synthesisModelResourceId",  "synthesis model"],
  ["fallbackModelResourceId",   "fallback model"],
  ["multiModelEnabled",         "multi-model toggle"],
  ["requiredFields",            "required fields"],
  ["fieldRequirements",         "field toggles"],
  ["prerequisiteToggles",       "prerequisite toggles"],
  ["runtimeConfig",             "runtime config"],
  ["refreshCadenceDays",        "refresh cadence"],
];

function diffLabels(prev: DiffableConfig, next: DiffableConfig): string[] {
  const out: string[] = [];
  for (const [key, label] of SCALAR_LABELS) {
    const a = prev[key];
    const b = next[key];
    // JSON arrays/objects need structural compare; primitives use ===.
    if (a !== null && typeof a === "object") {
      if (JSON.stringify(a) !== JSON.stringify(b ?? null)) out.push(label);
    } else {
      if (a !== b) out.push(label);
    }
  }
  // Per-workflow-key diff: each changed knob produces its own label so
  // "edited Staleness threshold, Daily token budget" is precise.
  const prevW = prev.workflowOverrides ?? {};
  const nextW = next.workflowOverrides ?? {};
  for (const [key, label] of WORKFLOW_LABELS) {
    if ((prevW[key] ?? null) !== (nextW[key] ?? null)) out.push(label);
  }
  return out;
}

export function registerAuditRoutes(app: Express) {
  app.get("/api/admin/specialists/:id/audit", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const def = getSpecialistById(id);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const versions = await storage.listSpecialistConfigVersions(id, limit);
      // (inferred as (SpecialistConfigVersionRow & { changedByUserName: string | null })[])

      // Versions arrive newest-first. To compute per-row diff labels we
      // also need the row immediately newer than each entry (which holds
      // the post-edit state). For the newest row we diff against the live
      // current config so the UI shows "what just changed".
      // Best-effort: tests may mock storage without `getSpecialistConfig`.
      // Falling back to `null` simply omits the diff label for the newest
      // snapshot — never a 500.
      const liveCurrent: SpecialistConfigRow | null =
        (await storage.getSpecialistConfig?.(id).catch(() => null)) ?? null;

      const annotated = versions.map((v, idx) => {
        const newer: DiffableConfig | null =
          idx === 0 ? liveCurrent : versions[idx - 1] ?? null;
        return {
          id: v.id,
          version: v.version,
          section: v.section,
          changeSummary: v.changeSummary,
          changedByUserId: v.changedByUserId,
          changedByUserName: v.changedByUserName,
          changedAt: v.changedAt.toISOString(),
          // Snapshot fields from the PRE-edit state.
          promptTemplate: v.promptTemplate,
          modelResourceId: v.modelResourceId,
          analystAModelResourceId: v.analystAModelResourceId,
          analystBModelResourceId: v.analystBModelResourceId,
          synthesisModelResourceId: v.synthesisModelResourceId,
          fallbackModelResourceId: v.fallbackModelResourceId,
          multiModelEnabled: v.multiModelEnabled,
          workflowOverrides: v.workflowOverrides,
          requiredFields: v.requiredFields,
          fieldRequirements: v.fieldRequirements,
          prerequisiteToggles: v.prerequisiteToggles,
          runtimeConfig: v.runtimeConfig,
          refreshCadenceDays: v.refreshCadenceDays,
          /** Per-field human-readable labels comparing this snapshot to the next-newer state. */
          changedFieldLabels: newer ? diffLabels(v, newer) : [],
        };
      });
      res.json(annotated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist audit history", error);
    }
  });
}
