/**
 * Pre-collected market data tables (priority 0 — DB lookups).
 * Includes Market ADR Index, seasonal calendars, event calendars,
 * labor rates, and F&B benchmarks.
 */
import type { DispatchHandler } from "./_shared";

const marketAdrIndex: DispatchHandler = async (_serviceKey, field, rCtx, ctx) => {
  const market = rCtx.city || rCtx.location || ctx.city;
  if (!market) return null;
  const { lookupMarketAdr } = await import("../../benchmark-lookups");
  const adr = await lookupMarketAdr(market);
  if (!adr) return null;

  if (field === "startAdr") {
    const val = adr.boutiqueAdr ?? adr.luxuryAdr ?? adr.avgAdr;
    if (val == null) return null;
    return {
      value: val,
      range: { low: Math.round(val * 0.8), mid: Math.round(val), high: Math.round(val * 1.2) },
      provenance: `H+ Market ADR Index, ${adr.market} ${adr.quarter}, L${rCtx.level}`,
    };
  }
  if (field === "startOccupancy" && adr.avgOccupancy != null) {
    const v = adr.avgOccupancy / 100; // stored as percentage, engine uses decimal
    return {
      value: v,
      range: { low: Math.round(v * 0.85 * 100) / 100, mid: v, high: Math.min(0.95, Math.round(v * 1.15 * 100) / 100) },
      provenance: `H+ Market ADR Index occupancy, ${adr.market} ${adr.quarter}, L${rCtx.level}`,
    };
  }
  return null;
};

const seasonalCalendars: DispatchHandler = async (_serviceKey, _field, rCtx, ctx) => {
  const market = rCtx.city || rCtx.location || ctx.city;
  if (!market) return null;
  const { lookupSeasonalCurve } = await import("../../benchmark-lookups");
  const curve = await lookupSeasonalCurve(market);
  if (!curve) return null;
  const peakDm = curve.months.find(m => m.month === curve.peakMonth)?.demandMultiplier ?? 1;
  return {
    value: null,
    provenance: `H+ Seasonal Calendar, ${curve.market}: peak month ${curve.peakMonth} (${peakDm.toFixed(2)}x), trough month ${curve.troughMonth}, L${rCtx.level}`,
  };
};

const eventCalendars: DispatchHandler = async (_serviceKey, _field, rCtx, ctx) => {
  const market = rCtx.city || rCtx.location || ctx.city;
  if (!market) return null;
  const { lookupEventCalendar } = await import("../../benchmark-lookups");
  const events = await lookupEventCalendar(market);
  if (!events || events.events.length === 0) return null;
  const highImpact = events.events.filter(e => e.impact === "high");
  return {
    value: null,
    provenance: `H+ Event Calendar, ${events.market}: ${events.events.length} events (${highImpact.length} high-impact), L${rCtx.level}`,
  };
};

const laborRates: DispatchHandler = async (_serviceKey, _field, rCtx, ctx) => {
  const market = rCtx.city || rCtx.location || ctx.city;
  if (!market) return null;
  const { lookupLaborCosts } = await import("../../benchmark-lookups");
  const labor = await lookupLaborCosts(market, rCtx.country || ctx.country);
  if (!labor) return null;
  const avgSalary = labor.roles.reduce((s, r) => s + (r.annualSalary ?? 0), 0) / labor.roles.length;
  return {
    value: null,
    provenance: `H+ Labor Rates, ${labor.market}: ${labor.roles.length} roles, avg $${Math.round(avgSalary).toLocaleString()}/yr, L${rCtx.level}`,
  };
};

const fbBenchmarks: DispatchHandler = async (_serviceKey, field, rCtx, ctx) => {
  const market = rCtx.city || rCtx.location || ctx.city;
  if (!market) return null;
  const { lookupFbBenchmarks } = await import("../../benchmark-lookups");
  const fb = await lookupFbBenchmarks(market, rCtx.propertyType || ctx.propertyType);
  if (!fb) return null;
  if (field === "costRateFB" && fb.fbCostOfGoodsPercent != null) {
    const v = fb.fbCostOfGoodsPercent;
    return {
      value: v,
      range: { low: v * 0.9, mid: v, high: v * 1.1 },
      provenance: `H+ F&B Benchmarks, ${fb.market} (${fb.propertyType}), L${rCtx.level}`,
    };
  }
  return null;
};

export const handlers: Record<string, DispatchHandler> = {
  "market-adr-index": marketAdrIndex,
  "seasonal-calendars": seasonalCalendars,
  "event-calendars": eventCalendars,
  "labor-rates": laborRates,
  "fb-benchmarks": fbBenchmarks,
};
