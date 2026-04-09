import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { cache } from "../cache";
import { type CircuitState } from "../integrations/base";
import { getResendHealthCheck } from "../integrations/resend";
import { getGeospatialHealthCheck } from "../integrations/geospatial";
import { getDocumentAIHealthCheck } from "../integrations/document-ai";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";
import { logActivity, cachePatternSchema } from "./helpers";
import { fromZodError } from "zod-validation-error";
import { insertExternalIntegrationSchema, updateExternalIntegrationSchema } from "@shared/schema";
import { storage } from "../storage";

interface IntegrationStatusResponse {
  name: string;
  healthy: boolean;
  latencyMs: number;
  lastError?: string;
  lastErrorAt?: number;
  circuitState: CircuitState;
}

export function register(app: Express) {
  app.get("/api/admin/integrations/health", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const checks = await Promise.allSettled([
        getResendHealthCheck(),
        getGeospatialHealthCheck(),
        getDocumentAIHealthCheck(),
      ]);

      const results: IntegrationStatusResponse[] = checks.map((result) => {
        if (result.status === "fulfilled") return result.value;
        return {
          name: "unknown",
          healthy: false,
          latencyMs: 0,
          lastError: result.reason?.message || "Health check failed",
          circuitState: "closed" as CircuitState,
        };
      });

      const aggregator = getMarketIntelligenceAggregator();
      const miStatus = aggregator.getServiceStatus();

      if (miStatus.moodys) {
        results.push({
          name: "Moody's Analytics",
          healthy: true,
          latencyMs: 0,
          circuitState: "closed" as CircuitState,
        });
      } else {
        results.push({
          name: "Moody's Analytics",
          healthy: false,
          latencyMs: 0,
          lastError: "API key not configured (MOODYS_API_KEY)",
          circuitState: "closed" as CircuitState,
        });
      }

      if (miStatus.spGlobal) {
        results.push({
          name: "S&P Global",
          healthy: true,
          latencyMs: 0,
          circuitState: "closed" as CircuitState,
        });
      } else {
        results.push({
          name: "S&P Global",
          healthy: false,
          latencyMs: 0,
          lastError: "API key not configured (SPGLOBAL_API_KEY)",
          circuitState: "closed" as CircuitState,
        });
      }

      if (miStatus.costar) {
        results.push({
          name: "CoStar Group",
          healthy: true,
          latencyMs: 0,
          circuitState: "closed" as CircuitState,
        });
      } else {
        results.push({
          name: "CoStar Group",
          healthy: false,
          latencyMs: 0,
          lastError: "API key not configured (COSTAR_API_KEY)",
          circuitState: "closed" as CircuitState,
        });
      }

      if (miStatus.apify) {
        results.push({ name: "Apify (Airbnb / VRBO / Booking / TripAdvisor)", healthy: true, latencyMs: 0, circuitState: "closed" as CircuitState });
      } else {
        results.push({ name: "Apify (Airbnb / VRBO / Booking / TripAdvisor)", healthy: false, latencyMs: 0, lastError: "API token not configured (APIFY_API_TOKEN)", circuitState: "closed" as CircuitState });
      }

      results.push({
        name: "Open Exchange Rates (FX)",
        healthy: miStatus.fx,
        latencyMs: 0,
        lastError: miStatus.fx ? undefined : "App ID not configured (OPEN_EXCHANGE_RATES_APP_ID)",
        circuitState: "closed" as CircuitState,
      });

      results.push({
        name: "RapidAPI Comps (Airbnb / Booking / Hotels.com / TripAdvisor)",
        healthy: miStatus.rapidApiComps,
        latencyMs: 0,
        lastError: miStatus.rapidApiComps ? undefined : "Key not configured (RAPIDAPI_KEY_2)",
        circuitState: "closed" as CircuitState,
      });

      results.push({
        name: "WeatherAPI.com",
        healthy: miStatus.weather,
        latencyMs: 0,
        lastError: miStatus.weather ? undefined : "Key not configured (RAPIDAPI_KEY_3)",
        circuitState: "closed" as CircuitState,
      });

      // World Bank is always available (no key required)
      results.push({ name: "World Bank (Economic Indicators)", healthy: true, latencyMs: 0, circuitState: "closed" as CircuitState });

      results.push({
        name: "Walk Score",
        healthy: !!process.env.WALK_SCORE_API_KEY,
        latencyMs: 0,
        lastError: process.env.WALK_SCORE_API_KEY ? undefined : "API key not configured (WALK_SCORE_API_KEY)",
        circuitState: "closed" as CircuitState,
      });

      results.push({
        name: "CNBC + Bloomberg Finance (Financial News)",
        healthy: miStatus.financialNews,
        latencyMs: 0,
        lastError: miStatus.financialNews ? undefined : "Key not configured (RAPIDAPI_KEY_3)",
        circuitState: "closed" as CircuitState,
      });

      results.push({
        name: "Alpha Vantage (Hospitality REITs + Macro)",
        healthy: miStatus.alphaVantage,
        latencyMs: 0,
        lastError: miStatus.alphaVantage ? undefined : "Key not configured (RAPIDAPI_KEY_3)",
        circuitState: "closed" as CircuitState,
      });

      res.json(results);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.get("/api/admin/integrations/cache/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await cache.getStats();
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.post("/api/admin/integrations/cache/clear", requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = cachePatternSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { pattern } = parsed.data;
      if (pattern) {
        const deleted = await cache.invalidate(pattern);
        logActivity(req, "clear-cache", "cache", null, pattern, { deleted });
        res.json({ deleted, pattern });
      } else {
        await cache.clearAll();
        logActivity(req, "clear-all-cache", "cache");
        res.json({ cleared: true });
      }
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.post("/api/admin/integrations/cache/clear-property/:propertyId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { propertyId } = req.params;
      const projections = await cache.invalidate(`projections:${propertyId}:*`);
      const research = await cache.invalidate(`research:${propertyId}:*`);
      res.json({ deleted: projections + research, propertyId });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.get("/api/admin/ext-integrations", requireAdmin, async (req: Request, res: Response) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const rows = await storage.getExternalIntegrations(kind);
      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.post("/api/admin/ext-integrations", requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = insertExternalIntegrationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const row = await storage.createExternalIntegration(parsed.data);
      logActivity(req, "create-integration", "integration", row.id, row.name);
      res.status(201).json(row);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.patch("/api/admin/ext-integrations/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const parsed = updateExternalIntegrationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const row = await storage.updateExternalIntegration(id, parsed.data);
      if (!row) return res.status(404).json({ error: "Integration not found" });
      logActivity(req, "update-integration", "integration", row.id, row.name);
      res.json(row);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.patch("/api/admin/ext-integrations/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { isEnabled } = req.body;
      if (typeof isEnabled !== "boolean") return res.status(400).json({ error: "isEnabled must be a boolean" });
      const row = await storage.toggleExternalIntegration(id, isEnabled);
      if (!row) return res.status(404).json({ error: "Integration not found" });
      logActivity(req, isEnabled ? "enable-integration" : "disable-integration", "integration", row.id, row.name);
      res.json(row);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });

  app.delete("/api/admin/ext-integrations/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getExternalIntegration(id);
      if (!existing) return res.status(404).json({ error: "Integration not found" });
      await storage.deleteExternalIntegration(id);
      logActivity(req, "delete-integration", "integration", id, existing.name);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
    }
  });
}
