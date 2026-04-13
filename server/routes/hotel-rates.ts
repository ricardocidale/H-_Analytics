import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { logAndSendError } from "./helpers";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";
import { aiRateLimit } from "../middleware/rate-limit";
import { storage } from "../storage";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1).max(200),
});

const ratesSchema = z.object({
  hotel_key: z.string().min(1).max(100),
  chk_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chk_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default("USD"),
});

const listSchema = z.object({
  location_key: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["best_value", "popularity", "distance"]).default("popularity"),
});

const snapshotSchema = z.object({
  location: z.string().max(200).optional(),
  location_key: z.string().max(100).optional(),
}).refine((d) => d.location || d.location_key, {
  message: "location or location_key parameter required",
});

export function register(app: Express) {
  const limiter = aiRateLimit(30, 60_000);

  app.get("/api/hotel-rates/search", requireAuth, limiter, async (req: Request, res: Response) => {
    try {
      const parsed = searchSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });

      const xotelo = getMarketIntelligenceAggregator().getXoteloService();
      const results = await xotelo.searchHotels(parsed.data.query);
      res.json({ results });
    } catch (error: unknown) {
      logAndSendError(res, "Hotel search failed", error);
    }
  });

  app.get("/api/hotel-rates/rates", requireAuth, limiter, async (req: Request, res: Response) => {
    try {
      const parsed = ratesSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" });

      const { hotel_key, chk_in, chk_out, currency } = parsed.data;
      const xotelo = getMarketIntelligenceAggregator().getXoteloService();
      const rates = await xotelo.getHotelRates(hotel_key, chk_in, chk_out, currency);
      res.json({ rates });
    } catch (error: unknown) {
      logAndSendError(res, "Hotel rate lookup failed", error);
    }
  });

  app.get("/api/hotel-rates/list", requireAuth, limiter, async (req: Request, res: Response) => {
    try {
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" });

      const { location_key, limit, offset, sort } = parsed.data;
      const xotelo = getMarketIntelligenceAggregator().getXoteloService();
      const hotels = await xotelo.getHotelList(location_key, limit, offset, sort);
      res.json({ hotels });
    } catch (error: unknown) {
      logAndSendError(res, "Hotel list failed", error);
    }
  });

  app.get("/api/hotel-rates/market-snapshot", requireAuth, limiter, async (req: Request, res: Response) => {
    try {
      const parsed = snapshotSchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters" });

      const { location, location_key } = parsed.data;
      const xotelo = getMarketIntelligenceAggregator().getXoteloService();
      const snapshot = location_key
        ? await xotelo.getMarketSnapshotByKey(location_key, location || undefined)
        : await xotelo.getMarketSnapshot(location!);
      res.json({ snapshot });
    } catch (error: unknown) {
      logAndSendError(res, "Market snapshot failed", error);
    }
  });

  // ── Amadeus Hotel API endpoints ──────────────────────────────────────────
  // Stricter rate limit: 10 req/min to preserve free tier quota (2-10K/month)
  const amadeusLimiter = aiRateLimit(10, 60_000);

  const amadeusCompSetSchema = z.object({
    propertyId: z.coerce.number().int().positive(),
  });

  const amadeusMarketSchema = z.object({
    cityCode: z.string().length(3).toUpperCase(),
    chk_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    chk_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  app.get("/api/hotel-rates/amadeus/comp-set/:propertyId", requireAuth, amadeusLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = amadeusCompSetSchema.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid property ID" });

      const amadeus = getMarketIntelligenceAggregator().getAmadeusService();
      if (!amadeus.isAvailable()) {
        return res.status(503).json({ error: "Amadeus API not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET." });
      }

      // Load property to get lat/lng and quality tier
      const property = await storage.getProperty(parsed.data.propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

      const latitude = property.latitude ? parseFloat(String(property.latitude)) : null;
      const longitude = property.longitude ? parseFloat(String(property.longitude)) : null;
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Property is missing latitude/longitude coordinates" });
      }

      const compSet = await amadeus.searchCompSet({
        name: property.name,
        latitude,
        longitude,
        qualityTier: (property as any).qualityTier,
        location: property.location ?? undefined,
      });

      res.json({ compSet });
    } catch (error: unknown) {
      logAndSendError(res, "Amadeus comp-set search failed", error);
    }
  });

  app.get("/api/hotel-rates/amadeus/market/:cityCode", requireAuth, amadeusLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = amadeusMarketSchema.safeParse({ ...req.params, ...req.query });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid parameters. Requires cityCode (3-letter IATA), chk_in, chk_out (YYYY-MM-DD)." });

      const amadeus = getMarketIntelligenceAggregator().getAmadeusService();
      if (!amadeus.isAvailable()) {
        return res.status(503).json({ error: "Amadeus API not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET." });
      }

      const { cityCode, chk_in, chk_out } = parsed.data;
      const marketRates = await amadeus.getMarketRates(cityCode, chk_in, chk_out);
      res.json({ marketRates });
    } catch (error: unknown) {
      logAndSendError(res, "Amadeus market rates failed", error);
    }
  });
}
