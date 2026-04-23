/**
 * Market-data dispatchers — Amadeus, CoStar, Hospitality Benchmarks, Xotelo.
 * These services provide direct ADR / occupancy / cap-rate signals for a market.
 */
import type { AmadeusService } from "../../../services/AmadeusService";
import type { CoStarService } from "../../../services/CoStarService";
import type { HospitalityBenchmarkService } from "../../../services/HospitalityBenchmarkService";
import type { XoteloService } from "../../../services/XoteloService";
import type { DispatchHandler } from "./_shared";

const amadeus: DispatchHandler = async (_serviceKey, _field, rCtx, ctx, svc) => {
  if (!ctx.latitude || !ctx.longitude) return null;
  const amadeus: AmadeusService = svc.instance;
  const result = await amadeus.fetchAdrBenchmark(ctx.latitude, ctx.longitude, rCtx.qualityTier);
  if (!result || result.value == null) return null;
  const v = result.value;
  return {
    value: v,
    range: { low: Math.round(v * 0.85), mid: Math.round(v), high: Math.round(v * 1.15) },
    provenance: `${result.source}, ${rCtx.location ?? "nearby"}, L${rCtx.level}`,
  };
};

const costar: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.location) return null;
  const costar: CoStarService = svc.instance;
  const data = await costar.fetchMarketData({
    location: rCtx.location,
    state: rCtx.state,
    propertyType: rCtx.propertyType,
  });
  if (!data) return null;

  if (field === "startAdr" && data.adr) {
    return { value: data.adr.value, provenance: `CoStar ADR, ${rCtx.location}, L${rCtx.level}` };
  }
  if (field === "startOccupancy" && data.occupancyRate) {
    return { value: data.occupancyRate.value, provenance: `CoStar occupancy, ${rCtx.location}, L${rCtx.level}` };
  }
  if (field === "adrGrowthRate" && data.rentGrowthYoY) {
    return { value: data.rentGrowthYoY.value, provenance: `CoStar YoY growth, ${rCtx.location}, L${rCtx.level}` };
  }
  if (field === "exitCapRate" && data.submarketCapRate) {
    return { value: data.submarketCapRate.value, provenance: `CoStar cap rate, ${rCtx.location}, L${rCtx.level}` };
  }
  if (field === "costRateRooms" && data.revpar) {
    return null;
  }
  return null;
};

const hospitalityBenchmarks: DispatchHandler = async (_serviceKey, field, rCtx, ctx, svc) => {
  if (!rCtx.location) return null;
  const hb: HospitalityBenchmarkService = svc.instance;
  const data = await hb.fetchBenchmarks({
    city: rCtx.city ?? rCtx.location,
    state: rCtx.state,
    propertyClass: rCtx.qualityTier,
    chainScale: ctx.chainScale,
  });
  if (!data) return null;

  if (field === "startAdr" && data.adr) {
    return { value: data.adr.value, provenance: `H+ benchmarks ADR, ${data.submarket}, L${rCtx.level}` };
  }
  if (field === "startOccupancy" && data.occupancy) {
    return { value: data.occupancy.value, provenance: `H+ benchmarks occupancy, ${data.submarket}, L${rCtx.level}` };
  }
  if (field === "exitCapRate" && data.capRate) {
    return { value: data.capRate.value, provenance: `H+ benchmarks cap rate, ${data.submarket}, L${rCtx.level}` };
  }
  if (field.startsWith("costRate") || field === "revShareFB" || field === "revShareEvents" ||
      field === "baseFeePercent" || field === "incentiveFeePercent" || field === "adrGrowthRate") {
    return null;
  }
  return null;
};

const xotelo: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.location || field !== "startAdr") return null;
  const xot: XoteloService = svc.instance;
  const benchmark = await xot.fetchAdrBenchmark(rCtx.location);
  if (!benchmark || benchmark.value == null) return null;
  return {
    value: benchmark.value,
    provenance: `Xotelo ADR benchmark, ${rCtx.location}, L${rCtx.level}`,
  };
};

export const handlers: Record<string, DispatchHandler> = {
  amadeus,
  costar,
  "hospitality-benchmarks": hospitalityBenchmarks,
  xotelo,
};
