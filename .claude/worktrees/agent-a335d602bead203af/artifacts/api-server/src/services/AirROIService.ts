/**
 * AirROIService — STR market benchmarks via AirROI API.
 *
 * AirROI provides STR market data (ADR, occupancy, RevPAR) for 190+ countries
 * at $0.01/call with no monthly commitment. Covers all portfolio markets
 * including Eden/Powder Mountain UT, Medellín CO, Nashville TN, Miami FL,
 * Sedona AZ, Aspen CO, Park City UT, and Cartagena CO.
 *
 * Auth: X-API-KEY header (key from AIRROI_API_KEY env var).
 * Base URL: https://api.airroi.com
 * Primary endpoint: POST /markets/all-metrics (one call = full picture).
 * Cost: $0.01/call × 8 markets = $0.08 per Admin quarterly refresh.
 *
 * Register key: airroi.com/api → sign up → add $10 credit → key in dashboard.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { HospitalityBenchmarks, DataPoint } from "@shared/market-intelligence";

const BASE_URL = "https://api.airroi.com";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — refresh quarterly via Admin button

// ── Market definitions ────────────────────────────────────────────────────────
// Maps our internal market names to AirROI's locality/region/country triplet.
// Extend as the portfolio grows.

interface AirROIMarket {
  country: string;   // ISO2 uppercase
  region: string;    // State or department name
  locality: string;  // City / municipality
}

export const AIRROI_MARKETS: Record<string, AirROIMarket> = {
  "Eden UT":        { country: "US", region: "Utah",       locality: "Eden" },
  "Park City UT":   { country: "US", region: "Utah",       locality: "Park City" },
  "Salt Lake UT":   { country: "US", region: "Utah",       locality: "Salt Lake City" },
  "Nashville TN":   { country: "US", region: "Tennessee",  locality: "Nashville" },
  "Miami FL":       { country: "US", region: "Florida",    locality: "Miami Beach" },
  "Sedona AZ":      { country: "US", region: "Arizona",    locality: "Sedona" },
  "Aspen CO":       { country: "US", region: "Colorado",   locality: "Aspen" },
  "Medellín CO":    { country: "CO", region: "Antioquia",  locality: "Medellín" },
  "Cartagena CO":   { country: "CO", region: "Bolívar",    locality: "Cartagena" },
};

// ── Response shapes ───────────────────────────────────────────────────────────
// POST /markets/summary — all key metrics in one call (preferred, $0.01)
// POST /markets/metrics/occupancy | /adr | /revpar — individual metrics ($0.01 each)
// Single-value responses: { "metric_name": number, "timestamp": string, "market": {...} }

interface AirROIMetricResponse {
  // Summary response carries all metrics; individual endpoints carry one.
  occupancy?: number;
  adr?: number;
  revpar?: number;
  revenue?: number;
  active_listings?: number;
  // Timestamp of data
  timestamp?: string;
  market?: { country?: string; region?: string; locality?: string };
  error?: string;
}

// ── Parsed result returned to callers ────────────────────────────────────────

export interface AirROIMarketMetrics {
  marketKey: string;
  adrUsd: number;
  occupancyRate: number;
  revparUsd: number;
  annualRevenueUsd: number | null;
  activeListings: number | null;
  asOf: string;
  source: "airroi";
}

export class AirROIService extends BaseIntegrationService {
  private apiKey: string | undefined;

  constructor() {
    super("AirROI", 20_000);
    this.apiKey = process.env.AIRROI_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch TTM metrics for a named market (e.g. "Eden UT", "Medellín CO").
   * Returns null when the market is unknown or the call fails.
   * Cached for 7 days — refresh via Admin Sources button.
   */
  async fetchMarketMetrics(marketKey: string): Promise<AirROIMarketMetrics | null> {
    if (!this.apiKey) return null;

    const market = AIRROI_MARKETS[marketKey];
    if (!market) {
      this.warn(`Unknown market key: "${marketKey}". Add it to AIRROI_MARKETS.`);
      return null;
    }

    const cacheKey = `airroi:metrics:${marketKey.toLowerCase().replace(/\s+/g, "_")}`;
    return cache.staleWhileRevalidate<AirROIMarketMetrics | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(marketKey, market),
    );
  }

  /**
   * Fetch metrics for all defined markets in parallel.
   * Safe to call from the Admin refresh handler — 8 markets × $0.01 = $0.08.
   */
  async fetchAllMarkets(): Promise<AirROIMarketMetrics[]> {
    if (!this.apiKey) return [];

    const results = await Promise.allSettled(
      Object.keys(AIRROI_MARKETS).map((key) => this.fetchFresh(key, AIRROI_MARKETS[key])),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<AirROIMarketMetrics | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v): v is AirROIMarketMetrics => v !== null);
  }

  /**
   * Map AirROI metrics to the HospitalityBenchmarks shape used by the
   * research pipeline (data-routing layer). Called from HospitalityBenchmarkService.
   */
  async fetchBenchmarks(marketKey: string): Promise<HospitalityBenchmarks | null> {
    const metrics = await this.fetchMarketMetrics(marketKey);
    if (!metrics) return null;

    const now = new Date().toISOString();
    const makePoint = (value: number): DataPoint => ({
      value,
      source: "AirROI STR Market Data",
      sourceUrl: "https://www.airroi.com",
      fetchedAt: now,
      provenance: "cited",
      confidence: "medium",
    });

    return {
      submarket: marketKey,
      adr:       makePoint(metrics.adrUsd),
      occupancy: makePoint(metrics.occupancyRate),
      revpar:    makePoint(metrics.revparUsd),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchFresh(
    marketKey: string,
    market: AirROIMarket,
  ): Promise<AirROIMarketMetrics | null> {
    try {
      const body = JSON.stringify({
        market: { country: market.country, region: market.region, locality: market.locality },
        currency:   "usd",
        num_months: 12,
      });
      const headers = {
        "X-API-KEY":    this.apiKey!,
        "Content-Type": "application/json",
        Accept:         "application/json",
      };

      // Try /markets/summary first (all metrics in one call = $0.01).
      // If the summary doesn't carry individual metrics, fall back to
      // three parallel calls to the individual endpoints.
      const summaryRes = await this.fetchWithTimeout(`${BASE_URL}/markets/summary`, {
        method: "POST", headers, body,
      });
      const summary = (await summaryRes.json()) as AirROIMetricResponse;

      if (summary.error) {
        this.warn(`AirROI error for ${marketKey}: ${summary.error}`);
        return null;
      }

      // If summary carries the key metrics, use them directly.
      let adr       = summary.adr       ?? null;
      let occupancy = summary.occupancy  ?? null;
      let revpar    = summary.revpar     ?? null;

      // Fall back to individual metric endpoints when summary is sparse.
      if (adr == null || occupancy == null) {
        const [adrRes, occRes] = await Promise.all([
          this.fetchWithTimeout(`${BASE_URL}/markets/metrics/adr`,       { method: "POST", headers, body }),
          this.fetchWithTimeout(`${BASE_URL}/markets/metrics/occupancy`,  { method: "POST", headers, body }),
        ]);
        const [adrData, occData] = await Promise.all([
          adrRes.json() as Promise<AirROIMetricResponse>,
          occRes.json() as Promise<AirROIMetricResponse>,
        ]);
        adr       = adrData.adr       ?? null;
        occupancy = occData.occupancy  ?? null;

        if (revpar == null) {
          const revparRes  = await this.fetchWithTimeout(`${BASE_URL}/markets/metrics/revpar`, { method: "POST", headers, body });
          const revparData = (await revparRes.json()) as AirROIMetricResponse;
          revpar = revparData.revpar ?? null;
        }
      }

      if (adr == null || occupancy == null) {
        this.warn(`AirROI returned no ADR or occupancy for ${marketKey}`);
        return null;
      }

      return {
        marketKey,
        adrUsd:           Math.round(adr * 100) / 100,
        occupancyRate:    Math.round(occupancy * 10000) / 10000,
        revparUsd:        revpar != null
          ? Math.round(revpar * 100) / 100
          : Math.round(adr * occupancy * 100) / 100,
        annualRevenueUsd: summary.revenue ?? null,
        activeListings:   summary.active_listings ?? null,
        asOf:             summary.timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        source:           "airroi",
      };
    } catch (err: unknown) {
      this.warn(`AirROI fetch failed for ${marketKey}`, err);
      return null;
    }
  }
}
