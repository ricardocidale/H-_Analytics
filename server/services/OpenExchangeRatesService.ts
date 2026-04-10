/**
 * OpenExchangeRatesService — Live USD-based FX rates.
 *
 * Fetches exchange rates for the currencies relevant to the portfolio's
 * international properties (Colombia, Brazil, Argentina, Mexico, EU, Canada).
 *
 * Since the financial model is USD-denominated, FX rates are used for:
 *   - Research context (showing local-currency price equivalents)
 *   - Converting scraped local-currency comp data to USD
 *   - Displaying local-currency equivalents in property detail views
 *
 * Free tier: 1,000 requests/month, daily updates (sufficient for our use).
 * Env: OPEN_EXCHANGE_RATES_APP_ID
 * Docs: https://openexchangerates.org/api/
 *
 * Cache TTL: 6 hours — free tier updates once daily; 6h avoids hammering quota.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { FxRates } from "../../shared/market-intelligence";

const BASE_URL = "https://openexchangerates.org/api";
const CACHE_TTL_SECONDS = 6 * 60 * 60;

// Currencies relevant to the portfolio countries
const PORTFOLIO_SYMBOLS = ["COP", "BRL", "ARS", "MXN", "EUR", "CAD", "PAB", "GTQ"].join(",");

export class OpenExchangeRatesService extends BaseIntegrationService {
  private readonly appId: string | undefined;

  constructor() {
    super("OpenExchangeRates", 15_000);
    this.appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
  }

  isAvailable(): boolean {
    return !!this.appId;
  }

  async fetchRates(): Promise<FxRates | null> {
    if (!this.appId) return null;

    return cache.staleWhileRevalidate<FxRates | null>(
      "fx:usd-rates",
      CACHE_TTL_SECONDS,
      () => this.fetchFresh()
    );
  }

  private async fetchFresh(): Promise<FxRates | null> {
    try {
      const url = `${BASE_URL}/latest.json?app_id=${this.appId}&base=USD&symbols=${PORTFOLIO_SYMBOLS}`;
      const response = await this.fetchWithTimeout(url);
      const data = await response.json();

      if (!data?.rates) {
        this.warn("No rates in OpenExchangeRates response");
        return null;
      }

      const fetchedAt = new Date().toISOString();
      return {
        base: "USD",
        fetchedAt,
        rates: data.rates as Record<string, number>,
        // Convenience: USD equivalent of 1 local unit
        usdPer: Object.fromEntries(
          Object.entries(data.rates as Record<string, number>)
            .filter(([, rate]) => typeof rate === "number" && rate > 0)
            .map(([symbol, rate]) => [symbol, 1 / rate])
        ),
      };
    } catch (err: unknown) {
      this.warn("Failed to fetch FX rates", err);
      return null;
    }
  }

  /** Convert a USD amount to local currency. */
  toLocal(usdAmount: number, symbol: string, rates: FxRates): number | null {
    const rate = rates.rates[symbol];
    return rate ? usdAmount * rate : null;
  }

  /** Convert a local currency amount to USD. */
  toUsd(localAmount: number, symbol: string, rates: FxRates): number | null {
    const rate = rates.rates[symbol];
    return rate ? localAmount / rate : null;
  }
}
