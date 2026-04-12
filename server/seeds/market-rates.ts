/**
 * market-rates seed — Defines which rates to track (not the values).
 *
 * On first boot, this creates rows in the market_rates table for each rate.
 * Actual values are fetched on the first periodic refresh cycle.
 */

import { db } from "../db";
import { marketRates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

interface RateDefinition {
  rateKey: string;
  source: string;
  seriesId: string | null;
  sourceUrl: string;
  maxStalenessHours: number;
  displayValue: string;
}

const RATE_DEFINITIONS: RateDefinition[] = [
  // --- FRED (Federal Reserve Economic Data) ---
  {
    rateKey: "fed_funds",
    source: "fred",
    seriesId: "FEDFUNDS",
    sourceUrl: "https://fred.stlouisfed.org/series/FEDFUNDS",
    maxStalenessHours: 24,
    displayValue: "Fed Funds Rate",
  },
  {
    rateKey: "sofr",
    source: "fred",
    seriesId: "SOFR",
    sourceUrl: "https://fred.stlouisfed.org/series/SOFR",
    maxStalenessHours: 24,
    displayValue: "SOFR",
  },
  {
    rateKey: "treasury_10y",
    source: "fred",
    seriesId: "DGS10",
    sourceUrl: "https://fred.stlouisfed.org/series/DGS10",
    maxStalenessHours: 24,
    displayValue: "10-Year Treasury",
  },
  {
    rateKey: "mortgage_30y",
    source: "fred",
    seriesId: "MORTGAGE30US",
    sourceUrl: "https://fred.stlouisfed.org/series/MORTGAGE30US",
    maxStalenessHours: 168,
    displayValue: "30-Year Mortgage",
  },
  {
    rateKey: "cpi_yoy",
    source: "fred",
    seriesId: "CPIAUCSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCSL",
    maxStalenessHours: 168,
    displayValue: "CPI (YoY)",
  },
  {
    rateKey: "cpi_food_bev",
    source: "fred",
    seriesId: "CPIFABSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIFABSL",
    maxStalenessHours: 168,
    displayValue: "CPI Food & Beverages",
  },
  {
    rateKey: "ppi_construction",
    source: "fred",
    seriesId: "WPUSI012011",
    sourceUrl: "https://fred.stlouisfed.org/series/WPUSI012011",
    maxStalenessHours: 168,
    displayValue: "PPI Construction Materials",
  },

  // DGS30 — 30-Year Treasury (long-term financing benchmark)
  {
    rateKey: "treasury_30y",
    source: "fred",
    seriesId: "DGS30",
    sourceUrl: "https://fred.stlouisfed.org/series/DGS30",
    maxStalenessHours: 24,
    displayValue: "30-Year Treasury",
  },
  // CPIHOSSL — Hotel & Motel CPI (hotel-specific inflation for ADR/expense escalation)
  {
    rateKey: "cpi_hotels",
    source: "fred",
    seriesId: "CPIHOSSL",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIHOSSL",
    maxStalenessHours: 168,
    displayValue: "CPI Hotels & Motels",
  },
  // SOFR90DAYAVG — 90-day average SOFR (common in hotel lending spreads)
  {
    rateKey: "sofr_90d_avg",
    source: "fred",
    seriesId: "SOFR90DAYAVG",
    sourceUrl: "https://fred.stlouisfed.org/series/SOFR90DAYAVG",
    maxStalenessHours: 24,
    displayValue: "SOFR 90-Day Avg",
  },
  // UNRATE — Unemployment Rate (macro health indicator)
  {
    rateKey: "unemployment",
    source: "fred",
    seriesId: "UNRATE",
    sourceUrl: "https://fred.stlouisfed.org/series/UNRATE",
    maxStalenessHours: 168,
    displayValue: "Unemployment Rate",
  },

  // --- Frankfurter (Currency Exchange — ECB-sourced, major currencies only) ---
  {
    rateKey: "usd_mxn",
    source: "frankfurter",
    seriesId: "MXN",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/MXN",
  },
  {
    rateKey: "usd_cop",
    source: "frankfurter",
    seriesId: "COP",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/COP",
  },
  {
    rateKey: "usd_brl",
    source: "frankfurter",
    seriesId: "BRL",
    sourceUrl: "https://frankfurter.dev",
    maxStalenessHours: 24,
    displayValue: "USD/BRL",
  },

  // --- Admin-Maintained (no auto-fetch) ---
  {
    rateKey: "hotel_lending_spread",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Hotel Lending Spread (bps)",
  },
  {
    rateKey: "hotel_cap_rate_range",
    source: "admin_manual",
    seriesId: null,
    sourceUrl: "",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Hotel Cap Rate Range",
  },

  // --- Damodaran (NYU Stern) — Admin-curated, 90-day staleness reminder ---
  // These are isManual=true (no auto-fetch API). Admin updates via Research Center.
  {
    rateKey: "crp_colombia",
    source: "damodaran",
    seriesId: "Colombia",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Colombia",
  },
  {
    rateKey: "crp_united_states",
    source: "damodaran",
    seriesId: "United States",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — United States",
  },
  {
    rateKey: "crp_mexico",
    source: "damodaran",
    seriesId: "Mexico",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Mexico",
  },
  {
    rateKey: "crp_brazil",
    source: "damodaran",
    seriesId: "Brazil",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Brazil",
  },
  {
    rateKey: "crp_chile",
    source: "damodaran",
    seriesId: "Chile",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Chile",
  },
  {
    rateKey: "crp_peru",
    source: "damodaran",
    seriesId: "Peru",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Peru",
  },
  {
    rateKey: "crp_costa_rica",
    source: "damodaran",
    seriesId: "Costa Rica",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Country Risk Premium — Costa Rica",
  },
  {
    rateKey: "erp_mature_market",
    source: "damodaran",
    seriesId: "ERP",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Equity Risk Premium (Mature Market)",
  },
  {
    rateKey: "cost_of_equity_hospitality",
    source: "damodaran",
    seriesId: "Re_hospitality",
    sourceUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html",
    maxStalenessHours: 2160, // 90 days
    displayValue: "Cost of Equity — Hospitality",
  },
];

const DAMODARAN_SEED_VALUES: Record<string, { value: number; display: string }> = {
  crp_colombia: { value: 2.85, display: "2.85%" },
  crp_united_states: { value: 0, display: "0.00%" },
  crp_mexico: { value: 2.46, display: "2.46%" },
  crp_brazil: { value: 3.24, display: "3.24%" },
  crp_chile: { value: 1.10, display: "1.10%" },
  crp_peru: { value: 2.07, display: "2.07%" },
  crp_costa_rica: { value: 3.24, display: "3.24%" },
  erp_mature_market: { value: 4.23, display: "4.23%" },
  cost_of_equity_hospitality: { value: 18, display: "18.0%" },
};

function getSeedValue(def: RateDefinition): { value: number | null; displayValue: string } {
  if (def.source === "admin_manual" && def.rateKey === "hotel_lending_spread") {
    return { value: 275, displayValue: "275 bps" };
  }
  const dam = DAMODARAN_SEED_VALUES[def.rateKey];
  if (dam) {
    return { value: dam.value, displayValue: dam.display };
  }
  return { value: null, displayValue: def.displayValue };
}

const RETIRED_RATE_KEYS = ["usd_crc"];

export async function seedMarketRates(): Promise<void> {
  for (const key of RETIRED_RATE_KEYS) {
    await db.delete(marketRates).where(eq(marketRates.rateKey, key));
  }

  for (const def of RATE_DEFINITIONS) {
    const existing = await db.select()
      .from(marketRates)
      .where(eq(marketRates.rateKey, def.rateKey))
      .limit(1);

    if (existing.length > 0) continue;

    const seedValue = getSeedValue(def);
    await db.insert(marketRates).values({
      rateKey: def.rateKey,
      value: seedValue.value,
      displayValue: seedValue.displayValue,
      source: def.source,
      sourceUrl: def.sourceUrl,
      seriesId: def.seriesId,
      isManual: def.source === "admin_manual" || def.source === "damodaran",
      maxStalenessHours: def.maxStalenessHours,
    });
  }

  logger.info(`Seeded ${RATE_DEFINITIONS.length} market rate definitions`, "seed");
}
