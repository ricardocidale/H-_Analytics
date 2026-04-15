/**
 * server/routes/executive-summary.ts — Executive Summary API Routes
 *
 * Endpoints for generating and retrieving executive summaries per property
 * and per portfolio. Summaries are cached for 24 hours and invalidated
 * when property assumptions change.
 *
 * Rate-limited because each generation involves an LLM call.
 */

import { Router } from "express";
import { requireAuth, isApiRateLimited, getAuthUser } from "../auth";
import {
  generatePropertyExecutiveSummary,
  generatePortfolioExecutiveSummary,
  formatPropertySummaryAsText,
  formatPortfolioSummaryAsText,
  type PropertyExecutiveSummary,
  type PortfolioExecutiveSummary,
} from "../ai/executive-summary";
import { storage } from "../storage";
import { logger } from "../logger";
import { logActivity, parseRouteId } from "./helpers";
import type { Property } from "@shared/schema";

const router = Router();

// ─── In-Memory Cache (24h TTL) ────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const propertyCache = new Map<string, CacheEntry<PropertyExecutiveSummary>>();
const portfolioCache = new Map<string, CacheEntry<PortfolioExecutiveSummary>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate property cache — called externally when assumptions change */
export function invalidatePropertySummaryCache(propertyId: number): void {
  const keysToDelete = Array.from(propertyCache.keys()).filter(
    key => key.startsWith(`prop:${propertyId}:`),
  );
  for (const key of keysToDelete) {
    propertyCache.delete(key);
  }
  // Also invalidate portfolio caches since they include this property
  portfolioCache.clear();
}

// ─── GET /api/executive-summary/property/:propertyId ──────────────────────────

router.get(
  "/api/executive-summary/property/:propertyId",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;

    // Rate limit: 3 req/min
    if (isApiRateLimited(userId, "exec-summary-property", 3)) {
      return res.status(429).json({ error: "Rate limited — 3 requests per minute" });
    }

    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (!propertyId) {
        return res.status(400).json({ error: "Invalid property ID" });
      }

      const property = await storage.getProperty(propertyId);
      if (!property || property.userId !== userId) {
        return res.status(404).json({ error: "Property not found" });
      }

      const format = req.query.format === "text" ? "text" : "json";
      const includeLLM = req.query.includeLLM !== "false"; // default true
      const cacheKey = `prop:${propertyId}:${includeLLM}`;

      // Check cache
      const cached = getCached(propertyCache, cacheKey);
      if (cached) {
        logActivity(req, "executive-summary", "property", propertyId, property.name, { cached: true, format });
        return format === "text"
          ? res.type("text/plain").send(formatPropertySummaryAsText(cached))
          : res.json(cached);
      }

      // Fetch guidance records for this property
      let guidanceRecords: any[] = [];
      try {
        guidanceRecords = await storage.getAssumptionGuidance(null, "property", propertyId);
      } catch {
        // No guidance available — summary will use templates
      }

      const summary = await generatePropertyExecutiveSummary(
        property,
        guidanceRecords,
        { includeLLM, format },
      );

      // Cache the result
      setCache(propertyCache, cacheKey, summary);

      logActivity(req, "executive-summary", "property", propertyId, property.name, { includeLLM, format });

      if (format === "text") {
        return res.type("text/plain").send(formatPropertySummaryAsText(summary));
      }
      res.json(summary);
    } catch (error: unknown) {
      logger.error(`Property executive summary failed: ${error}`, "executive-summary");
      res.status(500).json({ error: "Failed to generate executive summary" });
    }
  },
);

// ─── GET /api/executive-summary/portfolio ─────────────────────────────────────

router.get(
  "/api/executive-summary/portfolio",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;

    // Rate limit: 2 req/min
    if (isApiRateLimited(userId, "exec-summary-portfolio", 2)) {
      return res.status(429).json({ error: "Rate limited — 2 requests per minute" });
    }

    try {
      const format = req.query.format === "text" ? "text" : "json";
      const includeLLM = req.query.includeLLM !== "false";
      const cacheKey = `portfolio:${userId}:${includeLLM}`;

      // Check cache
      const cached = getCached(portfolioCache, cacheKey);
      if (cached) {
        logActivity(req, "executive-summary", "portfolio", null, `Portfolio (${cached.totalProperties} properties)`, { cached: true, format });
        return format === "text"
          ? res.type("text/plain").send(formatPortfolioSummaryAsText(cached))
          : res.json(cached);
      }

      const userProperties: Property[] = await storage.getAllProperties(userId);

      if (userProperties.length === 0) {
        return res.json({
          generatedAt: new Date().toISOString(),
          portfolioThesis: "No properties in portfolio.",
          totalProperties: 0,
          totalInvestment: 0,
          weightedIRR: 0,
          portfolioRiskGrade: "N/A",
          geographicSpread: "0 countries, 0 markets",
          brandStrategy: "",
          diversificationAnalysis: "",
          growthPlan: "",
          managementCompanyValue: "",
          propertySummaries: [],
          sources: [],
        });
      }

      // Fetch guidance for all properties
      const guidanceByProperty = new Map<number, any[]>();
      for (const p of userProperties) {
        try {
          const records = await storage.getAssumptionGuidance(null, "property", p.id);
          guidanceByProperty.set(p.id, records);
        } catch {
          guidanceByProperty.set(p.id, []);
        }
      }

      const summary = await generatePortfolioExecutiveSummary(
        userProperties,
        guidanceByProperty,
        { includeLLM, format },
      );

      // Cache the result
      setCache(portfolioCache, cacheKey, summary);

      logActivity(req, "executive-summary", "portfolio", null, `Portfolio (${userProperties.length} properties)`, { includeLLM, format });

      if (format === "text") {
        return res.type("text/plain").send(formatPortfolioSummaryAsText(summary));
      }
      res.json(summary);
    } catch (error: unknown) {
      logger.error(`Portfolio executive summary failed: ${error}`, "executive-summary");
      res.status(500).json({ error: "Failed to generate portfolio executive summary" });
    }
  },
);

// ─── POST /api/executive-summary/property/:propertyId/regenerate ──────────────

router.post("/api/executive-summary/property/:propertyId/regenerate", requireAuth, async (req, res) => {
    const userId = getAuthUser(req).id;

    // Rate limit: 3 req/min (shared with GET)
    if (isApiRateLimited(userId, "exec-summary-property", 3)) {
      return res.status(429).json({ error: "Rate limited — 3 requests per minute" });
    }

    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (!propertyId) {
        return res.status(400).json({ error: "Invalid property ID" });
      }

      const property = await storage.getProperty(propertyId);
      if (!property || property.userId !== userId) {
        return res.status(404).json({ error: "Property not found" });
      }

      // Invalidate cache
      invalidatePropertySummaryCache(propertyId);

      // Fetch guidance records
      let guidanceRecords: any[] = [];
      try {
        guidanceRecords = await storage.getAssumptionGuidance(null, "property", propertyId);
      } catch {
        // No guidance available
      }

      const summary = await generatePropertyExecutiveSummary(
        property,
        guidanceRecords,
        { includeLLM: true },
      );

      // Cache the fresh result
      setCache(propertyCache, `prop:${propertyId}:true`, summary);

      logActivity(req, "executive-summary-regenerate", "property", propertyId, property.name, { regenerated: true });

      res.json(summary);
    } catch (error: unknown) {
      logger.error(`Property executive summary regeneration failed: ${error}`, "executive-summary");
      res.status(500).json({ error: "Failed to regenerate executive summary" });
    }
  },
);

// ─── Export as register pattern (matching other route files) ──────────────────

export function register(app: { use: (router: Router) => void }) {
  app.use(router);
}

export { router as executiveSummaryRoutes };
