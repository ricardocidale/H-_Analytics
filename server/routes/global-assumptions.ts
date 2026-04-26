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
import { stripCanonicalDenylistedFields } from "./global-assumptions-denylist";
import { rebeccaSettingsPatchSchema, mergeRebeccaSettings } from "@shared/rebecca-settings";

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

  app.put("/api/global-assumptions", requireManagementAccess, async (req, res) => {
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

      // Phase 3b: Funding + Revenue tabs return a real AnalystVerdict from
      // the Surface Router. Other tabs return verdict=null (no Analyst
      // gate yet — Phase 4 ships Compensation, etc.).
      let verdict = null;
      let requiredFieldsMissing: string[] | null = null;
      let prerequisiteFailures: { id: string; specialistId: string; reason: string }[] | null = null;
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
        const [
          { createMgmtCoRouter, MGMT_CO_FUNDING_ID, MGMT_CO_REVENUE_ID, findMissingRequiredFields, findObservedMissingCandidateFields, RequiredFieldsMissingError },
          { createVoiceRenderer },
          { createQualityScorer },
          { DEFAULT_REVENUE_BENCHMARKS },
          c,
          fundingBenchmarks,
          { deriveHardRequiredFieldKeys },
          { evaluatePrerequisites },
          { getSpecialistById },
        ] = await Promise.all([
          import("../../engine/analyst/surface/mgmt-co"),
          import("../../engine/analyst/voice/voice-renderer"),
          import("../../engine/analyst/quality/quality-scorer"),
          import("@shared/constants-revenue-benchmarks"),
          import("@shared/constants"),
          storage.getAnalystWatchdogBenchmarks(userId),
          import("./admin/specialists"),
          import("../../engine/analyst/registry/prerequisite-registry"),
          import("../../engine/analyst/registry/specialist-catalog"),
        ]);

        // P5: load admin-edited per-Specialist config (prompt/model/required-fields).
        // P6a: requiredFields now gates dispatch — see withRequiredFieldsGate
        // in engine/analyst/surface/mgmt-co/index.ts. The save above is
        // preserved either way (drafts are permissive); the gate only
        // controls whether the Specialist runs.
        const [fundingCfg, revenueCfg] = await Promise.all([
          storage.getOrCreateSpecialistConfig(MGMT_CO_FUNDING_ID),
          storage.getOrCreateSpecialistConfig(MGMT_CO_REVENUE_ID),
        ]);
        const router = createMgmtCoRouter(
          { voiceRenderer: createVoiceRenderer(), qualityScorer: createQualityScorer() },
          { funding: fundingBenchmarks, revenue: DEFAULT_REVENUE_BENCHMARKS },
          {
            configs: {
              funding: {
                promptTemplate: fundingCfg.promptTemplate,
                modelResourceId: fundingCfg.modelResourceId,
                requiredFields: fundingCfg.requiredFields ?? [],
              },
              revenue: {
                promptTemplate: revenueCfg.promptTemplate,
                modelResourceId: revenueCfg.modelResourceId,
                // P6a: revenue gate runs at the route handler (pre-dispatch)
                // against saved-row keys. The router-level wrapper would see
                // the post-default-substitution dispatch payload (different
                // namespace), so passing requiredFields here would either
                // false-positive (admin-entered saved-row key, e.g.
                // "defaultCostRateMarketing", missing from dispatch payload)
                // or be a silent no-op for dispatch-payload keys (e.g.
                // "marketingRate") because defaults always fill them. We
                // therefore intentionally pass [] and rely on the route
                // pre-check as the sole revenue gate.
                requiredFields: [],
              },
            },
          },
        );

        // Single-tenant: hardcode the L+B luxury persona for now. Phase 4
        // will plumb persona resolution through user/company settings.
        const persona = { segment: "L+B", tier: "luxury", market: "US" } as const;

        // P6a: required-fields gate runs HERE (pre-dispatch) so the natural
        // namespace per Specialist is the one admins author against:
        //   - funding: keys of the dispatch payload `fundingInputs`
        //     (i.e. CapitalRaiseInputs — runwayBufferMonths, etc.)
        //   - revenue: keys of the freshly-saved row (defaultCostRateMarketing,
        //     defaultRevShareFb, ...) — NOT the transformed dispatch payload,
        //     because the transform applies `?? DEFAULT_*` fallbacks that
        //     would mask missing values from a router-level gate.
        // The router still wraps each Specialist with withRequiredFieldsGate
        // as defense-in-depth (any direct router caller bypassing this
        // handler still gets gated for funding); the wrapped revenue path is
        // a no-op because the dispatch payload here always satisfies it.
        const gateSource: Record<string, unknown> =
          tabKey === "funding"
            ? ((fundingInputs ?? {}) as Record<string, unknown>)
            : (saved as Record<string, unknown>);
        // Prefer the per-Specialist toggle state (`fieldRequirements`) over the
        // legacy `requiredFields` column. `deriveHardRequiredFieldKeys` falls
        // back to the legacy list only if no toggle has been set yet, so
        // Specialists migrated to the toggle UI gate against the truthful
        // catalog-driven hard set.
        const activeCfg = tabKey === "funding" ? fundingCfg : revenueCfg;
        const { getLockedHardCandidateKeys: _getLocked } = await import(
          "../../engine/analyst/registry/specialist-catalog"
        );
        const gateFields = deriveHardRequiredFieldKeys(
          (activeCfg as { fieldRequirements?: Record<string, "hard" | "recommended" | "off"> }).fieldRequirements,
          activeCfg.requiredFields,
          _getLocked(tabKey === "funding" ? MGMT_CO_FUNDING_ID : MGMT_CO_REVENUE_ID),
        );
        const activeSpecialistId = tabKey === "funding" ? MGMT_CO_FUNDING_ID : MGMT_CO_REVENUE_ID;
        const activeDef = getSpecialistById(activeSpecialistId);
        const toggledOnPrereqs = Object.entries(
          (activeCfg as { prerequisiteToggles?: Record<string, boolean> }).prerequisiteToggles ?? {},
        )
          .filter(([id, on]) => on === true && (activeDef?.prerequisites ?? []).includes(id))
          .map(([id]) => id);
        const prereqFails = toggledOnPrereqs.length === 0
          ? []
          : await evaluatePrerequisites(toggledOnPrereqs, { storage, userId });
        const missing = findMissingRequiredFields(gateSource, gateFields);

        // Telemetry: record candidate-field keys this run observed as
        // missing-but-useful (toggle="off"). The Required Fields tab
        // surfaces these as "promote to Recommended / Hard-required"
        // recommendations (see SpecialistPage.tsx). We persist regardless
        // of whether the dispatch ultimately runs — even gated runs
        // produce a useful signal about what the user typically omits.
        const observedMissing = findObservedMissingCandidateFields(
          gateSource,
          activeDef?.candidateFields ?? [],
          (activeCfg as { fieldRequirements?: Record<string, "hard" | "recommended" | "off"> }).fieldRequirements,
        );
        await storage.recordObservedMissingFields(activeSpecialistId, observedMissing);

        if (prereqFails.length > 0) {
          prerequisiteFailures = prereqFails.map((f) => ({
            id: f.id,
            specialistId: activeSpecialistId,
            reason: f.reason,
          }));
          if (missing.length > 0) requiredFieldsMissing = missing;
        } else if (missing.length > 0) {
          requiredFieldsMissing = missing;
        } else {
          try {
            if (tabKey === "funding") {
              verdict = await router.dispatch({
                specialistId: MGMT_CO_FUNDING_ID,
                payload: fundingInputs ?? {},
                persona,
              });
              // TEMP[ADR-007/G1]: dump verdict.meta for behavioral verification (remove after sign-off)
              console.info(
                "[G1-VERIFY server dispatch] funding meta:",
                JSON.stringify(verdict?.meta ?? null, null, 2),
              );
            } else {
              // Revenue specialist reads inputs from the freshly-saved row.
              // The saved-row → dispatch-key map is the single source of truth
              // (engine/analyst/registry/required-field-keys.ts: REVENUE_FIELD_MAPPINGS)
              // — same map drives the admin allow-list, so the two cannot diverge.
              const { REVENUE_FIELD_MAPPINGS } = await import(
                "../../engine/analyst/registry/required-field-keys"
              );
              const REVENUE_DISPATCH_DEFAULTS: Record<
                typeof REVENUE_FIELD_MAPPINGS[number]["dispatchKey"],
                number
              > = {
                marketingRate:      c.DEFAULT_COST_RATE_MARKETING,
                fbRevenueShare:     c.DEFAULT_REV_SHARE_FB,
                eventsRevenueShare: c.DEFAULT_REV_SHARE_EVENTS,
                otherRevenueShare:  c.DEFAULT_REV_SHARE_OTHER,
                cateringBoostPct:   c.DEFAULT_CATERING_BOOST_PCT,
              };
              const savedRow = saved as Record<string, unknown>;
              const num = (k: string) => {
                const v = savedRow[k];
                return typeof v === "number" && Number.isFinite(v) ? v : null;
              };
              const revenuePayload = Object.fromEntries(
                REVENUE_FIELD_MAPPINGS.map(({ savedRowKey, dispatchKey }) => [
                  dispatchKey,
                  num(savedRowKey) ?? REVENUE_DISPATCH_DEFAULTS[dispatchKey],
                ]),
              ) as Record<
                typeof REVENUE_FIELD_MAPPINGS[number]["dispatchKey"],
                number
              >;
              verdict = await router.dispatch({
                specialistId: MGMT_CO_REVENUE_ID,
                payload: revenuePayload,
                persona,
              });
            }
          } catch (gateErr: unknown) {
            // Defense-in-depth: the router wrapper might still fire for the
            // funding path if pre-check missed an edge case. SurfaceRouter
            // wraps Specialist throws in SpecialistExecutionError, so unwrap
            // one level to find the underlying RequiredFieldsMissingError.
            const inner = (gateErr as { cause?: unknown })?.cause;
            if (inner instanceof RequiredFieldsMissingError) {
              requiredFieldsMissing = [...inner.missingFields];
              verdict = null;
            } else if (gateErr instanceof RequiredFieldsMissingError) {
              requiredFieldsMissing = [...gateErr.missingFields];
              verdict = null;
            } else {
              throw gateErr;
            }
          }
        }
      }

      res.json({ ok: true, savedTabs: nextSaved, verdict, requiredFieldsMissing, prerequisiteFailures });
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
