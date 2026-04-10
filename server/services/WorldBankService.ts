/**
 * WorldBankService — Country-level economic indicators.
 *
 * Completely free, no API key required. Provides GDP growth, inflation,
 * tourism arrivals, and unemployment by country — relevant context for
 * underwriting international hospitality properties.
 *
 * Indicators fetched:
 *   NY.GDP.MKTP.KD.ZG  — GDP growth rate (annual %)
 *   FP.CPI.TOTL.ZG     — Inflation (CPI, annual %)
 *   ST.INT.ARVL        — International tourism arrivals
 *   SL.UEM.TOTL.ZS     — Unemployment rate (% of labor force)
 *   NY.GNP.PCAP.CD     — GNI per capita (Atlas method, USD)
 *
 * ISO2 country codes for the portfolio:
 *   US, CA, FR, ES, IT, PT, MX, CO, BR, AR, PA (Panama), SV (El Salvador)
 *
 * API base: https://api.worldbank.org/v2/country/{iso2}/indicator/{id}
 * Cache TTL: 7 days — World Bank updates annually; weekly refresh is plenty.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { WorldBankCountryData, DataPoint } from "../../shared/market-intelligence";

const BASE_URL = "https://api.worldbank.org/v2/country";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MRV = 3; // most recent 3 values for trend

// Map portfolio countries to ISO2 codes
export const COUNTRY_ISO2: Record<string, string> = {
  "United States": "US",
  "Canada":        "CA",
  "France":        "FR",
  "Spain":         "ES",
  "Italy":         "IT",
  "Portugal":      "PT",
  "Mexico":        "MX",
  "Colombia":      "CO",
  "Brazil":        "BR",
  "Argentina":     "AR",
  "Panama":        "PA",
  "El Salvador":   "SV",
};

const INDICATORS = {
  gdpGrowth:           "NY.GDP.MKTP.KD.ZG",
  inflation:           "FP.CPI.TOTL.ZG",
  tourismArrivals:     "ST.INT.ARVL",
  unemployment:        "SL.UEM.TOTL.ZS",
  gniPerCapita:        "NY.GNP.PCAP.CD",
} as const;

type IndicatorKey = keyof typeof INDICATORS;

export class WorldBankService extends BaseIntegrationService {
  constructor() {
    super("WorldBank", 15_000);
  }

  isAvailable(): boolean {
    return true; // No API key required
  }

  async fetchCountryData(country: string): Promise<WorldBankCountryData | null> {
    const iso2 = COUNTRY_ISO2[country];
    if (!iso2) return null;

    const cacheKey = `worldbank:${iso2}`;
    return cache.staleWhileRevalidate<WorldBankCountryData | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(iso2, country)
    );
  }

  private async fetchFresh(iso2: string, country: string): Promise<WorldBankCountryData | null> {
    try {
      const results = await Promise.allSettled(
        Object.entries(INDICATORS).map(([key, indicatorId]) =>
          this.fetchIndicator(iso2, indicatorId).then(val => [key, val] as [IndicatorKey, DataPoint | undefined])
        )
      );

      const data: Partial<Record<IndicatorKey, DataPoint | undefined>> = {};
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const [key, val] = result.value;
          data[key] = val;
        }
      }

      return {
        country,
        iso2,
        gdpGrowth:       data.gdpGrowth,
        inflation:       data.inflation,
        tourismArrivals: data.tourismArrivals,
        unemployment:    data.unemployment,
        gniPerCapita:    data.gniPerCapita,
        fetchedAt:       new Date().toISOString(),
      };
    } catch (err: unknown) {
      this.warn(`Failed to fetch World Bank data for ${country}`, err);
      return null;
    }
  }

  private async fetchIndicator(iso2: string, indicatorId: string): Promise<DataPoint | undefined> {
    const url = `${BASE_URL}/${iso2}/indicator/${indicatorId}?format=json&mrv=${MRV}&per_page=1`;
    try {
      const response = await this.fetchWithTimeout(url);
      const json = await response.json();
      // World Bank returns [metadata, dataArray]
      const dataArray = Array.isArray(json) ? json[1] : null;
      if (!Array.isArray(dataArray) || !dataArray.length) return undefined;

      // Find most recent non-null value
      const entry = dataArray.find((d: any) => d?.value !== null && d?.value !== undefined);
      if (!entry) return undefined;

      return {
        value: parseFloat(entry.value),
        source: "World Bank",
        sourceUrl: `https://data.worldbank.org/indicator/${indicatorId}`,
        publishedAt: entry.date ? `${entry.date}-01-01` : undefined,
        fetchedAt: new Date().toISOString(),
        provenance: "verified",
        confidence: "high",
      };
    } catch {
      return undefined;
    }
  }
}
