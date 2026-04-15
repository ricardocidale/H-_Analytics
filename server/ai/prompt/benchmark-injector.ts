/**
 * benchmark-injector.ts — Gathers pre-collected market data and formats it
 * for injection into research prompts.
 *
 * Called before assembleResearchPrompt() to populate the benchmarkData field.
 * Each lookup returns null if no data exists — the prompt adapts gracefully.
 */

import {
  lookupMarketAdr,
  lookupSeasonalCurve,
  lookupEventCalendar,
  lookupLaborCosts,
  lookupFbBenchmarks,
} from "../benchmark-lookups";
import type { BenchmarkInjection } from "./assemble-research-prompt";
import { logger } from "../../logger";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Gather all available benchmark data for a market and format for prompt injection.
 * Returns null for any section without data — the prompt builder skips those.
 */
export async function gatherBenchmarkData(params: {
  market?: string;
  city?: string;
  country?: string;
  propertyType?: string;
}): Promise<BenchmarkInjection> {
  const market = params.market || params.city;
  if (!market) return {};

  const result: BenchmarkInjection = {};

  try {
    // ADR / Occupancy / RevPAR
    const adr = await lookupMarketAdr(market);
    if (adr) {
      const parts = [`**Market: ${adr.market} (${adr.quarter})**`];
      if (adr.avgAdr) parts.push(`- Average ADR: $${adr.avgAdr}`);
      if (adr.luxuryAdr) parts.push(`- Luxury segment ADR: $${adr.luxuryAdr}`);
      if (adr.boutiqueAdr) parts.push(`- Boutique segment ADR: $${adr.boutiqueAdr}`);
      if (adr.upscaleAdr) parts.push(`- Upscale segment ADR: $${adr.upscaleAdr}`);
      if (adr.midscaleAdr) parts.push(`- Midscale segment ADR: $${adr.midscaleAdr}`);
      if (adr.avgOccupancy) parts.push(`- Average occupancy: ${adr.avgOccupancy}%`);
      if (adr.avgRevpar) parts.push(`- Average RevPAR: $${adr.avgRevpar}`);
      if (adr.source) parts.push(`- Source: ${adr.source}`);
      result.marketAdr = parts.join("\n");
    }

    // Seasonal demand curve
    const seasonal = await lookupSeasonalCurve(market);
    if (seasonal) {
      const curveStr = seasonal.months.map(m =>
        `${MONTH_NAMES[m.month - 1]}: ${m.demandMultiplier.toFixed(2)}x (${m.seasonType})`
      ).join(", ");
      result.seasonalCurve = `**Seasonal Demand Pattern — ${seasonal.market}**\nPeak: ${MONTH_NAMES[seasonal.peakMonth - 1]}, Trough: ${MONTH_NAMES[seasonal.troughMonth - 1]}\n${curveStr}`;
    }

    // Events
    const events = await lookupEventCalendar(market);
    if (events && events.events.length > 0) {
      const eventList = events.events.map(e => {
        const timing = e.startMonth ? MONTH_NAMES[e.startMonth - 1] : "varies";
        return `- **${e.name}** (${timing}, ${e.impact} impact${e.attendees ? `, ~${(e.attendees / 1000).toFixed(0)}K attendees` : ""})${e.notes ? ` — ${e.notes}` : ""}`;
      }).join("\n");
      result.events = `**Demand-Driving Events — ${events.market}**\n${eventList}`;
    }

    // Labor rates
    const labor = await lookupLaborCosts(market, params.country);
    if (labor) {
      const roleList = labor.roles.map(r =>
        `- ${r.role}: ${r.annualSalary ? `$${r.annualSalary.toLocaleString("en-US")}/yr` : "N/A"}${r.source ? ` (${r.source})` : ""}`
      ).join("\n");
      result.laborRates = `**Hospitality Labor Rates — ${labor.market} (${labor.country})**\n${roleList}`;
    }

    // F&B benchmarks
    const fb = await lookupFbBenchmarks(market, params.propertyType);
    if (fb) {
      const parts = [`**F&B Operating Benchmarks — ${fb.market} (${fb.propertyType})**`];
      if (fb.avgTicketPerPerson) parts.push(`- Average ticket per person: $${fb.avgTicketPerPerson}`);
      if (fb.coversPerRoomNight) parts.push(`- Covers per room night: ${fb.coversPerRoomNight}`);
      if (fb.fbCostOfGoodsPercent) parts.push(`- F&B COGS: ${(fb.fbCostOfGoodsPercent * 100).toFixed(0)}%`);
      if (fb.fbLaborCostPercent) parts.push(`- F&B labor cost: ${(fb.fbLaborCostPercent * 100).toFixed(0)}%`);
      result.fbBenchmarks = parts.join("\n");
    }
  } catch (err: unknown) {
    logger.warn(`Benchmark injection failed (non-blocking): ${err instanceof Error ? err.message : err}`, "benchmark-injector");
  }

  return result;
}
