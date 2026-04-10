/**
 * marketRates.ts — Live market rate fetching and caching engine.
 *
 * Fetches economic/financial rates from free government/institutional APIs:
 *   - FRED (Federal Reserve Economic Data): interest rates, CPI, Treasury yields
 *   - Frankfurter: currency exchange rates (ECB-sourced)
 *
 * Rates are cached in the `market_rates` table with per-rate staleness thresholds.
 * The background refresh loop (called from server/index.ts) only re-fetches stale rates.
 */

import { db } from "../db";
import { marketRates, type MarketRate } from "@shared/schema";
import { eq } from "drizzle-orm";
import { EXTERNAL_API_TIMEOUT_MS } from "../constants";
import { FRED_BASE_URL } from "../services/FREDService";
import { logger } from "../logger";

interface FredObservation {
  date: string;
  value: string;
}

/**
 * Fetch the most recent observation from a FRED series.
 * Returns null if the API key is missing or the request fails.
 */
export async function fetchFredRate(seriesId: string): Promise<{ value: number; date: string } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: "1",
    });

    const response = await fetch(`${FRED_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(`FRED fetch failed for ${seriesId}: ${response.status}`, "market-rates");
      return null;
    }

    const data = await response.json();
    const obs: FredObservation | undefined = data.observations?.[0];
    if (!obs || obs.value === ".") return null;

    return { value: parseFloat(obs.value), date: obs.date };
  } catch (error: unknown) {
    logger.warn(`FRED fetch error for ${seriesId}: ${error instanceof Error ? error.message : error}`, "market-rates");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Frankfurter (Currency Exchange)
// ---------------------------------------------------------------------------

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1/latest";

const frankfurterWarned = new Set<string>();

/**
 * Fetch exchange rate from EUR base (Frankfurter uses ECB data, EUR base).
 * We convert to USD-based rate via cross-rate.
 */
export async function fetchFrankfurterRate(targetCurrency: string): Promise<{ value: number; date: string } | null> {
  try {
    const response = await fetch(
      `${FRANKFURTER_BASE_URL}?base=USD&symbols=${targetCurrency}`,
      { signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS) },
    );

    if (!response.ok) {
      if (!frankfurterWarned.has(targetCurrency)) {
        logger.warn(`Frankfurter fetch failed for ${targetCurrency}: ${response.status} (suppressing further warnings)`, "market-rates");
        frankfurterWarned.add(targetCurrency);
      }
      return null;
    }

    frankfurterWarned.delete(targetCurrency);
    const data = await response.json();
    const rate = data.rates?.[targetCurrency];
    if (rate == null) return null;

    return { value: rate, date: data.date };
  } catch (error: unknown) {
    if (!frankfurterWarned.has(targetCurrency)) {
      logger.warn(`Frankfurter fetch error for ${targetCurrency}: ${error instanceof Error ? error.message : error}`, "market-rates");
      frankfurterWarned.add(targetCurrency);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate Storage Operations
// ---------------------------------------------------------------------------

export async function getAllMarketRates(): Promise<MarketRate[]> {
  return db.select().from(marketRates).orderBy(marketRates.rateKey);
}

export async function getMarketRate(rateKey: string): Promise<MarketRate | undefined> {
  const [row] = await db.select().from(marketRates).where(eq(marketRates.rateKey, rateKey)).limit(1);
  return row;
}

export async function upsertMarketRate(data: {
  rateKey: string;
  value: number | null;
  displayValue: string | null;
  source: string;
  sourceUrl?: string | null;
  seriesId?: string | null;
  publishedAt?: Date | null;
  fetchedAt?: Date | null;
  isManual?: boolean;
  manualNote?: string | null;
  maxStalenessHours?: number;
}): Promise<void> {
  const existing = await getMarketRate(data.rateKey);
  if (existing) {
    await db.update(marketRates)
      .set({
        value: data.value,
        displayValue: data.displayValue,
        source: data.source,
        sourceUrl: data.sourceUrl ?? existing.sourceUrl,
        seriesId: data.seriesId ?? existing.seriesId,
        publishedAt: data.publishedAt ?? existing.publishedAt,
        fetchedAt: data.fetchedAt ?? new Date(),
        isManual: data.isManual ?? existing.isManual,
        manualNote: data.manualNote ?? existing.manualNote,
        maxStalenessHours: data.maxStalenessHours ?? existing.maxStalenessHours,
        updatedAt: new Date(),
      })
      .where(eq(marketRates.rateKey, data.rateKey));
  } else {
    await db.insert(marketRates).values({
      rateKey: data.rateKey,
      value: data.value,
      displayValue: data.displayValue,
      source: data.source,
      sourceUrl: data.sourceUrl,
      seriesId: data.seriesId,
      publishedAt: data.publishedAt,
      fetchedAt: data.fetchedAt ?? new Date(),
      isManual: data.isManual ?? false,
      manualNote: data.manualNote,
      maxStalenessHours: data.maxStalenessHours ?? 24,
    });
  }
}

// ---------------------------------------------------------------------------
// Staleness Check & Refresh
// ---------------------------------------------------------------------------

function isStale(rate: MarketRate): boolean {
  if (!rate.fetchedAt) return true;
  const ageMs = Date.now() - new Date(rate.fetchedAt).getTime();
  const thresholdMs = (rate.maxStalenessHours ?? 24) * 60 * 60 * 1000;
  return ageMs > thresholdMs;
}

function formatRate(value: number, source: string): string {
  if (source === "frankfurter") {
    return value.toFixed(2);
  }
  // FRED rates are typically percentages (e.g., 5.33 for 5.33%)
  return `${value.toFixed(2)}%`;
}

async function refreshSingleRate(rate: MarketRate): Promise<boolean> {
  // Skip admin-maintained rates
  if (rate.isManual) return false;

  let result: { value: number; date: string } | null = null;

  if (rate.source === "fred" && rate.seriesId) {
    result = await fetchFredRate(rate.seriesId);
  } else if (rate.source === "frankfurter" && rate.seriesId) {
    result = await fetchFrankfurterRate(rate.seriesId);
  }

  if (!result) return false;

  await upsertMarketRate({
    rateKey: rate.rateKey,
    value: result.value,
    displayValue: formatRate(result.value, rate.source),
    source: rate.source,
    publishedAt: new Date(result.date),
    fetchedAt: new Date(),
  });

  return true;
}

/**
 * Check all rates for staleness and refresh any that have exceeded their threshold.
 * Called by the periodic interval in server/index.ts.
 */
export async function refreshAllStaleRates(): Promise<number> {
  const allRates = await getAllMarketRates();
  let refreshed = 0;

  for (const rate of allRates) {
    if (isStale(rate)) {
      const ok = await refreshSingleRate(rate);
      if (ok) refreshed++;
    }
  }

  return refreshed;
}

/**
 * Force refresh a specific rate regardless of staleness.
 */
export async function forceRefreshRate(rateKey: string): Promise<boolean> {
  const rate = await getMarketRate(rateKey);
  if (!rate) return false;
  return refreshSingleRate(rate);
}

/**
 * Get a rate value, refreshing first if stale. Returns the rate or null.
 */
export async function getRate(rateKey: string): Promise<MarketRate | null> {
  const rate = await getMarketRate(rateKey);
  if (!rate) return null;

  if (isStale(rate) && !rate.isManual) {
    await refreshSingleRate(rate);
    return (await getMarketRate(rateKey)) ?? null;
  }

  return rate;
}

/**
 * Compute a derived rate: base rate + spread in basis points.
 * Example: hotel lending = SOFR + 275bps
 */
export async function deriveRate(baseKey: string, spreadBps: number): Promise<number | null> {
  const base = await getRate(baseKey);
  if (!base?.value) return null;
  return base.value + spreadBps / 100;
}
