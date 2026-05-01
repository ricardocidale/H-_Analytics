/**
 * Location-bound dispatchers — Weather, Walk Score, Realty,
 * US Real Estate, airport distances. These either need lat/lng or a
 * property-specific lookup that the orchestrator owns.
 */
import type { WeatherService } from "../../../services/WeatherService";
import type { WalkScoreService } from "../../../services/WalkScoreService";
import type { RealtyService } from "../../../services/RealtyService";
import type { DispatchHandler } from "./_shared";

const weather: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.location || field !== "costRateUtilities") return null;
  const w = svc.instance as WeatherService;
  const data = await w.fetchWeatherData(rCtx.location);
  if (!data) return null;
  const avgTemp = data.forecast.reduce((s, f) => s + f.avgTempC, 0) / (data.forecast.length || 1);
  return {
    value: null,
    provenance: `WeatherAPI avg temp ${avgTemp.toFixed(1)}C, ${rCtx.location} — context for utility cost estimation, L${rCtx.level}`,
  };
};

const walkScore: DispatchHandler = async (_serviceKey, _field, rCtx, ctx, svc) => {
  if (!ctx.latitude || !ctx.longitude || !ctx.propertyId) return null;
  const ws = svc.instance as WalkScoreService;
  const data = await ws.fetchScores({
    address: ctx.location || "",
    lat: ctx.latitude,
    lng: ctx.longitude,
    propertyId: ctx.propertyId,
  });
  if (!data || data.walkScore == null) return null;
  return {
    value: data.walkScore,
    provenance: `Walk Score ${data.walkScore} (${data.walkDesc ?? ""}), L${rCtx.level}`,
  };
};

const realty: DispatchHandler = async (_serviceKey, _field, rCtx, _ctx, svc) => {
  if (!rCtx.location) return null;
  const _realty = svc.instance as RealtyService;
  // Realty service requires specific search params; defer to the service.
  return null;
};

const usRealEstate: DispatchHandler = async (_serviceKey, _field, rCtx) => {
  if (!rCtx.location) return null;
  return null;
};

const airportDistances: DispatchHandler = async (_serviceKey, _field, _rCtx, ctx) => {
  if (!ctx.propertyId) return null;
  // Airport distances are looked up per-property, not per-field.
  return null;
};

export const handlers: Record<string, DispatchHandler> = {
  weather,
  "walk-score": walkScore,
  realty,
  "us-real-estate": usRealEstate,
  "airport-distances": airportDistances,
};
