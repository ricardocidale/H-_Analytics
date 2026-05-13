import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { insertGlobalAssumptionsSchema, updateServiceTemplateSchema } from "@workspace/db";
import { logActivity, logAndSendError, parseParamId, zodErrorMessage } from "./helpers";
import { z } from "zod";
import { invalidateComputeCache } from "../finance/cache";
import { logger } from "../logger";
import { stripCanonicalDenylistedFields } from "./global-assumptions-denylist";
import {
  COMPANY_ASSUMPTION_TAB_KEYS,
  saveCompanyAssumptionTab,
  SaveCompanyAssumptionTabValidationError,
} from "./global-assumptions-save-tab";
import { rebeccaSettingsPatchSchema, mergeRebeccaSettings } from "@shared/rebecca-settings";
import { withFundingDefaults } from "../finance/apply-funding-defaults";

const appearanceDefaultsSchema = z.object({
  defaultColorMode: z.enum(["light", "auto", "dark"]).nullable().optional(),
  defaultBgAnimation: z.enum(["enabled", "auto", "disabled"]).nullable().optional(),
  defaultFontPreference: z.enum(["default", "sans", "system", "dyslexic"]).nullable().optional(),
});

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // GLOBAL ASSUMPTIONS
  // The "Settings" page: financial model parameters, company info, feature toggles.
  // PUT uses upsert logic (creates on first save, updates thereafter).
  // ────────────────────────────────────────────────────────────

  // Expose the admin-managed exit-multiple bands to any authenticated user so
  // the Assumptions page can render the industry-vertical dropdown and show
  // the inline "outside band — recommended midpoint" warning. Read-only; the
  // admin write endpoints live under /api/admin/analyst-tables.
  app.get("/api/exit-multiples", requireAuth, async (_req, res) => {
    try {
      const rows = await storage.getExitMultiples();
      res.json(rows.map(m => ({
        dimensionKey: m.dimensionKey,
        label: m.label,
        unit: m.unit,
        valueLow: m.valueLow,
        valueMid: m.valueMid,
        valueHigh: m.valueHigh,
      })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch exit multiples", error, "GLOB-001");
    }
  });

  // Analyst-style heuristic that picks an industry vertical from the
  // admin-managed exit_multiples list based on the caller's portfolio profile
  // (avg ADR, avg room count, dominant quality tier / hospitality type, etc.).
  // Used by the Property Defaults card to pre-suggest a vertical when the user
  // has not chosen one yet. Returns `{ suggestion: null }` if there are no
  // verticals or no properties to base a suggestion on.
  app.get("/api/exit-multiples/suggestion", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const [verticals, properties] = await Promise.all([
        storage.getExitMultiples(),
        storage.getAllProperties(userId),
      ]);
      const { suggestIndustryVertical } = await import("../ai/exit-vertical-suggestion");
      const suggestion = suggestIndustryVertical(properties, verticals);
      res.json({ suggestion });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute industry vertical suggestion", error, "GLOB-002");
    }
  });

  app.get("/api/global-assumptions", requireAuth, async (req, res) => {
    try {
      const assumptions = await storage.getGlobalAssumptions(getAuthUser(req).id);
      let companyLogoUrl: string | null = null;
      if (assumptions?.companyLogoId) {
        const logo = await storage.getLogo(assumptions.companyLogoId);
        if (logo) companyLogoUrl = logo.url;
      }
      // Three-tier cascade for the four Funding Specialist columns
      // (`runwayBufferMonths`, `sizingOvershootPct`, `revenueRampDelayMonths`,
      // `burnFlexDownPct`): NULL on the user's row means "inherit the
      // admin Default-tier value". Without this overlay the client falls
      // straight through NULL to the hardcoded `DEFAULT_*` constant,
      // hiding the admin's Default-tier edit. See
      // `server/finance/apply-funding-defaults.ts` for the contract.
      const overlaid = assumptions
        ? await withFundingDefaults(assumptions)
        : assumptions;
      res.json({ ...overlaid, companyLogoUrl });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch global assumptions", error, "GLOB-003");
    }
  });

  // PATCH — partial updates for admin-configurable subsections (e.g. Rebecca config)
  const rebeccaPatchSchema = z.object({
    rebeccaEnabled: z.boolean().optional(),
    rebeccaDisplayName: z.string().min(1).max(50).optional(),
    rebeccaSystemPrompt: z.string().max(5000).nullable().optional(),
    rebeccaChatEngine: z.string().optional(),
    // Task #499 — full Rebecca config payload (deep-merged on top of stored row).
    rebeccaConfig: rebeccaSettingsPatchSchema.optional(),
  });

  app.patch("/api/global-assumptions", requireAdmin, async (req, res) => {
    try {
      const validation = rebeccaPatchSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found", code: "GLOB-015" });
      }
      const patch: Record<string, unknown> = { ...validation.data, updatedAt: new Date() };
      if (validation.data.rebeccaConfig) {
        // Deep-merge incoming partial config on top of stored row, then strip any
        // unknown keys via mergeRebeccaSettings to keep the column shape canonical.
        // Stored shape is opaque JSONB; alias once to a string-keyed map so we can
        // spread sub-objects without per-line `as any` casts.
        const currentRebecca = (current.rebeccaConfig ?? {}) as Record<
          string,
          Record<string, unknown> | undefined
        >;
        const merged = mergeRebeccaSettings({
          ...(current.rebeccaConfig ?? {}),
          ...validation.data.rebeccaConfig,
          identity:    { ...(currentRebecca.identity    ?? {}), ...(validation.data.rebeccaConfig.identity    ?? {}) },
          personality: { ...(currentRebecca.personality ?? {}), ...(validation.data.rebeccaConfig.personality ?? {}) },
          voice:       { ...(currentRebecca.voice       ?? {}), ...(validation.data.rebeccaConfig.voice       ?? {}) },
          behavior:    { ...(currentRebecca.behavior    ?? {}), ...(validation.data.rebeccaConfig.behavior    ?? {}) },
          llm:         { ...(currentRebecca.llm         ?? {}), ...(validation.data.rebeccaConfig.llm         ?? {}) },
          sources:     { ...(currentRebecca.sources     ?? {}), ...(validation.data.rebeccaConfig.sources     ?? {}) },
        });
        patch.rebeccaConfig = merged;
      }
      const updated = await storage.patchGlobalAssumptions(current.id, patch);
      logActivity(req, "update", "global_assumptions", updated.id, "Rebecca Config");
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update global assumptions", error, "GLOB-004");
    }
  });

  app.put("/api/global-assumptions", requireAuth, async (req, res) => {
    try {
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      // Validate req.body first, then merge with current — prevents prototype pollution
      const bodyValidation = insertGlobalAssumptionsSchema.partial().safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ error: zodErrorMessage(bodyValidation.error) });
      }
      // Task #379: certain values are canonically owned by the Model
      // Constants tab. Strip any inbound write so a stale client (or a
      // non-admin management user) cannot bypass the canonical edit
      // surface. The fields remain on the existing row (no delete) — the
      // merge with `current` below preserves them — and the engine reads
      // via the Model Constants overlay.
      const sanitizedBody = stripCanonicalDenylistedFields(
        bodyValidation.data as Record<string, unknown>,
      );
      const merged = { ...(current ?? {}), ...sanitizedBody };
      delete (merged as Record<string, unknown>).id;
      delete (merged as Record<string, unknown>).createdAt;
      delete (merged as Record<string, unknown>).updatedAt;
      delete (merged as Record<string, unknown>).companyLogoUrl;

      const validation = insertGlobalAssumptionsSchema.safeParse(merged);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }
      
      const GA_STALENESS_TRIGGER_KEYS = [
        "baseManagementFee", "incentiveManagementFee",
        "inflationRate", "companyTaxRate", "commissionRate",
        "staffSalary",
        "partnerCompYear1", "partnerCompYear2", "partnerCompYear3",
        "partnerCompYear4", "partnerCompYear5", "partnerCompYear6",
        "partnerCompYear7", "partnerCompYear8", "partnerCompYear9", "partnerCompYear10",
      ];
      const hasKeyChange = current && GA_STALENESS_TRIGGER_KEYS.some(
        (k) => k in req.body && (req.body as Record<string, unknown>)[k] !== (current as Record<string, unknown>)[k]
      );
      const finalData = hasKeyChange
        ? { ...validation.data, lastAssumptionChangeAt: new Date() }
        : validation.data;

      const authUser = getAuthUser(req);
      const assumptions = await storage.upsertGlobalAssumptions(finalData, authUser.id);
      invalidateComputeCache();
      logActivity(req, "update", "global_assumptions", assumptions.id, "System Settings");

      // Phase 5C-task-3: supersede stale company guidance when material inputs change
      if (hasKeyChange) {
        storage.markAssumptionGuidanceSuperseded("company", authUser.id, null).catch(err =>
          logger.warn(`Failed to supersede company guidance: ${err instanceof Error ? err.message : err}`, "global-assumptions")
        );
      }

      // Auto-trigger The Analyst's deterministic validation when HMC basics change
      // This is the "first pass" described in ADR-003 — runs after user confirms Setup
      const HMC_BASICS = ["companyName", "companyCountry", "companyCity", "companyOpsStartDate"];
      const basicsChanged = HMC_BASICS.some(k => k in req.body);
      if (basicsChanged || hasKeyChange) {
        import("../ai/analyst-watchdog").then(({ validateAllProperties }) =>
          validateAllProperties()
            .then(results => {
              const flagged = results.filter(r => r.status === "flagged" || r.status === "excluded_data");
              if (flagged.length > 0) {
                logger.info(`Analyst auto-validation after HMC save: ${flagged.length} properties need attention`, "global-assumptions");
              }
            })
            .catch(err => logger.warn(`Analyst auto-validation failed: ${err instanceof Error ? err.message : err}`, "global-assumptions"))
        ).catch(() => { /* ignore — inner promise already logs via .catch above */ });
      }

      res.json(assumptions);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update global assumptions", error, "GLOB-005");
    }
  });

  // ────────────────────────────────────────────────────────────
  // PER-TAB SAVE — data-only, no Specialist dispatch
  // POST /api/global-assumptions/save-tab marks a Company Assumptions tab
  // as saved (union into globalAssumptions.savedTabs jsonb), persists any
  // patched fields, and (for the funding/revenue tabs) reports any
  // hard-required fields the user hasn't filled in yet so the UI can
  // surface them. It does NOT dispatch The Analyst — per
  // .claude/rules/analyst-trigger-discipline.md, The Analyst evaluates
  // ONLY when the user explicitly presses <AnalystButton />. The
  // findObservedMissingCandidateFields telemetry below is observability
  // (records which optional fields users typically omit so admins can
  // promote them via Required Fields tab); it does not run an evaluator.
  //
  // Save semantics extracted to `./global-assumptions-save-tab.ts` so the
  // Rebecca `save_company_assumption_tab` tool can call the same service
  // without behavioral divergence (task W1.2).
  // ────────────────────────────────────────────────────────────
  const saveTabSchema = z.object({
    tabKey: z.enum(COMPANY_ASSUMPTION_TAB_KEYS),
    patch: z.record(z.unknown()).optional(),
    /** When true, removes tabKey from savedTabs instead of adding it.
     *  Used by the AnalystCheckDialog "Adjust" action to roll back a save
     *  the user no longer wants to commit. */
    unsave: z.boolean().optional(),
    fundingInputs: z
      .object({
        runwayBufferMonths: z.number().nullable().optional(),
        sizingOvershootPct: z.number().nullable().optional(),
        trancheGapMonths: z.number().nullable().optional(),
        revenueRampDelayMonths: z.number().nullable().optional(),
        burnFlexDownPct: z.number().nullable().optional(),
      })
      .optional(),
  });

  app.post("/api/global-assumptions/save-tab", requireAuth, async (req, res) => {
    try {
      const parsed = saveTabSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const userId = getAuthUser(req).id;
      const result = await saveCompanyAssumptionTab({ ...parsed.data, userId });
      logActivity(req, "update", "global_assumptions", result.savedId, `Save tab: ${parsed.data.tabKey}`);

      const responseBody: {
        ok: true;
        savedTabs: string[];
        requiredFieldsMissing?: string[];
      } = { ok: true, savedTabs: result.savedTabs };
      if (result.requiredFieldsMissing && result.requiredFieldsMissing.length > 0) {
        responseBody.requiredFieldsMissing = result.requiredFieldsMissing;
      }
      res.json(responseBody);
    } catch (error: unknown) {
      if (error instanceof SaveCompanyAssumptionTabValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logAndSendError(res, "Failed to save Company Assumptions tab", error, "GLOB-006");
    }
  });

  // ────────────────────────────────────────────────────────────
  // ASSUMPTION CHANGE LOG
  // POST used when a user keeps a value that's outside The Analyst's
  // recommended range (change_source = "user_override"), so we have an
  // audit trail of informed divergences from guidance.
  // ────────────────────────────────────────────────────────────
  const assumptionChangeLogSchema = z.object({
    entityType: z.enum(["company", "property", "scenario"]),
    entityId: z.number().int(),
    fieldName: z.string().min(1),
    previousValue: z.union([z.string(), z.number()]).optional(),
    newValue: z.union([z.string(), z.number()]).optional(),
    changeSource: z.enum(["user_override", "user_accepted_range", "manual_edit"]),
    reason: z.string().optional(),
  });
  app.post("/api/assumption-change-log", requireAuth, async (req, res) => {
    try {
      const parsed = assumptionChangeLogSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const { previousValue, newValue, ...rest } = parsed.data;
      await storage.logAssumptionChange({
        ...rest,
        previousValue: previousValue != null ? String(previousValue) : undefined,
        newValue: newValue != null ? String(newValue) : undefined,
        userId: getAuthUser(req).id,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to log assumption change", error, "GLOB-007");
    }
  });

  // ────────────────────────────────────────────────────────────
  // ASSUMPTION ACKNOWLEDGMENTS — "Keep my value" memory
  // When a user keeps a value outside The Analyst's range we record the
  // snapshot here so the warning generator skips re-flagging it on
  // subsequent saves. Cleared (DELETE) when the user later edits the
  // field, so a fresh divergence re-surfaces.
  // ────────────────────────────────────────────────────────────
  const acknowledgmentSchema = z.object({
    entityType: z.enum(["company", "property"]),
    entityId: z.number().int().nonnegative(),
    fieldName: z.string().min(1),
    valueAtAck: z.number(),
    rangeLowAtAck: z.number(),
    rangeHighAtAck: z.number(),
  });

  app.get("/api/assumption-acknowledgments", requireAuth, async (req, res) => {
    try {
      const entityType = String(req.query.entityType ?? "");
      const entityId = Number(req.query.entityId ?? 0);
      if (!["company", "property"].includes(entityType)) {
        return res.status(400).json({ error: "entityType must be 'company' or 'property'", code: "GLOB-016" });
      }
      const rows = await storage.listAcknowledgments(entityType, entityId, getAuthUser(req).id);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list acknowledgments", error, "GLOB-008");
    }
  });

  app.post("/api/assumption-acknowledgments", requireAuth, async (req, res) => {
    try {
      const parsed = acknowledgmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const row = await storage.upsertAcknowledgment({
        ...parsed.data,
        userId: getAuthUser(req).id,
      });
      res.json(row);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to upsert acknowledgment", error, "GLOB-009");
    }
  });

  app.delete("/api/assumption-acknowledgments/:fieldName", requireAuth, async (req, res) => {
    try {
      const entityType = String(req.query.entityType ?? "company");
      const entityId = Number(req.query.entityId ?? 0);
      if (!["company", "property"].includes(entityType)) {
        return res.status(400).json({ error: "entityType must be 'company' or 'property'", code: "GLOB-017" });
      }
      await storage.deleteAcknowledgment(entityType, entityId, String(req.params.fieldName), getAuthUser(req).id);
      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete acknowledgment", error, "GLOB-010");
    }
  });

  app.get("/api/appearance-defaults", requireAuth, async (req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      res.json({
        defaultColorMode: ga?.defaultColorMode ?? null,
        defaultBgAnimation: ga?.defaultBgAnimation ?? null,
        defaultFontPreference: ga?.defaultFontPreference ?? null,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch appearance defaults", error, "GLOB-011");
    }
  });

  app.patch("/api/appearance-defaults", requireAdmin, async (req, res) => {
    try {
      const validation = appearanceDefaultsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found", code: "GLOB-018" });
      }
      const patch: Record<string, unknown> = {};
      if (validation.data.defaultColorMode !== undefined) patch.defaultColorMode = validation.data.defaultColorMode;
      if (validation.data.defaultBgAnimation !== undefined) patch.defaultBgAnimation = validation.data.defaultBgAnimation;
      if (validation.data.defaultFontPreference !== undefined) patch.defaultFontPreference = validation.data.defaultFontPreference;
      const updated = await storage.patchGlobalAssumptions(current.id, patch);
      logActivity(req, "update", "global_assumptions", updated.id, "Appearance Defaults");
      res.json({
        defaultColorMode: updated.defaultColorMode ?? null,
        defaultBgAnimation: updated.defaultBgAnimation ?? null,
        defaultFontPreference: updated.defaultFontPreference ?? null,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update appearance defaults", error, "GLOB-012");
    }
  });

  // ── ICP Bracket Mix endpoints ──────────────────────────────────────────────
  // GET  /api/company/bracket-mix — return current mix + catalog
  // POST /api/company/bracket-mix/assign — run minion, save, return mix
  // PATCH /api/company/bracket-mix — manual weight update

  app.get("/api/company/bracket-mix", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const ga = await storage.getGlobalAssumptions(userId);
      if (!ga) return res.status(404).json({ error: "Global assumptions not found", code: "BRAK-001" });

      const { BRACKET_CATALOG } = await import("../ai/icp/bracket-catalog");
      res.json({
        mix: (ga as unknown as Record<string, unknown>).bracketMix ?? null,
        catalog: BRACKET_CATALOG,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch bracket mix", error, "BRAK-002");
    }
  });

  app.post("/api/company/bracket-mix/assign", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const [ga, properties] = await Promise.all([
        storage.getGlobalAssumptions(userId),
        storage.getAllProperties(userId),
      ]);
      if (!ga) return res.status(404).json({ error: "Global assumptions not found", code: "BRAK-003" });

      const { assignBrackets } = await import("../ai/icp/bracket-assignment-minion");
      const mix = await assignBrackets(properties, ga);

      const updated = await storage.patchGlobalAssumptions(ga.id, { bracketMix: mix });
      logActivity(req, "assign-bracket-mix", "global_assumptions", updated.id, "ICP Bracket Mix");

      const { BRACKET_CATALOG } = await import("../ai/icp/bracket-catalog");
      res.json({
        mix: (updated as unknown as Record<string, unknown>).bracketMix,
        catalog: BRACKET_CATALOG,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to assign bracket mix", error, "BRAK-004");
    }
  });

  const bracketMixPatchSchema = z.object({
    entries: z.array(
      z.object({
        id: z.string().min(1),
        weight: z.number().min(0).max(1),
      })
    ).min(1),
  });

  app.patch("/api/company/bracket-mix", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const validation = bracketMixPatchSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error), code: "BRAK-005" });
      }

      const ga = await storage.getGlobalAssumptions(userId);
      if (!ga) return res.status(404).json({ error: "Global assumptions not found", code: "BRAK-006" });

      const current = (ga as unknown as Record<string, unknown>).bracketMix as Record<string, unknown> | null ?? {};
      const existingEntries = Array.isArray((current as Record<string, unknown>).entries)
        ? (current as Record<string, unknown>).entries as Record<string, unknown>[]
        : [];

      // Merge the new weights into the existing entries
      const weightMap = new Map(validation.data.entries.map((e) => [e.id, e.weight]));
      const mergedEntries = existingEntries.map((entry) => {
        const newWeight = weightMap.get(String(entry.id));
        return newWeight !== undefined ? { ...entry, weight: newWeight } : entry;
      });

      // Normalise so weights sum to 1.0
      const total = mergedEntries.reduce((s, e) => s + (Number(e.weight) || 0), 0);
      const normEntries =
        total > 0 && Math.abs(total - 1) > 0.001
          ? mergedEntries.map((e) => ({
              ...e,
              weight: Math.round((Number(e.weight) / total) * 1000) / 1000,
            }))
          : mergedEntries;

      const newMix = {
        ...(typeof current === "object" && current !== null ? current : {}),
        entries: normEntries,
        assignedAt: (current as Record<string, unknown>).assignedAt ?? new Date().toISOString(),
      };

      const updated = await storage.patchGlobalAssumptions(ga.id, { bracketMix: newMix });
      logActivity(req, "update-bracket-mix", "global_assumptions", updated.id, "ICP Bracket Mix");

      const { BRACKET_CATALOG } = await import("../ai/icp/bracket-catalog");
      res.json({
        mix: (updated as unknown as Record<string, unknown>).bracketMix,
        catalog: BRACKET_CATALOG,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update bracket mix", error, "BRAK-007");
    }
  });

  app.get("/api/company/service-templates", requireAuth, async (_req, res) => {
    try {
      const templates = await storage.getAllServiceTemplates();
      res.json(templates);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch service templates", error, "GLOB-013");
    }
  });

  app.patch("/api/company/service-templates/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "template ID");
      if (id === null) return;

      const validation = updateServiceTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: zodErrorMessage(validation.error) });
      }

      const template = await storage.updateServiceTemplate(id, validation.data);
      if (!template) return res.status(404).json({ error: "Service template not found", code: "GLOB-019" });
      logActivity(req, "update-service-template", "service-template", id, template.name);
      res.json(template);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update service template", error, "GLOB-014");
    }
  });
}
