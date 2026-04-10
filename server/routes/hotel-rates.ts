import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { logAndSendError } from "./helpers";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";
import { aiRateLimit } from "../middleware/rate-limit";
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
}
