import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, checkPropertyAccess, checkPropertyEditAccess, getAuthUser } from "../auth";
import {
  insertPropertySchema,
  updatePropertySchema,
  type GlobalAssumptions,
  type ResearchValueEntry,
  buildDescriptorDualWritePatch,
  detectDescriptorDrift,
} from "@workspace/db";
import { z } from "zod";
import { logActivity, logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import {
  HTTP_201_CREATED,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_500_INTERNAL_SERVER_ERROR,
  HTTP_502_BAD_GATEWAY,
  HTTP_503_SERVICE_UNAVAILABLE,
} from "../constants";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import { processNotificationEvent, evaluateAlertRules } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import {
  isAdminRole,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_START_OCCUPANCY,
  DEFAULT_MAX_OCCUPANCY,
} from "@shared/constants";
import { invalidateComputeCache } from "../finance/cache";
import { buildPropertyDefaultsFromRegistry } from "@shared/field-registry";
import { logger } from "../logger";
import { cleanupPropertyVectors } from "../ai/vector-store-service";
import { WalkScoreService } from "../services/WalkScoreService";
import { validateFieldChanges, computeFieldAlerts } from "../ai/analyst-watchdog";
import { suggestStarRating } from "../ai/context-pack/star-rating";
import { registerPropertyUrlRoutes } from "./properties-urls";
import { computeStressScenarios, type StressAssumptions } from "@engine/helpers/stress-scenarios";
import { computePropertyDefaults } from "@engine/helpers/default-resolver";

export function buildPropertyDefaultsFromGlobal(ga?: GlobalAssumptions): Record<string, unknown> {
  return buildPropertyDefaultsFromRegistry(ga as unknown as Record<string, unknown>);
}

/**
 * Lean property creation: applies only global-assumption inheritance, creates
 * the row, attaches a hero photo if imageUrl was provided, invalidates the
 * compute cache, and fires the PROPERTY_IMPORTED notification. Does NOT apply
 * smart defaults or seed fee categories — those moved into seedPropertyFees
 * (W1.6) so the agent can decide whether to enrich after creation.
 *
 * Used by Rebecca's `create_property_record` tool and by `createPropertyForUser`
 * (the legacy compound function), which composes this with seedPropertyFees.
 */
export async function createPropertyRecord(
  user: Express.User,
  data: import("@workspace/db").InsertProperty,
): Promise<import("@workspace/db").Property> {
  const globalDefaults = await storage.getGlobalAssumptions();
  const inheritedDefaults = buildPropertyDefaultsFromGlobal(globalDefaults);

  const mergedData: Record<string, unknown> = {};
  for (const [key, globalValue] of Object.entries(inheritedDefaults)) {
    const userValue = (data as Record<string, unknown>)[key];
    if (userValue === undefined || userValue === null) {
      mergedData[key] = globalValue;
    }
  }

  const createData = {
    ...data,
    ...mergedData,
    userId: isAdminRole(user.role) ? null : user.id,
    researchValues: (data as { researchValues?: Record<string, ResearchValueEntry> }).researchValues ?? {},
  };
  const suggestion = suggestStarRating(createData as Parameters<typeof suggestStarRating>[0]);
  (createData as typeof createData & { starRatingSuggested?: number | null }).starRatingSuggested = suggestion.rating;

  const property = await storage.createProperty(createData);

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

  processNotificationEvent(createEvent("PROPERTY_IMPORTED", {
    propertyId: property.id,
    propertyName: property.name,
    message: `New property added: ${property.name}`,
    link: `/property/${property.id}`,
  })).catch((err) => logger.error(`Notification error: ${err?.message || err}`, "properties"));

  return property;
}

/**
 * Fallback room count used when seeding smart defaults on a property with no
 * roomCount set yet. 10 is the lower bound of the boutique-hotel size band
 * (see globalAssumptions.assetDefinition.minRooms default) — small enough to
 * compute reasonable per-key cost rates but not so small the result is noisy.
 */
const SEED_FALLBACK_ROOM_COUNT = 10;

/**
 * Apply Layer 2 smart defaults (qualityTier/businessModel/country/roomCount
 * → starting ADR, occupancy, cost rates, etc.) to an existing property, then
 * seed default fee categories. Only fills fields that are still null on the
 * persisted row, so global-defaults and user-set values win.
 *
 * Used by Rebecca's `seed_property_fees` tool and by `createPropertyForUser`.
 */
export async function seedPropertyFees(
  propertyId: number,
): Promise<{
  smartDefaultsApplied: boolean;
  fieldsPatched: string[];
  feeCategoriesSeeded: boolean;
}> {
  const property = await storage.getProperty(propertyId);
  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  const row = property as unknown as Record<string, unknown>;
  const qualityTier = (row.qualityTier as string) || "Upscale";
  const businessModel = (row.businessModel as string) || "hotel";
  const country = (row.country as string) || "United States";
  const roomCount = (row.roomCount as number) || SEED_FALLBACK_ROOM_COUNT;
  const stateProvince = (row.stateProvince as string) || undefined;

  const patch: Record<string, unknown> = {};
  let smartDefaultsApplied = false;
  try {
    const smartDefaults = computePropertyDefaults(
      qualityTier, businessModel, country, roomCount, stateProvince,
    );
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
      const persistedValue = row[key];
      if (persistedValue === undefined || persistedValue === null) {
        patch[key] = smartValue;
      }
    }
    if (smartDefaults.sources && Object.keys(smartDefaults.sources).length > 0) {
      const existingRV = (row.researchValues ?? {}) as Record<string, unknown>;
      patch.researchValues = {
        ...existingRV,
        _defaultSources: smartDefaults.sources,
      };
    }
    smartDefaultsApplied = true;
    logger.info(
      `Smart defaults applied (seed): id=${propertyId}, tier=${qualityTier}, model=${businessModel}, country=${country}, rooms=${roomCount}`,
      "properties",
    );
  } catch (err: unknown) {
    logger.warn(`Smart defaults computation failed for property ${propertyId} (non-blocking): ${err instanceof Error ? err.message : err}`, "properties");
  }

  const didPatchFields = Object.keys(patch).length > 0;
  if (didPatchFields) {
    await storage.updateProperty(propertyId, patch as Parameters<typeof storage.updateProperty>[1]);
  }

  let feeCategoriesSeeded = false;
  try {
    await storage.seedDefaultFeeCategories(propertyId);
    feeCategoriesSeeded = true;
  } catch (feeErr: unknown) {
    logger.warn(`Failed to seed fee categories for property ${propertyId} (non-blocking): ${feeErr instanceof Error ? feeErr.message : feeErr}`, "properties");
  }

  // Bust the compute cache if either the patch OR the fee seeding wrote — fee
  // categories feed into operating-expense calculations, so a stale cache
  // would surface old numbers until some later mutation (CodeRabbit PR-98).
  if (didPatchFields || feeCategoriesSeeded) {
    invalidateComputeCache();
  }

  return {
    smartDefaultsApplied,
    fieldsPatched: Object.keys(patch),
    feeCategoriesSeeded,
  };
}

/**
 * Shared property creation logic used by `POST /api/properties` and Rebecca's
 * legacy `create_property` tool. Composes createPropertyRecord +
 * seedPropertyFees so the route's behavior matches the new pair.
 *
 * @deprecated Internal callers should compose createPropertyRecord +
 * seedPropertyFees directly. Kept for the REST route + the deprecated
 * `create_property` Rebecca tool.
 */
export async function createPropertyForUser(
  user: Express.User,
  data: import("@workspace/db").InsertProperty,
): Promise<import("@workspace/db").Property> {
  const property = await createPropertyRecord(user, data);
  await seedPropertyFees(property.id);
  // Re-read after the seed step so the route's response carries the
  // smart-defaulted values it just computed (CodeRabbit PR-98). Without this
  // the client would see stale/null fields until a refetch.
  const refreshed = await storage.getProperty(property.id);
  if (!refreshed) {
    throw new Error(`Property ${property.id} not found after creation`);
  }
  return refreshed;
}

/**
 * Shared property soft-delete logic. Called by `DELETE /api/properties/:id`
 * and Rebecca's `delete_property` tool. Caller is responsible for ownership
 * checks (via `checkPropertyAccess`) and for activity logging.
 */
export async function archivePropertyForUser(
  id: number,
  archivedByUserId: number,
): Promise<void> {
  await storage.deleteProperty(id, archivedByUserId);
  invalidateComputeCache();
  cleanupPropertyVectors(id).catch((err: unknown) =>
    logger.warn(`Vector cleanup failed for property ${id}: ${err instanceof Error ? err.message : String(err)}`, "properties"),
  );
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

      // For properties with no primary imageUrl, resolve the best available photo:
      // prefer the hero photo, then fall back to the first photo by sort order.
      const missingImageIds = props.filter(p => !p.imageUrl).map(p => p.id);
      const photosByProperty = missingImageIds.length > 0
        ? await storage.getPhotosByProperties(missingImageIds)
        : {};

      const enriched = props.map(p => {
        let resolvedImageUrl: string | null = p.imageUrl ?? null;
        if (!resolvedImageUrl && photosByProperty[p.id]?.length) {
          const photos = photosByProperty[p.id];
          // Prefer hero photo URL; if hero has no URL, fall through to first
          // photo with a non-null URL in sort order.
          const hero = photos.find(ph => ph.isHero && ph.imageUrl);
          const firstWithUrl = photos.find(ph => ph.imageUrl);
          resolvedImageUrl = (hero ?? firstWithUrl)?.imageUrl ?? null;
        }
        return {
          ...p,
          imageUrl: resolvedImageUrl,
          feeCategories: catsByProperty.get(p.id) ?? [],
        };
      });
      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch properties", error, "PROP-001");
    }
  });

  app.get("/api/properties/:id", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-018" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PROP-019" });
      }
      const cats = await storage.getFeeCategoriesByProperty(property.id);
      res.json({
        ...property,
        feeCategories: cats.map(c => ({ name: c.name, rate: c.rate, isActive: c.isActive })),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch property", error, "PROP-002");
    }
  });

  app.post("/api/properties", requireAuth, async (req, res) => {
    try {
      const validation = insertPropertySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      const user = getAuthUser(req);
      const property = await createPropertyForUser(user, validation.data);
      logActivity(req, "create", "property", property.id, property.name);
      res.status(HTTP_201_CREATED).json(property);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create property", error, "PROP-003");
    }
  });

  app.patch("/api/properties/:id/coords", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-020" });
      const hasAccess = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!hasAccess) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-021" });
      }
      const { latitude, longitude } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number" ||
          !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "latitude must be -90..90 and longitude must be -180..180", code: "PROP-022" });
      }
      const updated = await storage.updateProperty(propertyId, { latitude, longitude });
      if (!updated) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PROP-023" });
      }
      res.json({ latitude: updated.latitude, longitude: updated.longitude });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update coordinates", error, "PROP-004");
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
      logAndSendError(res, "Failed to compute defaults preview", error, "PROP-005");
    }
  });

  app.patch("/api/properties/:id", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-024" });
      const existingProp = await checkPropertyEditAccess(getAuthUser(req), propertyId);
      if (!existingProp) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Shared properties can only be edited by admin. Use scenario overrides for your own adjustments.", code: "PROP-025" });
      }

      const validation = updatePropertySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      const merged = { ...existingProp, ...validation.data };
      const suggestion = suggestStarRating(merged as Parameters<typeof suggestStarRating>[0]);
      const updateData: Record<string, unknown> = { ...validation.data, starRatingSuggested: suggestion.rating };

      // Task #1407 (Milestone B) — dual-write: mirror every typed-column
      // descriptor write into the JSONB blobs so the accessor sees a
      // consistent view and we can drop typed columns later without losing
      // data. The helper preserves existing keys not touched by this patch.
      const existingRow = existingProp as Record<string, unknown>;
      const dualWrite = buildDescriptorDualWritePatch(
        validation.data as Record<string, unknown>,
        existingRow.descriptorsPurchased as Record<string, unknown> | null | undefined,
        existingRow.descriptorsImproved as Record<string, unknown> | null | undefined,
      );
      if (dualWrite.descriptorsPurchased) {
        updateData.descriptorsPurchased = dualWrite.descriptorsPurchased;
      }
      if (dualWrite.descriptorsImproved) {
        updateData.descriptorsImproved = dualWrite.descriptorsImproved;
      }

      // Hero-photo write-path drift guard.
      //
      // `properties.image_url` is a *cache* of the current hero `property_photos`
      // row's `imageUrl`. Direct writes to `properties.image_url` (e.g. from the
      // legacy "Change Photo" overlay button or the Photos page picker) bypass
      // `setHeroPhoto`, so the album never learns about the new URL and the
      // cache silently drifts away from the album. Once the album row's
      // canonical URL changes (e.g. a binary migration to `/api/media/...`),
      // the stale cache 404s and the property has no hero.
      //
      // Intercept those writes here: strip `imageUrl` from the property update
      // and instead route the change through `addPropertyPhoto` +
      // `setHeroPhoto`, which is the same path the album-aware Photos page
      // picker uses. `setHeroPhoto` updates `properties.image_url` itself, so
      // the cache and album stay equal by construction.
      const incomingImageUrl = typeof validation.data.imageUrl === "string"
        ? validation.data.imageUrl.trim()
        : null;
      const heroSyncUrl = incomingImageUrl && incomingImageUrl !== existingProp.imageUrl
        ? incomingImageUrl
        : null;
      delete updateData.imageUrl;

      const STALENESS_TRIGGER_KEYS = [
        "starRating", "startAdr", "hospitalityType", "businessModel",
        "roomCount", "city", "stateProvince", "country",
        "revShareFB", "revShareEvents", "revShareOther",
        "maxOccupancy", "startOccupancy", "adrGrowthRate",
        "sourceUrls", "platformFeeRate",
      ];
      const hasKeyChange = existingProp && STALENESS_TRIGGER_KEYS.some(
        (k) => k in validation.data && (validation.data as Record<string, unknown>)[k] !== (existingProp as Record<string, unknown>)[k]
      );
      if (hasKeyChange) {
        updateData.lastAssumptionChangeAt = new Date();
      }

      let property = await storage.updateProperty(propertyId, updateData);
      if (!property) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PROP-026" });
      }

      // Task #1407 (Milestone B) — drift instrumentation. After every write,
      // compare typed columns to the JSONB blobs and warn on any divergence.
      // Silent drift here would defeat the migration plan: if a write path
      // bypasses the dual-write helper, this is where it surfaces.
      try {
        const drift = detectDescriptorDrift(property as Record<string, unknown>);
        if (drift.length > 0) {
          logger.warn(
            `Descriptor drift on property ${propertyId} after PATCH: ${drift
              .map(d => `${d.fieldKey}[${d.side}] typed=${JSON.stringify(d.typedValue)} jsonb=${JSON.stringify(d.jsonbValue)}`)
              .join("; ")}`,
            "descriptor-drift",
          );
        }
      } catch (err: unknown) {
        logger.warn(`Descriptor drift check failed for property ${propertyId}: ${err instanceof Error ? err.message : err}`, "descriptor-drift");
      }

      // Apply the hero-photo write through the album (see drift-guard comment
      // above). Reuse an existing photo row when the URL is already in the
      // album; otherwise add it as a new row. `setHeroPhoto` mirrors the new
      // hero's `imageUrl` back onto `properties.image_url`.
      //
      // We surface a 500 if the hero sync fails: the user requested a new
      // hero, the property update succeeded, but the album/cache could not be
      // brought back in sync — leaving things in the same drifted state this
      // task #934 was meant to eliminate. Failing loudly is the only way to
      // prevent silent drift from re-introducing itself.
      if (heroSyncUrl) {
        try {
          const albumPhotos = await storage.getPropertyPhotos(propertyId);
          const matching = albumPhotos.find(p => p.imageUrl === heroSyncUrl);
          const heroPhotoId = matching
            ? matching.id
            : (await storage.addPropertyPhoto({ propertyId, imageUrl: heroSyncUrl })).id;
          await storage.setHeroPhoto(propertyId, heroPhotoId);
          // Re-read so the response reflects the freshly mirrored image_url
          // (the first updateProperty call deliberately stripped imageUrl).
          const refreshed = await storage.getProperty(propertyId);
          if (refreshed) property = refreshed;
        } catch (err: unknown) {
          logger.error(
            `Hero-photo sync failed for property ${propertyId}: ${err instanceof Error ? err.message : err}`,
            "properties",
          );
          return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({
            error: "Property updated but hero photo could not be synced. Please retry.",
          code: "PROP-052" });
        }
      }

      // Phase 5C-task-2: supersede stale guidance when material inputs change
      if (hasKeyChange) {
        storage.markAssumptionGuidanceSuperseded("property", propertyId, null).catch(err =>
          logger.warn(`Failed to supersede property guidance: ${err instanceof Error ? err.message : err}`, "properties")
        );
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

      // Phase 4: surface prerequisite failures + observed-missing telemetry
      // for property-subject Specialists (D — Risk Intelligence; E —
      // Executive Summary). Mirrors the shape that Company Assumptions'
      // /save-tab handler returns, so the UI can render the same
      // PrerequisitesFailedPanel above the Property Edit form. Best-effort:
      // the property save itself has already succeeded above; if Specialist
      // evaluation throws (catalog import, prereq evaluator, etc.) we log
      // and return the property unchanged rather than 500ing on a save.
      let prerequisiteFailures: { id: string; specialistId: string; reason: string }[] | null = null;
      let requiredFieldsMissing: { specialistId: string; keys: string[] }[] | null = null;
      try {
        const [
          { findMissingRequiredFields, findObservedMissingCandidateFields },
          { evaluatePrerequisites },
          { getSpecialistById, SPECIALIST_CATALOG },
          { deriveHardRequiredFieldKeys },
        ] = await Promise.all([
          import("@engine/analyst/surface/mgmt-co/index"),
          import("@engine/analyst/registry/prerequisite-registry"),
          import("@engine/analyst/registry/specialist-catalog"),
          import("./admin/specialists"),
        ]);
        const propertySpecialistIds = SPECIALIST_CATALOG
          .filter((d) => d.subject === "property")
          .map((d) => d.id);
        const failures: { id: string; specialistId: string; reason: string }[] = [];
        const reqMissing: { specialistId: string; keys: string[] }[] = [];
        for (const sid of propertySpecialistIds) {
          const def = getSpecialistById(sid);
          if (!def) continue;
          const cfg = await storage.getOrCreateSpecialistConfig(sid);
          const candidates = def.candidateFields ?? [];
          const observed = findObservedMissingCandidateFields(
            property as Record<string, unknown>,
            candidates,
            cfg.fieldRequirements as Record<string, "hard" | "recommended" | "off"> | undefined,
          );
          await storage.recordObservedMissingFields(sid, observed);

          const { getLockedHardCandidateKeys: _getLocked } = await import(
            "@engine/analyst/registry/specialist-catalog"
          );
          const hardFields = deriveHardRequiredFieldKeys(
            cfg.fieldRequirements as Record<string, "hard" | "recommended" | "off"> | undefined,
            cfg.requiredFields,
            _getLocked(sid),
          );
          const missing = findMissingRequiredFields(
            property as Record<string, unknown>,
            hardFields,
          );
          if (missing.length > 0) reqMissing.push({ specialistId: sid, keys: missing });

          const toggledOnPrereqs = Object.entries(
            (cfg as { prerequisiteToggles?: Record<string, boolean> }).prerequisiteToggles ?? {},
          )
            .filter(([id, on]) => on === true && (def.prerequisites ?? []).includes(id))
            .map(([id]) => id);
          if (toggledOnPrereqs.length > 0) {
            const fails = await evaluatePrerequisites(toggledOnPrereqs, {
              storage,
              userId: getAuthUser(req).id,
            });
            for (const f of fails) failures.push({ id: f.id, specialistId: sid, reason: f.reason });
          }
        }
        if (failures.length > 0) prerequisiteFailures = failures;
        if (reqMissing.length > 0) requiredFieldsMissing = reqMissing;
      } catch (specErr: unknown) {
        logger.warn(
          `Property Specialist gating failed (property #${propertyId}): ${specErr instanceof Error ? specErr.message : String(specErr)}`,
          "properties",
        );
      }

      res.json({ ...property, prerequisiteFailures, requiredFieldsMissing });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property", error, "PROP-006");
    }
  });

  app.get("/api/properties/:id/validation-alerts", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-027" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-028" });

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
      logAndSendError(res, "Failed to fetch validation alerts", error, "PROP-007");
    }
  });

  app.delete("/api/properties/:id", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-029" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-030" });
      }
      
      const user = getAuthUser(req);
      await archivePropertyForUser(id, user.id);
      logActivity(req, "archive", "property", id, property.name);

      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete property", error, "PROP-008");
    }
  });

  // Admin: restore an archived property
  app.post("/api/admin/properties/:id/restore", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-031" });
      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PROP-032" });
      }
      if (!property.archivedAt) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Property is not archived", code: "PROP-033" });
      }
      await storage.restoreProperty(id);
      invalidateComputeCache();
      logActivity(req, "restore", "property", id, property.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to restore property", error, "PROP-009");
    }
  });

  app.post("/api/properties/:id/seed-research", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-034" });
      const property = await checkPropertyAccess(getAuthUser(req), id);
      if (!property) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-035" });
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
      logAndSendError(res, "Failed to seed research", error, "PROP-010");
    }
  });

  // Fee categories for a property
  app.get("/api/properties/:id/fee-categories", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-036" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-037" });
      }
      const categories = await storage.getFeeCategoriesByProperty(propertyId);
      res.json(categories);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch fee categories", error, "PROP-011");
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
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-038" });
      if (!(await checkPropertyEditAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied — use scenario overrides for shared properties", code: "PROP-039" });
      }
      const parsed = feeCategoryBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
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
      logAndSendError(res, "Failed to save fee categories", error, "PROP-012");
    }
  });

  app.get("/api/fee-categories/all", requireAdmin, async (_req, res) => {
    try {
      const categories = await storage.getAllFeeCategories();
      res.json(categories);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch fee categories", error, "PROP-013");
    }
  });

  const rewriteDescriptionSchema = z.object({
    text: z.string().min(1).max(5000),
  });

  app.post("/api/properties/:id/rewrite-description", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-040" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-041" });
      }
      const parsed = rewriteDescriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid request — provide text (1–5000 chars)", code: "PROP-042" });
      }
      const { text } = parsed.data;

      const { resolveLlm } = await import("../ai/resolve-llm");
      const { generateText } = await import("../ai/dispatch");
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
      const startTime = Date.now();

      const { text: raw, inputTokens: inTok, outputTokens: outTok, service: svc } = await generateText({
        llm: resolved,
        prompt,
        maxTokens: 1024,
      });
      const rewritten = raw.trim();

      if (!rewritten) {
        return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: "No response from AI", code: "PROP-043" });
      }

      try {
        logApiCost({ timestamp: new Date().toISOString(), service: svc, model: resolved.model, operation: "rewrite-description", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svc, resolved.model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: `/api/properties/${propertyId}/rewrite-description` });
      } catch (e: unknown) {
        logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger");
      }

      res.json({ rewritten });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("API key not configured") || msg.includes("not configured")) {
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: "AI service is not available", code: "PROP-044" });
      }
      logAndSendError(res, "Failed to rewrite description", error, "PROP-014");
    }
  });

  registerPropertyUrlRoutes(app);

  // Walk Score — property-level walkability, transit, and bike scores
  app.get("/api/properties/:id/walk-score", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-045" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PROP-046" });
      }

      if (!property.latitude || !property.longitude) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "Property has no coordinates — cannot fetch Walk Score", code: "PROP-047" });
      }

      const svc = new WalkScoreService();
      if (!svc.isAvailable()) {
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: "Walk Score not configured (WALK_SCORE_API_KEY missing)", code: "PROP-048" });
      }

      const address = [property.streetAddress, property.city, property.stateProvince, property.country]
        .filter(Boolean).join(", ");

      const scores = await svc.fetchScores({
        address,
        lat: property.latitude,
        lng: property.longitude,
        propertyId,
      });

      if (!scores) return res.status(HTTP_502_BAD_GATEWAY).json({ error: "Walk Score unavailable", code: "PROP-049" });
      return res.json(scores);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch Walk Score", error, "PROP-015");
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
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PROP-050" });
      const property = await storage.getProperty(id);
      if (!property) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PROP-051" });

      const assumptions: StressAssumptions = {
        roomCount: property.roomCount,
        startAdr: property.startAdr,
        startOccupancy: property.startOccupancy,
        maxOccupancy: property.maxOccupancy,
        revShareFB: property.revShareFB ?? DEFAULT_REV_SHARE_FB,
        revShareEvents: property.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS,
        revShareOther: property.revShareOther ?? DEFAULT_REV_SHARE_OTHER,
        costRateRooms: property.costRateRooms ?? DEFAULT_COST_RATE_ROOMS,
        costRateAdmin: property.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN,
        costRateMarketing: property.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING,
        costRatePropertyOps: property.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS,
        costRateUtilities: property.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES,
        baseFeePercent: property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE,
        incentiveFeePercent: property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
        purchasePrice: property.purchasePrice,
      };

      // Add financing info if property is financed
      if (property.type === "Financed") {
        const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
        const totalValue = property.purchasePrice + (property.buildingImprovements ?? 0);
        assumptions.loanAmount = totalValue * ltv;
        assumptions.interestRate = property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE;
        assumptions.loanTermYears = property.acquisitionTermYears ?? DEFAULT_TERM_YEARS;
      }

      const results = computeStressScenarios(assumptions);
      res.json(results);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute stress scenarios", error, "PROP-016");
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
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: "Invalid request body. Required: roomCount, startAdr, startOccupancy, maxOccupancy, purchasePrice, and cost rate fields.",
        code: "PROP-053" });
      }

      const assumptions: StressAssumptions = {
        roomCount: body.roomCount,
        startAdr: body.startAdr,
        startOccupancy: body.startOccupancy ?? DEFAULT_START_OCCUPANCY,
        maxOccupancy: body.maxOccupancy ?? DEFAULT_MAX_OCCUPANCY,
        revShareFB: body.revShareFB ?? DEFAULT_REV_SHARE_FB,
        revShareEvents: body.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS,
        revShareOther: body.revShareOther ?? DEFAULT_REV_SHARE_OTHER,
        costRateRooms: body.costRateRooms ?? DEFAULT_COST_RATE_ROOMS,
        costRateAdmin: body.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN,
        costRateMarketing: body.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING,
        costRatePropertyOps: body.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS,
        costRateUtilities: body.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES,
        baseFeePercent: body.baseFeePercent ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE,
        incentiveFeePercent: body.incentiveFeePercent ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
        purchasePrice: body.purchasePrice ?? 0,
        loanAmount: body.loanAmount,
        interestRate: body.interestRate,
        loanTermYears: body.loanTermYears,
      };

      const results = computeStressScenarios(assumptions);
      res.json(results);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute stress scenarios", error, "PROP-017");
    }
  });
}
