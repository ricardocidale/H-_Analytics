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
