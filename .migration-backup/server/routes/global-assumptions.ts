import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { insertGlobalAssumptionsSchema, updateServiceTemplateSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logActivity, logAndSendError, parseParamId } from "./helpers";
import { z } from "zod";
import { invalidateComputeCache } from "../finance/cache";
import { logger } from "../logger";
import { flag } from "../feature-flags";
import { stripCanonicalDenylistedFields } from "./global-assumptions-denylist";
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
      logAndSendError(res, "Failed to fetch exit multiples", error);
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
      logAndSendError(res, "Failed to compute industry vertical suggestion", error);
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
      res.json({ ...overlaid, companyLogoUrl, rebeccaV2: flag("REBECCA_V2") });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch global assumptions", error);
    }
  });

  // PATCH — partial updates for admin-configurable subsections (e.g. Rebecca config)
  const rebeccaPatchSchema = z.object({
    rebeccaEnabled: z.boolean().optional(),
    rebeccaDisplayName: z.string().min(1).max(50).optional(),
    rebeccaSystemPrompt: z.string().max(5000).nullable().optional(),
    rebeccaChatEngine: z.enum(["gemini", "perplexity"]).optional(),
    // Task #499 — full Rebecca config payload (deep-merged on top of stored row).
    rebeccaConfig: rebeccaSettingsPatchSchema.optional(),
  });

  app.patch("/api/global-assumptions", requireAdmin, async (req, res) => {
    try {
      const validation = rebeccaPatchSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found" });
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
      logAndSendError(res, "Failed to update global assumptions", error);
    }
  });

  app.put("/api/global-assumptions", requireAuth, async (req, res) => {
    try {
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      // Validate req.body first, then merge with current — prevents prototype pollution
      const bodyValidation = insertGlobalAssumptionsSchema.partial().safeParse(req.body);
      if (!bodyValidation.success) {
        const error = fromZodError(bodyValidation.error);
        return res.status(400).json({ error: error.message });
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
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
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
      logAndSendError(res, "Failed to update global assumptions", error);
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
  // ────────────────────────────────────────────────────────────
  const TAB_KEYS = [
    "company", "funding", "revenue", "compensation", "overhead", "property-defaults",
  ] as const;
  const saveTabSchema = z.object({
    tabKey: z.enum(TAB_KEYS),
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
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { tabKey, patch, fundingInputs, unsave } = parsed.data;
      const userId = getAuthUser(req).id;

      const current = await storage.getGlobalAssumptions(userId);
      const baseRow = (current ?? {}) as Record<string, unknown>;
      // Task #379: sanitize patch to drop canonically-owned fields (e.g.
      // `depreciationYears`) before merge. The save-tab path must enforce
      // the same denylist as PUT /api/global-assumptions; otherwise a
      // non-admin management user could bypass the Constants-tab admin
      // gate by submitting a crafted `patch` payload.
      const sanitizedPatch = stripCanonicalDenylistedFields(
        (patch ?? {}) as Record<string, unknown>,
      );
      const merged = { ...baseRow, ...sanitizedPatch };
      delete merged.id; delete merged.createdAt; delete merged.updatedAt;
      delete (merged as Record<string, unknown>).companyLogoUrl;

      const existingSaved: string[] = Array.isArray(baseRow.savedTabs)
        ? (baseRow.savedTabs as string[]).filter((k) => TAB_KEYS.includes(k as typeof TAB_KEYS[number]))
        : [];
      const nextSaved = unsave
        ? existingSaved.filter((k) => k !== tabKey)
        : Array.from(new Set([...existingSaved, tabKey]));
      (merged as Record<string, unknown>).savedTabs = nextSaved;

      const validation = insertGlobalAssumptionsSchema.partial().safeParse(merged);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const fullValidation = insertGlobalAssumptionsSchema.safeParse(merged);
      const dataToWrite = fullValidation.success ? fullValidation.data : (merged as Record<string, unknown>);

      const saved = await storage.upsertGlobalAssumptions(
        dataToWrite as Parameters<typeof storage.upsertGlobalAssumptions>[0],
        userId,
      );
      invalidateComputeCache();
      logActivity(req, "update", "global_assumptions", saved.id, `Save tab: ${tabKey}`);

      // Phase 5C-task-3: supersede stale company guidance when material inputs change
      const GA_STALENESS_TRIGGER_KEYS_SAVE_TAB = [
        "baseManagementFee", "incentiveManagementFee",
        "inflationRate", "companyTaxRate", "commissionRate", "staffSalary",
      ];
      const patchKeys = Object.keys(sanitizedPatch);
      const hasGaKeyChange = patchKeys.some((k) => GA_STALENESS_TRIGGER_KEYS_SAVE_TAB.includes(k) &&
        (sanitizedPatch as Record<string, unknown>)[k] !== (baseRow as Record<string, unknown>)[k]);
      if (hasGaKeyChange) {
        storage.markAssumptionGuidanceSuperseded("company", userId, null).catch(err =>
          logger.warn(`Failed to supersede company guidance (save-tab): ${err instanceof Error ? err.message : err}`, "global-assumptions")
        );
      }

      // G1.5b-pre-a: Save is data-only. The Analyst dispatches ONLY on
      // explicit <AnalystButton /> press (rule:
      // .claude/rules/analyst-trigger-discipline.md). We still report
      // hard-required field gaps so the form can highlight them, and we
      // emit observed-missing telemetry so admins can promote
      // candidate fields via the Required Fields tab.
      let requiredFieldsMissing: string[] | null = null;
      // Phase 4: emit observed-missing telemetry for Specialist C
      // (`mgmt-co.icp-intelligence`) when the Company Assumptions tab is
      // saved. C is a stub specialist (no dispatch yet), but its
      // candidateFields live on this surface (companyTaxRate,
      // baseManagementFee, incentiveManagementFee), so admins can already
      // begin promoting them via the Required Fields tab.
      if (tabKey === "company") {
        try {
          const [
            { findObservedMissingCandidateFields },
            { getSpecialistById },
          ] = await Promise.all([
            import("../../engine/analyst/surface/mgmt-co"),
            import("../../engine/analyst/registry/specialist-catalog"),
          ]);
          const ICP_ID = "mgmt-co.icp-intelligence";
          const def = getSpecialistById(ICP_ID);
          if (def) {
            const cfg = await storage.getOrCreateSpecialistConfig(ICP_ID);
            const observed = findObservedMissingCandidateFields(
              saved as Record<string, unknown>,
              def.candidateFields ?? [],
              (cfg as { fieldRequirements?: Record<string, "hard" | "recommended" | "off"> }).fieldRequirements,
            );
            await storage.recordObservedMissingFields(ICP_ID, observed);
          }
        } catch (icpErr: unknown) {
          logger.warn(
            `ICP observed-missing emission failed: ${icpErr instanceof Error ? icpErr.message : String(icpErr)}`,
            "global-assumptions",
          );
        }
      }

      if (tabKey === "funding" || tabKey === "revenue") {
        // Save-time work for the funding/revenue tabs is purely:
        //   1. report any HARD-required field gaps so the form can flag
        //      them, and
        //   2. emit observed-missing telemetry so admins can promote
        //      candidate fields via the Required Fields tab.
        // No Specialist dispatch happens here — that is the sole
        // responsibility of <AnalystButton /> (see analyst-trigger-discipline.md).
        const [
          {
            MGMT_CO_FUNDING_ID,
            MGMT_CO_REVENUE_ID,
            findMissingRequiredFields,
            findObservedMissingCandidateFields,
          },
          { deriveHardRequiredFieldKeys },
          { getSpecialistById, getLockedHardCandidateKeys },
        ] = await Promise.all([
          import("../../engine/analyst/surface/mgmt-co"),
          import("./admin/specialists"),
          import("../../engine/analyst/registry/specialist-catalog"),
        ]);

        const activeSpecialistId =
          tabKey === "funding" ? MGMT_CO_FUNDING_ID : MGMT_CO_REVENUE_ID;
        const activeCfg = await storage.getOrCreateSpecialistConfig(activeSpecialistId);
        const activeDef = getSpecialistById(activeSpecialistId);

        // Funding gate-source is the dispatch-payload namespace
        // (CapitalRaiseInputs — runwayBufferMonths, etc.) the user fills
        // in on the funding tab. Revenue gate-source is the freshly-saved
        // row (defaultCostRateMarketing, defaultRevShareFb, …) — the
        // transform that lives in the AnalystButton handler applies
        // `?? DEFAULT_*` fallbacks that would mask missing values, so
        // gating against the saved row is the truthful surface here too.
        const gateSource: Record<string, unknown> =
          tabKey === "funding"
            ? ((fundingInputs ?? {}) as Record<string, unknown>)
            : (saved as Record<string, unknown>);

        const fieldRequirements = (activeCfg as {
          fieldRequirements?: Record<string, "hard" | "recommended" | "off">;
        }).fieldRequirements;

        const gateFields = deriveHardRequiredFieldKeys(
          fieldRequirements,
          activeCfg.requiredFields,
          getLockedHardCandidateKeys(activeSpecialistId),
        );
        const missing = findMissingRequiredFields(gateSource, gateFields);
        if (missing.length > 0) requiredFieldsMissing = missing;

        // Telemetry: record candidate-field keys this save observed as
        // missing-but-useful (toggle="off"). The Required Fields tab
        // surfaces these as "promote to Recommended / Hard-required"
        // recommendations (see SpecialistPage.tsx).
        const observedMissing = findObservedMissingCandidateFields(
          gateSource,
          activeDef?.candidateFields ?? [],
          fieldRequirements,
        );
        await storage.recordObservedMissingFields(activeSpecialistId, observedMissing);
      }

      // G1.5b-pre-a: response shape no longer carries `verdict` or
      // `prerequisiteFailures` — those are AnalystButton-press concerns.
      const responseBody: {
        ok: true;
        savedTabs: string[];
        requiredFieldsMissing?: string[];
      } = { ok: true, savedTabs: nextSaved };
      if (requiredFieldsMissing && requiredFieldsMissing.length > 0) {
        responseBody.requiredFieldsMissing = requiredFieldsMissing;
      }
      res.json(responseBody);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to save Company Assumptions tab", error);
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
        return res.status(400).json({ error: fromZodError(parsed.error).message });
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
      logAndSendError(res, "Failed to log assumption change", error);
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
        return res.status(400).json({ error: "entityType must be 'company' or 'property'" });
      }
      const rows = await storage.listAcknowledgments(entityType, entityId, getAuthUser(req).id);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list acknowledgments", error);
    }
  });

  app.post("/api/assumption-acknowledgments", requireAuth, async (req, res) => {
    try {
      const parsed = acknowledgmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const row = await storage.upsertAcknowledgment({
        ...parsed.data,
        userId: getAuthUser(req).id,
      });
      res.json(row);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to upsert acknowledgment", error);
    }
  });

  app.delete("/api/assumption-acknowledgments/:fieldName", requireAuth, async (req, res) => {
    try {
      const entityType = String(req.query.entityType ?? "company");
      const entityId = Number(req.query.entityId ?? 0);
      if (!["company", "property"].includes(entityType)) {
        return res.status(400).json({ error: "entityType must be 'company' or 'property'" });
      }
      await storage.deleteAcknowledgment(entityType, entityId, String(req.params.fieldName), getAuthUser(req).id);
      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete acknowledgment", error);
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
      logAndSendError(res, "Failed to fetch appearance defaults", error);
    }
  });

  app.patch("/api/appearance-defaults", requireAdmin, async (req, res) => {
    try {
      const validation = appearanceDefaultsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!current) {
        return res.status(404).json({ error: "Global assumptions not found" });
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
      logAndSendError(res, "Failed to update appearance defaults", error);
    }
  });

  app.get("/api/company/service-templates", requireAuth, async (_req, res) => {
    try {
      const templates = await storage.getAllServiceTemplates();
      res.json(templates);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch service templates", error);
    }
  });

  app.patch("/api/company/service-templates/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "template ID");
      if (id === null) return;

      const validation = updateServiceTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const template = await storage.updateServiceTemplate(id, validation.data);
      if (!template) return res.status(404).json({ error: "Service template not found" });
      logActivity(req, "update-service-template", "service-template", id, template.name);
      res.json(template);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update service template", error);
    }
  });
}
