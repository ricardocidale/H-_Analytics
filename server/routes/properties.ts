import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, requireManagementAccess, checkPropertyAccess , getAuthUser } from "../auth";
import { insertPropertySchema, updatePropertySchema, updateFeeCategorySchema, type GlobalAssumptions } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { logActivity, logAndSendError } from "./helpers";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import { processNotificationEvent, evaluateAlertRules } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { UserRole } from "@shared/constants";
import { invalidateComputeCache } from "../finance/cache";
import { buildPropertyDefaultsFromRegistry } from "@shared/field-registry";
import { logger } from "../logger";
import { WalkScoreService } from "../services/WalkScoreService";
import { suggestStarRating } from "../ai/context-pack/star-rating";

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
      let props = user.role === UserRole.ADMIN
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);
      if (user.role !== UserRole.ADMIN && user.userGroupId) {
        const allowedIds = await storage.getGroupPropertyIds(user.userGroupId);
        if (allowedIds.length > 0) {
          props = props.filter((p) => allowedIds.includes(p.id));
        }
      }
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
    } catch (error) {
      logAndSendError(res, "Failed to fetch properties", error);
    }
  });

  // Group property visibility
  app.get("/api/user-groups/:id/properties", requireAuth, async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const user = getAuthUser(req);
      if (user.role !== UserRole.ADMIN && user.userGroupId !== groupId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const ids = await storage.getGroupPropertyIds(groupId);
      res.json(ids);
    } catch (error) {
      logAndSendError(res, "Failed to fetch group properties", error);
    }
  });

  const groupPropertyIdsSchema = z.object({
    propertyIds: z.array(z.number().int()).default([]),
  });

  app.put("/api/user-groups/:id/properties", requireAdmin, async (req, res) => {
    try {
      const parsed = groupPropertyIdsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { propertyIds } = parsed.data;
      await storage.setGroupProperties(Number(req.params.id), propertyIds);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to update group properties", error);
    }
  });

  app.get("/api/properties/:id", requireAuth, async (req, res) => {
    try {
      const property = await storage.getProperty(Number(req.params.id));
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      const user = getAuthUser(req);
      if (user.role !== UserRole.ADMIN && user.userGroupId) {
        const allowedIds = await storage.getGroupPropertyIds(user.userGroupId);
        if (allowedIds.length > 0 && !allowedIds.includes(property.id)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const cats = await storage.getFeeCategoriesByProperty(property.id);
      res.json({
        ...property,
        feeCategories: cats.map(c => ({ name: c.name, rate: c.rate, isActive: c.isActive })),
      });
    } catch (error) {
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

      const user = getAuthUser(req);
      const createData = {
        ...validation.data,
        ...mergedData,
        userId: user.role === UserRole.ADMIN ? null : user.id,
        researchValues: (validation.data as any).researchValues ?? {},
      };
      const suggestion = suggestStarRating(createData as any);
      (createData as any).starRatingSuggested = suggestion.rating;

      const property = await storage.createProperty(createData);

      // Seed default fee categories for the new property
      await storage.seedDefaultFeeCategories(property.id);

      // Create initial photo album entry from property image
      if (property.imageUrl) {
        await storage.addPropertyPhoto({
          propertyId: property.id,
          imageUrl: property.imageUrl,
          isHero: true,
        });
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
    } catch (error) {
      logAndSendError(res, "Failed to create property", error);
    }
  });

  app.patch("/api/properties/:id/coords", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
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
    } catch (error) {
      logAndSendError(res, "Failed to update coordinates", error);
    }
  });

  app.patch("/api/properties/:id", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const hasAccess = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validation = updatePropertySchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      
      const existingProp = await storage.getProperty(propertyId);
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
        (k) => k in validation.data && (validation.data as any)[k] !== (existingProp as any)[k]
      );
      if (hasKeyChange) {
        updateData.lastAssumptionChangeAt = new Date();
      }

      const property = await storage.updateProperty(propertyId, updateData);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }

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
    } catch (error) {
      logAndSendError(res, "Failed to update property", error);
    }
  });

  app.delete("/api/properties/:id", requireManagementAccess, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const hasAccess = await checkPropertyAccess(getAuthUser(req), id);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      
      await storage.deleteProperty(id);
      invalidateComputeCache();
      logActivity(req, "delete", "property", id, property.name);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete property", error);
    }
  });

  app.post("/api/properties/:id/seed-research", requireManagementAccess, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const hasAccess = await checkPropertyAccess(getAuthUser(req), id);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
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
    } catch (error) {
      logAndSendError(res, "Failed to seed research", error);
    }
  });

  // Fee categories for a property
  app.get("/api/properties/:id/fee-categories", requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const categories = await storage.getFeeCategoriesByProperty(propertyId);
      res.json(categories);
    } catch (error) {
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
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
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
    } catch (error) {
      logAndSendError(res, "Failed to save fee categories", error);
    }
  });

  app.get("/api/fee-categories/all", requireAuth, async (_req, res) => {
    try {
      const categories = await storage.getAllFeeCategories();
      res.json(categories);
    } catch (error) {
      logAndSendError(res, "Failed to fetch fee categories", error);
    }
  });

  const rewriteDescriptionSchema = z.object({
    text: z.string().min(1).max(5000),
  });

  app.post("/api/properties/:id/rewrite-description", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const hasAccess = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
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
      } catch (e) {
        logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger");
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

  // ────────────────────────────────────────────────────────────
  // PROPERTY URLS — linked reference URLs with validation
  // ────────────────────────────────────────────────────────────

  app.get("/api/properties/:id/urls", requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const urls = await storage.getPropertyUrls(propertyId);
      res.json(urls);
    } catch (error) {
      logAndSendError(res, "Failed to fetch property URLs", error);
    }
  });

  const httpUrlSchema = z.string().url().max(2048).refine(
    (val) => { try { const u = new URL(val); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } },
    { message: "Only http and https URLs are allowed" },
  );

  const addPropertyUrlSchema = z.object({
    url: httpUrlSchema,
    label: z.string().max(200).optional(),
  });

  app.post("/api/properties/:id/urls", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const parsed = addPropertyUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const existing = await storage.getPropertyUrls(propertyId);
      if (existing.some(u => u.url === parsed.data.url)) {
        return res.status(409).json({ error: "URL already exists for this property" });
      }
      const row = await storage.addPropertyUrl({
        propertyId,
        url: parsed.data.url,
        label: parsed.data.label ?? null,
      });
      logActivity(req, "add-url", "property", propertyId, parsed.data.url);
      res.status(201).json(row);
    } catch (error) {
      logAndSendError(res, "Failed to add property URL", error);
    }
  });

  const updatePropertyUrlSchema = z.object({
    url: httpUrlSchema.optional(),
    label: z.string().max(200).optional(),
    isValid: z.boolean().optional(),
    isRelevant: z.boolean().optional(),
    relevanceScore: z.number().min(0).max(1).optional(),
  });

  app.patch("/api/properties/:id/urls/:urlId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const urlId = Number(req.params.urlId);
      const existing = await storage.getPropertyUrlById(urlId);
      if (!existing || existing.propertyId !== propertyId) {
        return res.status(404).json({ error: "URL not found" });
      }
      const parsed = updatePropertyUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const updated = await storage.updatePropertyUrl(urlId, parsed.data);
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to update property URL", error);
    }
  });

  app.delete("/api/properties/:id/urls/:urlId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const urlId = Number(req.params.urlId);
      const existing = await storage.getPropertyUrlById(urlId);
      if (!existing || existing.propertyId !== propertyId) {
        return res.status(404).json({ error: "URL not found" });
      }
      await storage.deletePropertyUrl(urlId);
      logActivity(req, "delete-url", "property", propertyId, existing.url);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete property URL", error);
    }
  });

  app.post("/api/properties/:id/urls/validate", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      const urls = await storage.getPropertyUrls(propertyId);
      if (urls.length === 0) {
        return res.json({ validated: 0, results: [] });
      }

      const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal", "169.254.169.254"];
      const isSafeUrl = (raw: string): boolean => {
        try {
          const parsed = new URL(raw);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
          const host = parsed.hostname.toLowerCase();
          if (BLOCKED_HOSTS.includes(host)) return false;
          if (host.endsWith(".internal") || host.endsWith(".local")) return false;
          if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host)) return false;
          return true;
        } catch { return false; }
      };

      const extractMeta = (html: string): { title: string; description: string } => {
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["']/i);
        return {
          title: (titleMatch?.[1] || "").trim().slice(0, 200),
          description: (descMatch?.[1] || "").trim().slice(0, 500),
        };
      };

      const scoreRelevanceAI = async (
        urlEntries: Array<{ id: number; url: string; title: string; description: string; hostname: string }>,
        propName: string, propLocation: string, propType: string
      ): Promise<Map<number, { isRelevant: boolean; relevanceScore: number }>> => {
        const results = new Map<number, { isRelevant: boolean; relevanceScore: number }>();
        if (urlEntries.length === 0) return results;
        try {
          const { getGeminiClient } = await import("../ai/clients");
          const gemini = getGeminiClient();
          const urlList = urlEntries.map((e, i) =>
            `${i + 1}. [ID:${e.id}] ${e.hostname} — Title: "${e.title || "N/A"}" — Description: "${e.description || "N/A"}" — URL: ${e.url}`
          ).join("\n");
          const prompt = `You are a hospitality property research assistant. Score each URL for relevance to this property:
Property: ${propName}
Location: ${propLocation}
Type: ${propType}

URLs to score:
${urlList}

For each URL, return a JSON array of objects: [{"id": <ID>, "score": <0.0-1.0>, "relevant": <true/false>}]
Score > 0.6 means relevant. Consider: Is this URL about this specific property? Is it a listing, review, map, or reference for this property or its local market? Hospitality platform links (Airbnb, VRBO, Booking, etc.) for this property score high.
Return ONLY the JSON array, no other text.`;

          const response = await gemini.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 512 },
          });

          const text = response.text?.trim() || "[]";
          const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned) as Array<{ id: number; score: number; relevant: boolean }>;
          for (const item of parsed) {
            if (typeof item.id === "number" && typeof item.score === "number") {
              results.set(item.id, {
                isRelevant: item.relevant === true || item.score >= 0.6,
                relevanceScore: Math.min(Math.max(item.score, 0), 1),
              });
            }
          }
        } catch (err) {
          logger.warn(`AI relevance scoring failed, using heuristic fallback: ${err instanceof Error ? err.message : "unknown"}`, "property-urls");
          const RELEVANT_DOMAINS = ["airbnb", "vrbo", "booking", "expedia", "tripadvisor", "hotels", "zillow", "realtor", "loopnet", "costar"];
          for (const entry of urlEntries) {
            const isDomainRelevant = RELEVANT_DOMAINS.some(d => entry.hostname.includes(d));
            results.set(entry.id, {
              isRelevant: isDomainRelevant,
              relevanceScore: isDomainRelevant ? 0.8 : 0.3,
            });
          }
        }
        return results;
      };

      interface FetchResult {
        id: number; url: string; isValid: boolean; status: number;
        title: string; description: string; hostname: string;
        error?: string;
      }
      const fetchResults: FetchResult[] = await Promise.all(
        urls.map(async (u): Promise<FetchResult> => {
          if (!(await isSafeUrl(u.url))) {
            await storage.updatePropertyUrl(u.id, { isValid: false, lastCheckedAt: new Date() });
            return { id: u.id, url: u.url, isValid: false, status: 0, title: "", description: "", hostname: "", error: "Blocked: internal or private URL" };
          }
          try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 15_000);
            const resp = await fetch(u.url, {
              method: "GET",
              signal: ctrl.signal,
              headers: { "User-Agent": "H+Analytics/1.0 LinkValidator", "Accept": "text/html" },
              redirect: "follow",
            });
            clearTimeout(timeout);
            const isValid = resp.ok;
            const hostname = new URL(u.url).hostname.replace("www.", "");

            let pageTitle = "";
            let pageDescription = "";
            if (isValid) {
              const contentType = resp.headers.get("content-type") || "";
              if (contentType.includes("text/html")) {
                const body = await resp.text().catch(() => "");
                const head = body.slice(0, 20_000);
                const meta = extractMeta(head);
                pageTitle = meta.title;
                pageDescription = meta.description;
              }
            }

            return { id: u.id, url: u.url, isValid, status: resp.status, title: pageTitle, description: pageDescription, hostname };
          } catch (err) {
            await storage.updatePropertyUrl(u.id, { isValid: false, lastCheckedAt: new Date() });
            return { id: u.id, url: u.url, isValid: false, status: 0, title: "", description: "", hostname: "", error: err instanceof Error ? err.message : "Unknown error" };
          }
        })
      );

      const validFetches = fetchResults.filter(r => r.isValid && !r.error);
      const aiScores = await scoreRelevanceAI(
        validFetches,
        property!.name,
        property!.location,
        property!.hospitalityType || "hotel"
      );

      const results = await Promise.all(
        fetchResults.map(async (r) => {
          const scores = aiScores.get(r.id) || { isRelevant: false, relevanceScore: 0 };
          const isRelevant = r.isValid ? scores.isRelevant : false;
          const relevanceScore = r.isValid ? scores.relevanceScore : 0;

          const metadata: Record<string, unknown> = {};
          if (r.title) metadata.title = r.title;
          if (r.description) metadata.description = r.description;
          if (r.hostname) metadata.hostname = r.hostname;
          metadata.validatedAt = new Date().toISOString();
          metadata.scoredByAI = true;

          if (!r.error) {
            await storage.updatePropertyUrl(r.id, {
              isValid: r.isValid,
              isRelevant,
              relevanceScore,
              lastCheckedAt: new Date(),
              metadata,
            });
          }

          return { id: r.id, url: r.url, isValid: r.isValid, isRelevant, relevanceScore, status: r.status, title: r.title, ...(r.error ? { error: r.error } : {}) };
        })
      );

      const relevantUrls = results.filter(r => r.isValid && r.isRelevant);
      if (relevantUrls.length > 0) {
        try {
          const { upsertChunks, isPineconeAvailable } = await import("../ai/pinecone-service");
          if (isPineconeAvailable()) {
            const chunks = relevantUrls.map(r => ({
              id: `prop-url:${propertyId}:${r.id}`,
              text: `Property ${property!.name} (${property!.location}) reference link: ${r.url} ${r.title || ""}`,
              metadata: {
                propertyId,
                propertyName: property!.name,
                location: property!.location,
                url: r.url,
                title: r.title || "",
                relevanceScore: r.relevanceScore ?? 0,
                type: "property-url",
              },
            }));
            await upsertChunks("properties", chunks);
            logger.info(`Indexed ${chunks.length} relevant URLs for property ${propertyId}`, "property-urls");
          }
        } catch (e) {
          logger.warn(`Failed to index property URLs to Pinecone: ${(e as Error).message}`, "property-urls");
        }
      }

      res.json({ validated: results.length, results });
    } catch (error) {
      logAndSendError(res, "Failed to validate property URLs", error);
    }
  });

  // Walk Score — property-level walkability, transit, and bike scores
  app.get("/api/properties/:id/walk-score", requireAuth, async (req, res) => {
    try {
      const propertyId = parseInt(String(req.params.id));
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const property = await storage.getProperty(propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

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
    } catch (error) {
      logAndSendError(res, "Failed to fetch Walk Score", error);
    }
  });
}
