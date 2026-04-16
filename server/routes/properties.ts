import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, requireManagementAccess, checkPropertyAccess, checkPropertyEditAccess, getAuthUser } from "../auth";
import { insertPropertySchema, updatePropertySchema, type GlobalAssumptions } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { logActivity, logAndSendError, parseRouteId } from "./helpers";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import { processNotificationEvent, evaluateAlertRules } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { isAdminRole } from "@shared/constants";
import { invalidateComputeCache } from "../finance/cache";
import { buildPropertyDefaultsFromRegistry } from "@shared/field-registry";
import { logger } from "../logger";
import { WalkScoreService } from "../services/WalkScoreService";
import { validateFieldChanges, computeFieldAlerts } from "../ai/analyst-watchdog";
import { suggestStarRating } from "../ai/context-pack/star-rating";
import { registerPropertyUrlRoutes } from "./properties-urls";
import { computeStressScenarios, type StressAssumptions } from "@engine/helpers/stress-scenarios";
import { computePropertyDefaults } from "@engine/helpers/default-resolver";

export function buildPropertyDefaultsFromGlobal(ga?: GlobalAssumptions): Record<string, unknown> {
  return buildPropertyDefaultsFromRegistry(ga as unknown as Record<string, unknown>);
}

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // PROPERTIES ROUTES
  // Full CRUD + image management + research seeding
  // Each property represents a hotel with full pro forma assumptions.
  // POST /api/properties — creates property + seeds default fee categories
  // POST /api/properties/:id/seed-research — generates AI research values
  // ────────────────────────────────────────────────────────────

  app.get("/api/properties", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const props = isAdminRole(user.role)
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);
      const allCats = await storage.getAllFeeCategories();
      const catsByProperty = new Map<number, { name: string; rate: number; isActive: boolean }[]>();
      for (const c of allCats) {
        if (!catsByProperty.has(c.propertyId)) catsByProperty.set(c.propertyId, []);
        catsByProperty.get(c.propertyId)!.push({ name: c.name, rate: c.rate, isActive: c.isActive });
      }
      const enriched = props.map(p => ({
        ...p,
        feeCategories: catsByProperty.get(p.id) ?? [],
      }));
      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch properties", error);
    }
  });

  app.get("/api/properties/:id", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      const cats = await storage.getFeeCategoriesByProperty(property.id);
      res.json({
        ...property,
        feeCategories: cats.map(c => ({ name: c.name, rate: c.rate, isActive: c.isActive })),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch property", error);
    }
  });

  app.post("/api/properties", requireManagementAccess, async (req, res) => {
    try {
      const validation = insertPropertySchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      const globalDefaults = await storage.getGlobalAssumptions();
      const inheritedDefaults = buildPropertyDefaultsFromGlobal(globalDefaults);

      const mergedData: Record<string, unknown> = {};
      for (const [key, globalValue] of Object.entries(inheritedDefaults)) {
        const userValue = (validation.data as Record<string, unknown>)[key];
        if (userValue === undefined || userValue === null) {
          mergedData[key] = globalValue;
        }
      }

      // Layer 2: Smart defaults from quality tier, business model, country, room count
      // These override GA defaults when the property has enough classification info
      const inputData = validation.data as Record<string, unknown>;
      const qualityTier = (inputData.qualityTier as string) || "Upscale";
      const businessModel = (inputData.businessModel as string) || "hotel";
      const country = (inputData.country as string) || "United States";
      const roomCount = (inputData.roomCount as number) || 10;
      const stateProvince = (inputData.stateProvince as string) || undefined;

      try {
        const smartDefaults = computePropertyDefaults(
          qualityTier, businessModel, country, roomCount, stateProvince,
        );

        // Smart defaults fill in anything not already set by the user or GA
        const smartFields: Record<string, unknown> = {
          startAdr: smartDefaults.startAdr,
          adrGrowthRate: smartDefaults.adrGrowthRate,
          startOccupancy: smartDefaults.startOccupancy,
          maxOccupancy: smartDefaults.maxOccupancy,
          revShareFB: smartDefaults.revShareFB,
          revShareEvents: smartDefaults.revShareEvents,
          revShareOther: smartDefaults.revShareOther,
          costRateRooms: smartDefaults.costRateRooms,
          costRateFB: smartDefaults.costRateFB,
          costRateAdmin: smartDefaults.costRateAdmin,
          costRateMarketing: smartDefaults.costRateMarketing,
          costRatePropertyOps: smartDefaults.costRatePropertyOps,
          costRateUtilities: smartDefaults.costRateUtilities,
          costRateIT: smartDefaults.costRateIT,
          costRateFFE: smartDefaults.costRateFFE,
          depreciationYears: smartDefaults.depreciationYears,
          incomeTaxRate: smartDefaults.incomeTaxRate,
          propertyTaxRate: smartDefaults.propertyTaxRate,
        };

        for (const [key, smartValue] of Object.entries(smartFields)) {
          const userValue = inputData[key];
          const gaValue = mergedData[key];
          // Smart defaults only fill in when user didn't set it AND GA didn't override it
          if ((userValue === undefined || userValue === null) &&
              (gaValue === undefined || gaValue === null)) {
            mergedData[key] = smartValue;
          }
        }

        // Store provenance metadata in researchValues so the UI can show where defaults came from
        // (cannot go on mergedData directly — _defaultSources is not a DB column)
        if (smartDefaults.sources && Object.keys(smartDefaults.sources).length > 0) {
          const existingRV = (mergedData.researchValues ?? {}) as Record<string, unknown>;
          mergedData.researchValues = {
            ...existingRV,
            _defaultSources: smartDefaults.sources,
          };
        }

        logger.info(
          `Smart defaults applied: tier=${qualityTier}, model=${businessModel}, country=${country}, rooms=${roomCount}`,
          "properties",
        );
      } catch (err: unknown) {
        logger.warn(`Smart defaults computation failed (non-blocking): ${err instanceof Error ? err.message : err}`, "properties");
      }

      const user = getAuthUser(req);
      const createData = {
        ...validation.data,
        ...mergedData,
        userId: isAdminRole(user.role) ? null : user.id,
        researchValues: (validation.data as any).researchValues ?? {},
      };
      const suggestion = suggestStarRating(createData as any);
      (createData as any).starRatingSuggested = suggestion.rating;

      const property = await storage.createProperty(createData);

      // Post-creation initialization — these are best-effort; a failure here
      // should NOT orphan the property response (property already exists in DB)
      try {
        await storage.seedDefaultFeeCategories(property.id);
      } catch (feeErr: unknown) {
        logger.warn(`Failed to seed fee categories for property ${property.id} (non-blocking): ${feeErr instanceof Error ? feeErr.message : feeErr}`, "properties");
      }

      if (property.imageUrl) {
        try {
          await storage.addPropertyPhoto({
            propertyId: property.id,
            imageUrl: property.imageUrl,
            isHero: true,
          });
        } catch (photoErr: unknown) {
          logger.warn(`Failed to create hero photo for property ${property.id} (non-blocking): ${photoErr instanceof Error ? photoErr.message : photoErr}`, "properties");
        }
      }

      invalidateComputeCache();
      logActivity(req, "create", "property", property.id, property.name);

      processNotificationEvent(createEvent("PROPERTY_IMPORTED", {
        propertyId: property.id,
        propertyName: property.name,
        message: `New property added: ${property.name}`,
        link: `/property/${property.id}`,
      })).catch((err) => logger.error(`Notification error: ${err?.message || err}`, "properties"));

      res.status(201).json(property);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create property", error);
    }
  });

  app.patch("/api/properties/:id/coords", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const hasAccess = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { latitude, longitude } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number" ||
          !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "latitude must be -90..90 and longitude must be -180..180" });
      }
      const updated = await storage.updateProperty(propertyId, { latitude, longitude });
      if (!updated) {
        return res.status(404).json({ error: "Property not found" });
      }
      res.json({ latitude: updated.latitude, longitude: updated.longitude });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update coordinates", error);
    }
  });

  /**
   * GET /api/properties/defaults/preview
   * Preview smart defaults for a property before creating it.
   * Query params: qualityTier, businessModel, country, roomCount, stateProvince
   */
  app.get("/api/properties/defaults/preview", requireAuth, async (req, res) => {
    try {
      const qualityTier = (req.query.qualityTier as string) || "Upscale";
      const businessModel = (req.query.businessModel as string) || "hotel";
      const country = (req.query.country as string) || "United States";
      const roomCount = Number(req.query.roomCount) || 10;
      const stateProvince = (req.query.stateProvince as string) || undefined;

      const defaults = computePropertyDefaults(
        qualityTier, businessModel, country, roomCount, stateProvince,
      );

      res.json(defaults);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute defaults preview", error);
    }
  });

  app.patch("/api/properties/:id", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const existingProp = await checkPropertyEditAccess(getAuthUser(req), propertyId);
      if (!existingProp) {
        return res.status(403).json({ error: "Shared properties can only be edited by admin. Use scenario overrides for your own adjustments." });
      }

      const validation = updatePropertySchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      const merged = { ...existingProp, ...validation.data };
      const suggestion = suggestStarRating(merged as any);
      const updateData: Record<string, unknown> = { ...validation.data, starRatingSuggested: suggestion.rating };

      const STALENESS_TRIGGER_KEYS = [
        "starRating", "startAdr", "hospitalityType", "businessModel",
        "roomCount", "city", "stateProvince", "country",
        "revShareFB", "revShareEvents", "revShareOther",
        "maxOccupancy", "startOccupancy", "adrGrowthRate",
        "sourceUrls",
      ];
      const hasKeyChange = existingProp && STALENESS_TRIGGER_KEYS.some(
        (k) => k in validation.data && (validation.data as Record<string, unknown>)[k] !== (existingProp as Record<string, unknown>)[k]
      );
      if (hasKeyChange) {
        updateData.lastAssumptionChangeAt = new Date();
      }

      const property = await storage.updateProperty(propertyId, updateData);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }

      // Log field-level changes to assumption_change_log
      const user = getAuthUser(req);
      const changeEntries = Object.keys(validation.data)
        .filter(k => existingProp && (existingProp as Record<string, unknown>)[k] !== (validation.data as Record<string, unknown>)[k])
        .map(fieldName => ({
          entityType: "property" as const,
          entityId: propertyId,
          fieldName,
          previousValue: existingProp ? String((existingProp as Record<string, unknown>)[fieldName] ?? "") : null,
          newValue: String((validation.data as Record<string, unknown>)[fieldName] ?? ""),
          changeSource: "manual" as const,
          userId: user.id,
        }));
      if (changeEntries.length > 0) {
        storage.logAssumptionChanges(changeEntries).catch(err =>
          logger.warn(`Failed to log assumption changes: ${err instanceof Error ? err.message : err}`, "properties")
        );
      }

      // The Analyst watches every field change in real time
      validateFieldChanges(propertyId, validation.data as Record<string, unknown>)
        .then(alerts => {
          if (alerts.length > 0) {
            logger.info(
              `Analyst flagged ${alerts.length} issue(s) on ${property.name}: ${alerts.map(a => a.message).join("; ")}`,
              "analyst-watchdog",
            );
          }
        })
        .catch(err => logger.warn(`Analyst watchdog error: ${err instanceof Error ? err.message : err}`, "properties"));

      invalidateComputeCache();
      logActivity(req, "update", "property", property.id, property.name, { updates: req.body });

      if (property) {
        const metrics: Record<string, number> = {};
        if (property.exitCapRate != null) metrics.cap_rate = property.exitCapRate;
        if (property.maxOccupancy != null) metrics.occupancy = property.maxOccupancy;
        if (Object.keys(metrics).length > 0) {
          evaluateAlertRules(property, metrics).catch((err) =>
            logger.error(`Alert evaluation error: ${err?.message || err}`, "properties")
          );
        }
      }

      res.json(property);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property", error);
    }
  });

  app.get("/api/properties/:id/validation-alerts", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) return res.status(403).json({ error: "Access denied" });

      // computeFieldAlerts imported statically at top of file
      const numericFields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(property as Record<string, unknown>)) {
        if (typeof val === "number" && Number.isFinite(val)) {
          numericFields[key] = val;
        }
      }
      const alerts = await computeFieldAlerts(propertyId, numericFields);
      res.json({ alerts });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch validation alerts", error);
    }
  });

  app.delete("/api/properties/:id", requireManagementAccess, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const user = getAuthUser(req);
      await storage.deleteProperty(id, user.id);
      invalidateComputeCache();
      logActivity(req, "archive", "property", id, property.name);

      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete property", error);
    }
  });

  // Admin: restore an archived property
  app.post("/api/admin/properties/:id/restore", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid property ID" });
      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (!property.archivedAt) {
        return res.status(400).json({ error: "Property is not archived" });
      }
      await storage.restoreProperty(id);
      invalidateComputeCache();
      logActivity(req, "restore", "property", id, property.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to restore property", error);
    }
  });

  app.post("/api/properties/:id/seed-research", requireManagementAccess, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }

      const seededValues = generateLocationAwareResearchValues({
        location: property.location || "Unknown",
        streetAddress: property.streetAddress,
        city: property.city,
        stateProvince: property.stateProvince,
        zipPostalCode: property.zipPostalCode,
        country: property.country,
        market: property.market || "North America",
      });
      const updated = await storage.updateProperty(id, {
        researchValues: seededValues,
      });

      logActivity(req, "seed-research", "property", id, property.name);
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to seed research", error);
    }
  });

  // Fee categories for a property
  app.get("/api/properties/:id/fee-categories", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const categories = await storage.getFeeCategoriesByProperty(propertyId);
      res.json(categories);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch fee categories", error);
    }
  });

  const feeCategoryBatchSchema = z.array(z.object({
    id: z.number().int().optional(),
    name: z.string().min(1),
    rate: z.number().min(0).max(1),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  }));

  app.put("/api/properties/:id/fee-categories", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyEditAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied — use scenario overrides for shared properties" });
      }
      const parsed = feeCategoryBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const categories = parsed.data;
      // Run all category updates/creates in parallel (independent rows)
      const results = (await Promise.all(
        categories.map(async (cat) => {
          if (cat.id) {
            return storage.updateFeeCategory(cat.id, {
              name: cat.name,
              rate: cat.rate,
              isActive: cat.isActive,
              sortOrder: cat.sortOrder,
            }, propertyId);
          } else {
            return storage.createFeeCategory({
              propertyId,
              name: cat.name,
              rate: cat.rate,
              isActive: cat.isActive,
              sortOrder: cat.sortOrder,
            });
          }
        })
      )).filter(Boolean);
      invalidateComputeCache();
      logActivity(req, "update", "fee-categories", propertyId);
      res.json(results);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to save fee categories", error);
    }
  });

  app.get("/api/fee-categories/all", requireAdmin, async (_req, res) => {
    try {
      const categories = await storage.getAllFeeCategories();
      res.json(categories);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch fee categories", error);
    }
  });

  const rewriteDescriptionSchema = z.object({
    text: z.string().min(1).max(5000),
  });

  app.post("/api/properties/:id/rewrite-description", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }
      const parsed = rewriteDescriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request — provide text (1–5000 chars)" });
      }
      const { text } = parsed.data;

      const { getGeminiClient } = await import("../ai/clients");
      const { resolveLlm, getVendorService } = await import("../ai/resolve-llm");
      const { logApiCost, estimateCost } = await import("../middleware/cost-logger");

      const context = [
        property.name && `Property: ${property.name}`,
        property.location && `Location: ${property.location}`,
        property.roomCount && `Rooms: ${property.roomCount}`,
      ].filter(Boolean).join(". ");

      const prompt = `You are a professional hospitality real estate copywriter. Rewrite the following property description to be polished, compelling, and professional. Keep the same factual content but improve clarity, flow, and appeal. Write in third person. Keep it concise (2-3 paragraphs max). Do not add fictional details — only enhance what is provided.

${context ? `Context: ${context}\n\n` : ""}Original description:
${text}

Rewritten description:`;

      const ga = await storage.getGlobalAssumptions(req.user?.id);
      const rc = (ga?.researchConfig as Record<string, unknown>) ?? {};
      const resolved = resolveLlm(rc, "aiUtilityLlm");
      const gemini = getGeminiClient();
      const startTime = Date.now();
      const response = await gemini.models.generateContent({
        model: resolved.model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 1024 },
      });

      const rewritten = response.text?.trim();
      if (!rewritten) {
        return res.status(500).json({ error: "No response from AI" });
      }

      const svc = getVendorService(resolved.vendor);
      const inTok = response.usageMetadata?.promptTokenCount ?? Math.round(prompt.length / 4);
      const outTok = response.usageMetadata?.candidatesTokenCount ?? Math.round(rewritten.length / 4);
      try {
        logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "rewrite-description", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: `/api/properties/${propertyId}/rewrite-description` });
      } catch (e: unknown) {
        logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger");
      }

      res.json({ rewritten });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "Gemini API key not configured" || msg.includes("not configured")) {
        return res.status(503).json({ error: "AI service is not available" });
      }
      logAndSendError(res, "Failed to rewrite description", error);
    }
  });

  registerPropertyUrlRoutes(app);

  // Walk Score — property-level walkability, transit, and bike scores
  app.get("/api/properties/:id/walk-score", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!property.latitude || !property.longitude) {
        return res.status(422).json({ error: "Property has no coordinates — cannot fetch Walk Score" });
      }

      const svc = new WalkScoreService();
      if (!svc.isAvailable()) {
        return res.status(503).json({ error: "Walk Score not configured (WALK_SCORE_API_KEY missing)" });
      }

      const address = [property.streetAddress, property.city, property.stateProvince, property.country]
        .filter(Boolean).join(", ");

      const scores = await svc.fetchScores({
        address,
        lat: property.latitude,
        lng: property.longitude,
        propertyId,
      });

      if (!scores) return res.status(502).json({ error: "Walk Score unavailable" });
      return res.json(scores);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch Walk Score", error);
    }
  });

  // ────────────────────────────────────────────────────────────
  // STRESS TEST ENDPOINTS
  // Deterministic stress scenarios for property financial resilience
  // ────────────────────────────────────────────────────────────

  /**
   * GET /api/properties/:id/stress-test
   * Returns StressResult[] for an existing property (authenticated).
   * Reads property assumptions from DB and runs the stress engine.
   */
  app.get("/api/properties/:id/stress-test", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid property ID" });
      const property = await storage.getProperty(id);
      if (!property) return res.status(404).json({ error: "Property not found" });

      const assumptions: StressAssumptions = {
        roomCount: property.roomCount,
        startAdr: property.startAdr,
        startOccupancy: property.startOccupancy,
        maxOccupancy: property.maxOccupancy,
        revShareFB: property.revShareFB ?? 0.30,
        revShareEvents: property.revShareEvents ?? 0.18,
        revShareOther: property.revShareOther ?? 0.03,
        costRateRooms: property.costRateRooms ?? 0.20,
        costRateAdmin: property.costRateAdmin ?? 0.08,
        costRateMarketing: property.costRateMarketing ?? 0.01,
        costRatePropertyOps: property.costRatePropertyOps ?? 0.04,
        costRateUtilities: property.costRateUtilities ?? 0.05,
        baseFeePercent: property.baseManagementFeeRate ?? 0.085,
        incentiveFeePercent: property.incentiveManagementFeeRate ?? 0.12,
        purchasePrice: property.purchasePrice,
      };

      // Add financing info if property is financed
      if (property.type === "Financed") {
        const ltv = property.acquisitionLTV ?? 0.75;
        const totalValue = property.purchasePrice + (property.buildingImprovements ?? 0);
        assumptions.loanAmount = totalValue * ltv;
        assumptions.interestRate = property.acquisitionInterestRate ?? 0.09;
        assumptions.loanTermYears = property.acquisitionTermYears ?? 25;
      }

      const results = computeStressScenarios(assumptions);
      res.json(results);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute stress scenarios", error);
    }
  });

  /**
   * POST /api/properties/stress-test
   * Accepts property assumptions in body, returns StressResult[].
   * For scenario what-if analysis without saving to DB.
   */
  app.post("/api/properties/stress-test", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body.roomCount !== "number" || typeof body.startAdr !== "number") {
        return res.status(400).json({
          error: "Invalid request body. Required: roomCount, startAdr, startOccupancy, maxOccupancy, purchasePrice, and cost rate fields.",
        });
      }

      const assumptions: StressAssumptions = {
        roomCount: body.roomCount,
        startAdr: body.startAdr,
        startOccupancy: body.startOccupancy ?? 0.70,
        maxOccupancy: body.maxOccupancy ?? 0.85,
        revShareFB: body.revShareFB ?? 0.30,
        revShareEvents: body.revShareEvents ?? 0.18,
        revShareOther: body.revShareOther ?? 0.03,
        costRateRooms: body.costRateRooms ?? 0.20,
        costRateAdmin: body.costRateAdmin ?? 0.08,
        costRateMarketing: body.costRateMarketing ?? 0.01,
        costRatePropertyOps: body.costRatePropertyOps ?? 0.04,
        costRateUtilities: body.costRateUtilities ?? 0.05,
        baseFeePercent: body.baseFeePercent ?? 0.085,
        incentiveFeePercent: body.incentiveFeePercent ?? 0.12,
        purchasePrice: body.purchasePrice ?? 0,
        loanAmount: body.loanAmount,
        interestRate: body.interestRate,
        loanTermYears: body.loanTermYears,
      };

      const results = computeStressScenarios(assumptions);
      res.json(results);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute stress scenarios", error);
    }
  });
}
