/**
 * Macro-economic dispatchers — FRED, Alpha Vantage, World Bank.
 * These services provide rates, indices, and country macro context.
 */
import type { FREDService } from "../../../services/FREDService";
import type { AlphaVantageService } from "../../../services/AlphaVantageService";
import type { WorldBankService } from "../../../services/WorldBankService";
import type { DispatchHandler } from "./_shared";

const fred: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  const fred = svc.instance as FREDService;
  if (field === "acquisitionInterestRate") {
    const rates = await fred.fetchAllRates();
    const sofr = rates.sofr?.current?.value;
    const prime = rates.primeRate?.current?.value;
    if (sofr != null) {
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
      return {
        value: t10y + 3.0,
        range: { low: t10y + 2.0, mid: t10y + 3.0, high: t10y + 4.0 },
        provenance: `FRED 10Y Treasury ${t10y}% + hotel cap rate spread, L${rCtx.level}`,
      };
    }
    return null;
  }
  if (field === "startOccupancy" || field === "staffCompensation") {
    return null;
  }
  return null;
};

const alphaVantage: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  const av = svc.instance as AlphaVantageService;
  const data = await av.fetchMarketData();
  if (!data) return null;
  if (field === "acquisitionInterestRate") {
    const avgDivYield = data.reits.length > 0
      ? data.reits.reduce((sum, r) => sum + (r.monthChangePct ?? 0), 0) / data.reits.length
      : null;
    if (avgDivYield != null) {
      return { value: avgDivYield, provenance: `Alpha Vantage REIT market context, L${rCtx.level}` };
    }
  }
  return null;
};

const worldBank: DispatchHandler = async (_serviceKey, field, rCtx, _ctx, svc) => {
  if (!rCtx.country) return null;
  const wb = svc.instance as WorldBankService;
  const data = await wb.fetchCountryData(rCtx.country);
  if (!data) return null;
  if (field === "taxRate" && data.inflation) {
    return null;
  }
  if (field === "propertyTaxRate") {
    return null;
  }
  return null;
};

export const handlers: Record<string, DispatchHandler> = {
  fred,
  "alpha-vantage": alphaVantage,
  "world-bank": worldBank,
};
