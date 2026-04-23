/**
 * Service-call dispatchers — given a (service, field, relaxedContext, context)
 * tuple, perform the actual outbound call and shape the result into a
 * `DispatchResult`. Returns null when the service has no usable data for the
 * requested field at the given relaxation level.
 *
 * Split out of `data-routing.ts` so that the orchestrator can stay small and
 * the per-service mapping logic lives in one focused module.
 */
import type { AmadeusService } from "../../services/AmadeusService";
import type { CoStarService } from "../../services/CoStarService";
import type { HospitalityBenchmarkService } from "../../services/HospitalityBenchmarkService";
import type { FREDService } from "../../services/FREDService";
import type { AlphaVantageService } from "../../services/AlphaVantageService";
import type { XoteloService } from "../../services/XoteloService";
import type { ApifyService } from "../../services/ApifyService";
import type { RapidApiHospitalityService } from "../../services/RapidApiHospitalityService";
import type { WeatherService } from "../../services/WeatherService";
import type { WorldBankService } from "../../services/WorldBankService";
import type { WalkScoreService } from "../../services/WalkScoreService";
import type { RealtyService } from "../../services/RealtyService";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "../../../shared/regulatory-data";
import { logger } from "../../logger";
import { getServiceRegistry } from "./service-registry";
import type { DispatchResult, RelaxedContext, RoutingContext } from "./types";

export async function callServiceForField(
  serviceKey: string,
  _method: string,
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
): Promise<DispatchResult | null> {
  const registry = getServiceRegistry();
  const svc = registry[serviceKey];
  if (!svc || !svc.isAvailable()) return null;

  try {
    switch (serviceKey) {
      // ── Amadeus ────────────────────────────────────────────────────
      case "amadeus": {
        if (!ctx.latitude || !ctx.longitude) return null;
        const amadeus: AmadeusService = svc.instance;
        const result = await amadeus.fetchAdrBenchmark(ctx.latitude, ctx.longitude, rCtx.qualityTier);
        if (!result || result.value == null) return null;
        // Amadeus returns a single ADR; manufacture a range +/-15%
        const v = result.value;
        return {
          value: v,
          range: { low: Math.round(v * 0.85), mid: Math.round(v), high: Math.round(v * 1.15) },
          provenance: `${result.source}, ${rCtx.location ?? "nearby"}, L${rCtx.level}`,
        };
      }

      // ── CoStar ─────────────────────────────────────────────────────
      case "costar": {
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
          // CoStar revpar as operating cost proxy — not direct, return null
          return null;
        }
        return null;
      }

      // ── Hospitality Benchmarks (DB) ────────────────────────────────
      case "hospitality-benchmarks": {
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
        // All cost-related fields use the same benchmark source
        if (field.startsWith("costRate") || field === "revShareFB" || field === "revShareEvents" ||
            field === "baseFeePercent" || field === "incentiveFeePercent" || field === "adrGrowthRate") {
          // These are segment-level benchmarks; not a single value from the benchmarks table
          // but they signal availability. Return null for now — the LLM synthesizes these.
          return null;
        }
        return null;
      }

      // ── FRED ───────────────────────────────────────────────────────
      case "fred": {
        const fred: FREDService = svc.instance;
        if (field === "acquisitionInterestRate") {
          const rates = await fred.fetchAllRates();
          const sofr = rates.sofr?.current?.value;
          const prime = rates.primeRate?.current?.value;
          if (sofr != null) {
            // Commercial hotel loan = SOFR + spread (typically 200-350 bps)
            const base = sofr;
            return {
              value: base,
              range: { low: base + 2.0, mid: base + 2.75, high: base + 3.5 },
              provenance: `FRED SOFR ${base}% + typical hotel loan spread, L${rCtx.level}`,
            };
          }
          if (prime != null) {
            return { value: prime, provenance: `FRED Prime Rate ${prime}%, L${rCtx.level}` };
          }
          return null;
        }
        if (field === "adrGrowthRate") {
          const rates = await fred.fetchAllRates();
          const cpi = rates.cpi?.current?.value;
          if (cpi != null) {
            return {
              value: cpi,
              range: { low: Math.max(cpi - 1, 0), mid: cpi, high: cpi + 1.5 },
              provenance: `FRED CPI ${cpi}% (ADR growth floor), L${rCtx.level}`,
            };
          }
          return null;
        }
        if (field === "exitCapRate") {
          const rates = await fred.fetchAllRates();
          const t10y = rates.treasury10y?.current?.value;
          if (t10y != null) {
            // Hotel cap rate ~ T10Y + 200-400 bps
            return {
              value: t10y + 3.0,
              range: { low: t10y + 2.0, mid: t10y + 3.0, high: t10y + 4.0 },
              provenance: `FRED 10Y Treasury ${t10y}% + hotel cap rate spread, L${rCtx.level}`,
            };
          }
          return null;
        }
        if (field === "startOccupancy" || field === "staffCompensation") {
          // FRED doesn't have direct hotel occupancy or wage data that maps cleanly
          return null;
        }
        return null;
      }

      // ── Alpha Vantage ──────────────────────────────────────────────
      case "alpha-vantage": {
        const av: AlphaVantageService = svc.instance;
        const data = await av.fetchMarketData();
        if (!data) return null;
        if (field === "acquisitionInterestRate") {
          // Use REIT dividend yields as market context
          const avgDivYield = data.reits.length > 0
            ? data.reits.reduce((sum, r) => sum + (r.monthChangePct ?? 0), 0) / data.reits.length
            : null;
          if (avgDivYield != null) {
            return { value: avgDivYield, provenance: `Alpha Vantage REIT market context, L${rCtx.level}` };
          }
        }
        return null;
      }

      // ── Xotelo ─────────────────────────────────────────────────────
      case "xotelo": {
        if (!rCtx.location || field !== "startAdr") return null;
        const xot: XoteloService = svc.instance;
        const benchmark = await xot.fetchAdrBenchmark(rCtx.location);
        if (!benchmark || benchmark.value == null) return null;
        return {
          value: benchmark.value,
          provenance: `Xotelo ADR benchmark, ${rCtx.location}, L${rCtx.level}`,
        };
      }

      // ── Apify (Airbnb, VRBO, TripAdvisor) ─────────────────────────
      case "apify-airbnb":
      case "apify-vrbo":
      case "apify-tripadvisor": {
        if (!rCtx.location) return null;
        const apify: ApifyService = svc.instance;
        const data = await apify.fetchCompSetData(rCtx.location);
        if (!data) return null;

        if (field === "startAdr" || field === "nightlyPropertyRate") {
          if (serviceKey === "apify-airbnb" && data.airbnb?.avgNightlyRate) {
            const v = data.airbnb.avgNightlyRate.value;
            const r = data.airbnb.priceRange;
            return {
              value: v,
              range: r ? { low: r.min, mid: v, high: r.max } : undefined,
              provenance: `Apify Airbnb, ${data.airbnb.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
            };
          }
          if (serviceKey === "apify-vrbo" && data.vrbo?.avgNightlyRate) {
            const v = data.vrbo.avgNightlyRate.value;
            const r = data.vrbo.priceRange;
            return {
              value: v,
              range: r ? { low: r.min, mid: v, high: r.max } : undefined,
              provenance: `Apify VRBO, ${data.vrbo.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
            };
          }
        }
        if (field === "avgTicketFB" && serviceKey === "apify-tripadvisor" && data.tripadvisor) {
          // TripAdvisor doesn't directly give F&B ticket, return null
          return null;
        }
        return null;
      }

      // ── RapidAPI (Booking.com, Zillow) ─────────────────────────────
      case "rapidapi-booking": {
        if (!rCtx.location) return null;
        const rapid: RapidApiHospitalityService = svc.instance;
        const data = await rapid.fetchCompSetData(rCtx.location);
        if (!data || !data.booking) return null;
        if (field === "startAdr" && data.booking.avgNightlyRate) {
          const v = data.booking.avgNightlyRate.value;
          const r = data.booking.priceRange;
          return {
            value: v,
            range: r ? { low: r.min, mid: v, high: r.max } : undefined,
            provenance: `RapidAPI Booking.com, ${data.booking.hotelCount} hotels, ${rCtx.location}, L${rCtx.level}`,
          };
        }
        return null;
      }

      case "rapidapi-zillow": {
        // Zillow for property tax — would require property-specific lookup
        return null;
      }

      // ── Weather ────────────────────────────────────────────────────
      case "weather": {
        if (!rCtx.location || field !== "costRateUtilities") return null;
        const w: WeatherService = svc.instance;
        const data = await w.fetchWeatherData(rCtx.location);
        if (!data) return null;
        // Weather is context for utility costs, not a direct value
        const avgTemp = data.forecast.reduce((s, f) => s + f.avgTempC, 0) / (data.forecast.length || 1);
        return {
          value: null,
          provenance: `WeatherAPI avg temp ${avgTemp.toFixed(1)}C, ${rCtx.location} — context for utility cost estimation, L${rCtx.level}`,
        };
      }

      // ── World Bank ─────────────────────────────────────────────────
      case "world-bank": {
        if (!rCtx.country) return null;
        const wb: WorldBankService = svc.instance;
        const data = await wb.fetchCountryData(rCtx.country);
        if (!data) return null;
        if (field === "taxRate" && data.inflation) {
          // World Bank doesn't directly give hotel tax rates, but provides macro context
          return null;
        }
        if (field === "propertyTaxRate") {
          // World Bank doesn't have property-level tax rates
          return null;
        }
        return null;
      }

      // ── Country Defaults (in-memory, always available) ─────────────
      case "country-defaults": {
        const country = rCtx.country || ctx.country;
        if (!country) return null;
        const defaults = getCountryDefaults(country);
        if (!defaults) return null;

        if (field === "taxRate" && defaults.taxRate != null) {
          return {
            value: defaults.taxRate,
            provenance: `H+ country defaults, ${country}, corporate tax rate ${(defaults.taxRate * 100).toFixed(1)}%, L${rCtx.level}`,
          };
        }
        if (field === "depreciationYears" && defaults.depreciationYears != null) {
          return {
            value: defaults.depreciationYears,
            provenance: `H+ country defaults, ${country}, ${defaults.depreciationAuthority}, L${rCtx.level}`,
          };
        }
        if (field === "propertyTaxRate" && defaults.costRateTaxes != null) {
          return {
            value: defaults.costRateTaxes,
            provenance: `H+ country defaults, ${country}, property tax rate, L${rCtx.level}`,
          };
        }
        return null;
      }

      // ── Regulatory Data ────────────────────────────────────────────
      case "regulatory-data": {
        const country = rCtx.country || ctx.country;
        if (!country) return null;
        const profile = getRegulatoryProfile(country);
        if (!profile) return null;

        // Regulatory profiles provide licensing, zoning, and legal context
        // but not direct numeric tax/depreciation values (those come from country-defaults).
        // Return null for numeric fields; the profile enriches prompt context elsewhere.
        if (field === "depreciationYears" || field === "hotelTaxRate") {
          return {
            value: null,
            provenance: `Regulatory profile for ${country} available (licensing: ${profile.licensing.licenseType}), L${rCtx.level}`,
          };
        }
        return null;
      }

      // ── Walk Score ─────────────────────────────────────────────────
      case "walk-score": {
        if (!ctx.latitude || !ctx.longitude || !ctx.propertyId) return null;
        const ws: WalkScoreService = svc.instance;
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
      }

      // ── Realty Service ─────────────────────────────────────────────
      case "realty": {
        if (!rCtx.location) return null;
        const _realty: RealtyService = svc.instance;
        // Realty service requires specific search params; defer to the service
        return null;
      }

      // ── US Real Estate Service ─────────────────────────────────────
      case "us-real-estate": {
        if (!rCtx.location) return null;
        return null;
      }

      // ── Grounded Research (web search) ─────────────────────────────
      case "grounded-research": {
        if (!rCtx.location) return null;
        const gr = svc.instance;
        const queries = buildFieldSpecificQuery(field, rCtx, ctx);
        if (!queries.length) return null;

        const results = await gr.search(queries);
        if (!results.length || !results[0].answer) return null;

        // Web research doesn't return numeric values directly
        // But it provides context the LLM will synthesize
        return {
          value: null,
          provenance: `Web research: "${results[0].query}" — ${results[0].sources.length} sources, L${rCtx.level}`,
        };
      }

      // ── Pre-collected Market Data Tables (Priority 0 — DB lookups) ────
      case "market-adr-index": {
        const market = rCtx.city || rCtx.location || ctx.city;
        if (!market) return null;
        const { lookupMarketAdr } = await import("../benchmark-lookups");
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
      }

      case "seasonal-calendars": {
        const market = rCtx.city || rCtx.location || ctx.city;
        if (!market) return null;
        const { lookupSeasonalCurve } = await import("../benchmark-lookups");
        const curve = await lookupSeasonalCurve(market);
        if (!curve) return null;
        // Seasonal data is context, not a single value. Return peak/trough info.
        const peakDm = curve.months.find(m => m.month === curve.peakMonth)?.demandMultiplier ?? 1;
        return {
          value: null,
          provenance: `H+ Seasonal Calendar, ${curve.market}: peak month ${curve.peakMonth} (${peakDm.toFixed(2)}x), trough month ${curve.troughMonth}, L${rCtx.level}`,
        };
      }

      case "event-calendars": {
        const market = rCtx.city || rCtx.location || ctx.city;
        if (!market) return null;
        const { lookupEventCalendar } = await import("../benchmark-lookups");
        const events = await lookupEventCalendar(market);
        if (!events || events.events.length === 0) return null;
        const highImpact = events.events.filter(e => e.impact === "high");
        return {
          value: null,
          provenance: `H+ Event Calendar, ${events.market}: ${events.events.length} events (${highImpact.length} high-impact), L${rCtx.level}`,
        };
      }

      case "labor-rates": {
        const market = rCtx.city || rCtx.location || ctx.city;
        if (!market) return null;
        const { lookupLaborCosts } = await import("../benchmark-lookups");
        const labor = await lookupLaborCosts(market, rCtx.country || ctx.country);
        if (!labor) return null;
        // Labor data is context for cost rate estimation
        const avgSalary = labor.roles.reduce((s, r) => s + (r.annualSalary ?? 0), 0) / labor.roles.length;
        return {
          value: null,
          provenance: `H+ Labor Rates, ${labor.market}: ${labor.roles.length} roles, avg $${Math.round(avgSalary).toLocaleString()}/yr, L${rCtx.level}`,
        };
      }

      case "fb-benchmarks": {
        const market = rCtx.city || rCtx.location || ctx.city;
        if (!market) return null;
        const { lookupFbBenchmarks } = await import("../benchmark-lookups");
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
      }

      case "airport-distances": {
        if (!ctx.propertyId) return null;
        // Airport distances are looked up per-property, not per-field
        return null;
      }

      default:
        return null;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Data router: ${serviceKey}.${_method} failed for ${field}: ${msg}`, "data-router");
    return null;
  }
}

/** Build field-specific search queries for grounded research */
export function buildFieldSpecificQuery(
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
): Array<{ query: string; focusSites?: string[] }> {
  const loc = rCtx.location || rCtx.city || rCtx.state || rCtx.country || "";
  const tier = rCtx.qualityTier || ctx.qualityTier || "boutique hotel";

  const hospitalitySites = ["str.com", "costar.com", "hotelnewsnow.com", "hospitalitynet.org", "hvs.com"];

  const queryMap: Record<string, Array<{ query: string; focusSites?: string[] }>> = {
    revShareFB: [{ query: `F&B revenue as percentage of total hotel revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    revShareEvents: [{ query: `event venue revenue share boutique hotel ${loc}`, focusSites: hospitalitySites }],
    costRateAdmin: [{ query: `hotel administrative and general expenses as percentage of revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    costRateMarketing: [{ query: `hotel marketing expenses percentage of revenue ${tier}`, focusSites: hospitalitySites }],
    baseFeePercent: [{ query: `hotel management company base fee percentage ${tier}`, focusSites: ["hvs.com", "hospitalitynet.org"] }],
    staffCompensation: [{ query: `hospitality industry average hourly wage ${loc}`, focusSites: ["bls.gov", "indeed.com"] }],
    hotelTaxRate: [{ query: `hotel occupancy tax rate ${loc}` }],
    avgTicketFB: [{ query: `average food and beverage spend per guest hotel ${loc}` }],
    distanceToAirport: [{ query: `nearest airport to ${loc} distance` }],
    propertyValue: [{ query: `commercial property values ${loc}` }],
  };

  return queryMap[field] || [{ query: `${field} benchmark ${tier} hotel ${loc}`, focusSites: hospitalitySites }];
}
