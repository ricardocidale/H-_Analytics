/**
 * market-rates routes — CRUD + refresh endpoints for live market rates.
 */
import type { Express, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../auth";
import { sendError, logAndSendError, marketRatePatchSchema, marketIntelligenceGatherSchema } from "./helpers";
import { fromZodError } from "zod-validation-error";
import {
  getAllMarketRates,
  getMarketRate,
  upsertMarketRate,
  forceRefreshRate,
  refreshAllStaleRates,
} from "../data/marketRates";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";

export function register(app: Express) {
  // GET /api/market-rates — list all rates with staleness status
  app.get("/api/market-rates", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rates = await getAllMarketRates();
      const now = Date.now();

      const enriched = rates.map((r) => {
        const ageMs = r.fetchedAt ? now - new Date(r.fetchedAt).getTime() : Infinity;
        const thresholdMs = (r.maxStalenessHours ?? 24) * 60 * 60 * 1000;
        const stalePct = Math.min(ageMs / thresholdMs, 2); // cap at 200%
        let status: "fresh" | "warning" | "stale" | "missing" = "missing";
        if (r.value == null) status = "missing";
        else if (stalePct < 0.75) status = "fresh";
        else if (stalePct < 1.0) status = "warning";
        else status = "stale";

        return { ...r, status, stalePct: Math.round(stalePct * 100) };
      });

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch market rates", error);
    }
  });

  // POST /api/market-rates/:key/refresh — force refresh one rate
  app.post("/api/market-rates/:key/refresh", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const key = String(req.params.key);
      const ok = await forceRefreshRate(key);
      if (!ok) return sendError(res, 404, "Rate not found or could not be refreshed");
      const updated = await getMarketRate(key);
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to refresh rate", error);
    }
  });

  // POST /api/market-rates/refresh-all — force refresh all stale rates
  app.post("/api/market-rates/refresh-all", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const count = await refreshAllStaleRates();
      res.json({ refreshed: count });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to refresh rates", error);
    }
  });

  // PATCH /api/market-rates/:key — admin override
  app.patch("/api/market-rates/:key", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const key = String(req.params.key);
      const existing = await getMarketRate(key);
      if (!existing) return sendError(res, 404, "Rate not found");

      const validation = marketRatePatchSchema.safeParse(req.body);
      if (!validation.success) return sendError(res, 400, fromZodError(validation.error).message);
      const { value, manualNote } = validation.data;

      await upsertMarketRate({
        rateKey: key,
        value,
        displayValue: String(value),
        source: existing.source,
        isManual: true,
        manualNote: manualNote || null,
        fetchedAt: new Date(),
      });

      const updated = await getMarketRate(key);
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update rate", error);
    }
  });

  app.get("/api/market-rates/fred-history/:seriesKey", requireAuth, async (req: Request, res: Response) => {
    try {
      const aggregator = getMarketIntelligenceAggregator();
      const data = await aggregator.fetchRateWithHistory(String(req.params.seriesKey));
      if (!data) return sendError(res, 404, "Series not found or FRED API unavailable");
      res.json(data);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch FRED history", error);
    }
  });

  app.get("/api/market-rates/fred-all", requireAuth, async (_req: Request, res: Response) => {
    try {
      const aggregator = getMarketIntelligenceAggregator();
      const data = await aggregator.fetchRatesOnly();
      res.json(data);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch FRED rates", error);
    }
  });

  app.get("/api/market-intelligence/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const aggregator = getMarketIntelligenceAggregator();
      res.json(aggregator.getServiceStatus());
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get service status", error);
    }
  });

  app.get("/api/market-intelligence/credit-risk", requireAuth, async (req: Request, res: Response) => {
    try {
      const { location, propertyType, propertyClass, state } = req.query as Record<string, string>;
      if (!location) {
        return res.json({ moodys: null, spGlobal: null });
      }
      const aggregator = getMarketIntelligenceAggregator();
      const data = await aggregator.gather({
        location,
        state,
        propertyType,
        propertyClass,
      });
      res.json({
        moodys: data.moodys || null,
        spGlobal: data.spGlobal || null,
        costar: data.costar || null,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch credit risk data", error);
    }
  });

  app.post("/api/market-intelligence/gather", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const validation = marketIntelligenceGatherSchema.safeParse(req.body);
      if (!validation.success) return sendError(res, 400, fromZodError(validation.error).message);
      const { location, state, propertyType, propertyClass, chainScale } = validation.data;
      const aggregator = getMarketIntelligenceAggregator();
      const data = await aggregator.gather({ location, state, propertyType, propertyClass, chainScale });
      res.json(data);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to gather market intelligence", error);
    }
  });
}
