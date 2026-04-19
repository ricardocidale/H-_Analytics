import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManagementAccess, requireAdmin , getAuthUser } from "../auth";
import { insertGlobalAssumptionsSchema, updateServiceTemplateSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logActivity, logAndSendError, parseParamId } from "./helpers";
import { z } from "zod";
import { invalidateComputeCache } from "../finance/cache";
import { logger } from "../logger";
import { flag } from "../feature-flags";

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

  app.get("/api/global-assumptions", requireAuth, async (req, res) => {
    try {
      const assumptions = await storage.getGlobalAssumptions(getAuthUser(req).id);
      let companyLogoUrl: string | null = null;
      if (assumptions?.companyLogoId) {
        const logo = await storage.getLogo(assumptions.companyLogoId);
        if (logo) companyLogoUrl = logo.url;
      }
      res.json({ ...assumptions, companyLogoUrl, rebeccaV2: flag("REBECCA_V2") });
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
      const updated = await storage.patchGlobalAssumptions(current.id, patch);
      logActivity(req, "update", "global_assumptions", updated.id, "Rebecca Config");
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update global assumptions", error);
    }
  });

  app.put("/api/global-assumptions", requireManagementAccess, async (req, res) => {
    try {
      const current = await storage.getGlobalAssumptions(getAuthUser(req).id);
      // Validate req.body first, then merge with current — prevents prototype pollution
      const bodyValidation = insertGlobalAssumptionsSchema.partial().safeParse(req.body);
      if (!bodyValidation.success) {
        const error = fromZodError(bodyValidation.error);
        return res.status(400).json({ error: error.message });
      }
      const merged = { ...(current ?? {}), ...bodyValidation.data };
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

      const assumptions = await storage.upsertGlobalAssumptions(finalData, getAuthUser(req).id);
      invalidateComputeCache();
      logActivity(req, "update", "global_assumptions", assumptions.id, "System Settings");

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
  // ANALYST WATCHDOG — per-tab Save with deterministic verdict
  // POST /api/global-assumptions/save-tab marks a Company Assumptions tab
  // as saved (union into globalAssumptions.savedTabs jsonb), persists any
  // patched fields, and returns a watchdog result. Funding tab runs the
  // real evaluator against cached benchmarks; other 5 tabs return a stub.
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

  app.post("/api/global-assumptions/save-tab", requireManagementAccess, async (req, res) => {
    try {
      const parsed = saveTabSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { tabKey, patch, fundingInputs, unsave } = parsed.data;
      const userId = getAuthUser(req).id;

      const current = await storage.getGlobalAssumptions(userId);
      const baseRow = (current ?? {}) as Record<string, unknown>;
      const merged = { ...baseRow, ...(patch ?? {}) };
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

      let watchdog;
      if (tabKey === "funding") {
        const [{ evaluateCapitalRaise }, benchmarks] = await Promise.all([
          import("../../engine/watchdog/capitalRaiseEvaluator"),
          storage.getAnalystWatchdogBenchmarks(userId),
        ]);
        watchdog = evaluateCapitalRaise(fundingInputs ?? {}, benchmarks);
      } else if (tabKey === "revenue") {
        // Revenue evaluator pulls inputs from the freshly-saved row itself —
        // no client-side payload needed. Falls back to system constants when
        // a per-company override is null.
        const [{ evaluateRevenue }, { DEFAULT_REVENUE_BENCHMARKS }, c] = await Promise.all([
          import("../../engine/watchdog/revenueEvaluator"),
          import("@shared/constants-revenue-benchmarks"),
          import("@shared/constants"),
        ]);
        const savedRow = saved as Record<string, unknown>;
        const num = (k: string) => {
          const v = savedRow[k];
          return typeof v === "number" && Number.isFinite(v) ? v : null;
        };
        watchdog = evaluateRevenue(
          {
            marketingRate:      num("defaultCostRateMarketing") ?? c.DEFAULT_COST_RATE_MARKETING,
            fbRevenueShare:     num("defaultRevShareFb")        ?? c.DEFAULT_REV_SHARE_FB,
            eventsRevenueShare: num("defaultRevShareEvents")    ?? c.DEFAULT_REV_SHARE_EVENTS,
            otherRevenueShare:  num("defaultRevShareOther")     ?? c.DEFAULT_REV_SHARE_OTHER,
            cateringBoostPct:   num("defaultCateringBoostPct")  ?? c.DEFAULT_CATERING_BOOST_PCT,
          },
          DEFAULT_REVENUE_BENCHMARKS,
        );
      } else {
        const { evaluateStub } = await import("../../engine/watchdog/capitalRaiseEvaluator");
        watchdog = evaluateStub();
      }

      res.json({ ok: true, savedTabs: nextSaved, watchdog });
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
  app.post("/api/assumption-change-log", requireManagementAccess, async (req, res) => {
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

  app.post("/api/assumption-acknowledgments", requireManagementAccess, async (req, res) => {
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

  app.delete("/api/assumption-acknowledgments/:fieldName", requireManagementAccess, async (req, res) => {
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

  app.get("/api/company/service-templates", requireManagementAccess, async (_req, res) => {
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
