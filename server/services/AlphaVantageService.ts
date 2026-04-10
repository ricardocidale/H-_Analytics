/**
 * AlphaVantageService — Financial market data via Alpha Vantage (RapidAPI).
 *
 * Provides hospitality REIT stock performance and economic series as market
 * sentiment signals for the research AI. REIT pricing reflects forward-looking
 * investor expectations about hotel sector health — a leading indicator the
 * research AI can use alongside trailing ADR/occupancy benchmarks.
 *
 * Host: alpha-vantage.p.rapidapi.com (RAPIDAPI_KEY_3)
 * Docs: https://www.alphavantage.co/documentation/
 *
 * Data used:
 *   TIME_SERIES_WEEKLY  — weekly close for hospitality REITs (MAR, HLT, IHG, H, RHP)
 *   REAL_GDP            — quarterly US GDP growth (cross-check macro context)
 *   INFLATION           — monthly US CPI (cross-check FRED)
 *
 * Cache TTL:
 *   REIT prices:     4 hours (markets move during the day)
 *   Economic series: 24 hours (published monthly/quarterly)
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import { rapidApiHeaders, isRapidApiAvailable } from "./rapidApiKeyRouter";

const HOST     = "alpha-vantage.p.rapidapi.com";
const BASE_URL = `https://${HOST}/query`;

const REIT_TTL = 4 * 60 * 60;
const ECON_TTL = 24 * 60 * 60;

// Major hospitality REITs as market proxies
const HOSPITALITY_REITS = ["MAR", "HLT", "IHG", "H", "RHP"] as const;

export interface ReitSnapshot {
  symbol: string;
  name: string;
  latestClose: number;
  weekAgo: number;
  monthAgo: number;
  weekChangePct: number;
  monthChangePct: number;
  fetchedAt: string;
}

export interface AlphaVantageData {
  reits: ReitSnapshot[];
  gdpGrowthQoQ?: number;   // US Real GDP latest quarterly % change
  inflationYoY?: number;   // US CPI latest annual %
  fetchedAt: string;
}

export class AlphaVantageService extends BaseIntegrationService {
  constructor() {
    super("AlphaVantage", 12_000);
  }

  isAvailable(): boolean {
    return isRapidApiAvailable("tertiary");
  }

  async fetchMarketData(): Promise<AlphaVantageData | null> {
    if (!this.isAvailable()) return null;

    return cache.staleWhileRevalidate<AlphaVantageData | null>(
      "alpha-vantage:market-data",
      REIT_TTL,
      () => this.fetchFresh()
    );
  }

  private async fetchFresh(): Promise<AlphaVantageData | null> {
    const [reitResults, gdpResult, inflationResult] = await Promise.allSettled([
      this.fetchReitSnapshots(),
      this.fetchGDP(),
      this.fetchInflation(),
    ]);

    const reits = reitResults.status === "fulfilled" ? reitResults.value : [];
    if (!reits.length) return null;

    return {
      reits,
      gdpGrowthQoQ: gdpResult.status === "fulfilled" ? gdpResult.value ?? undefined : undefined,
      inflationYoY:  inflationResult.status === "fulfilled" ? inflationResult.value ?? undefined : undefined,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchReitSnapshots(): Promise<ReitSnapshot[]> {
    const results = await Promise.allSettled(
      HOSPITALITY_REITS.map(sym => this.fetchWeeklySeries(sym))
    );

    return results
      .map((r, i) => r.status === "fulfilled" && r.value ? r.value : null)
      .filter((r): r is ReitSnapshot => r !== null);
  }

  private async fetchWeeklySeries(symbol: string): Promise<ReitSnapshot | null> {
    const cacheKey = `alpha-vantage:weekly:${symbol}`;
    return cache.staleWhileRevalidate<ReitSnapshot | null>(cacheKey, REIT_TTL, async () => {
      try {
        const url = `${BASE_URL}?` + new URLSearchParams({
          function: "TIME_SERIES_WEEKLY",
          symbol,
          datatype: "json",
        });

        const res  = await this.fetchWithTimeout(url, { headers: rapidApiHeaders(HOST, "tertiary") });
        const data = await res.json();

        const series: Record<string, Record<string, string>> = data?.["Weekly Time Series"] ?? {};
        const dates = Object.keys(series).sort().reverse();

        if (dates.length < 5) return null;

        const close   = (d: string) => parseFloat(series[d]?.["4. close"] ?? "0");
        const latest  = close(dates[0]);
        const weekAgo = close(dates[1]);
        const monthAgo = close(dates[4]);

        if (!latest) return null;

        const names: Record<string, string> = {
          MAR: "Marriott International",
          HLT: "Hilton Worldwide",
          IHG: "IHG Hotels & Resorts",
          H:   "Hyatt Hotels",
          RHP: "Ryman Hospitality",
        };

        return {
          symbol,
          name:           names[symbol] ?? symbol,
          latestClose:    latest,
          weekAgo,
          monthAgo,
          weekChangePct:  weekAgo  ? ((latest - weekAgo)  / weekAgo)  * 100 : 0,
          monthChangePct: monthAgo ? ((latest - monthAgo) / monthAgo) * 100 : 0,
          fetchedAt: new Date().toISOString(),
        };
      } catch (err: unknown) {
        this.warn(`Failed to fetch ${symbol} weekly series`, err);
        return null;
      }
    });
  }

  private async fetchGDP(): Promise<number | null> {
    return cache.staleWhileRevalidate<number | null>("alpha-vantage:gdp", ECON_TTL, async () => {
      try {
        const url = `${BASE_URL}?` + new URLSearchParams({ function: "REAL_GDP", interval: "quarterly", datatype: "json" });
        const res  = await this.fetchWithTimeout(url, { headers: rapidApiHeaders(HOST, "tertiary") });
        const data = await res.json();

        const series: { date: string; value: string }[] = data?.data ?? [];
        if (series.length < 2) return null;

        const latest = parseFloat(series[0].value);
        const prior  = parseFloat(series[1].value);
        if (!prior) return null;

        return ((latest - prior) / prior) * 100;
      } catch {
        return null;
      }
    });
  }

  private async fetchInflation(): Promise<number | null> {
    return cache.staleWhileRevalidate<number | null>("alpha-vantage:inflation", ECON_TTL, async () => {
      try {
        const url = `${BASE_URL}?` + new URLSearchParams({ function: "INFLATION", datatype: "json" });
        const res  = await this.fetchWithTimeout(url, { headers: rapidApiHeaders(HOST, "tertiary") });
        const data = await res.json();

        const series: { date: string; value: string }[] = data?.data ?? [];
        if (!series.length) return null;

        return parseFloat(series[0].value) || null;
      } catch {
        return null;
      }
    });
  }
}
