/**
 * MinionFmpReit — REIT fundamentals via RapidAPI Yahoo Finance.
 *
 * Previously Financial Modeling Prep; replaced with RapidAPI Yahoo Finance
 * (apidojo-yahoo-finance-v1.p.rapidapi.com). Fetches TTM key metrics for
 * hotel REITs (HST, RHP, PEB, APLE, SHO) and upserts into reit_benchmarks.
 * Source field = "rapidapi-yf". Period = current calendar quarter (TTM
 * snapshot — Yahoo Finance does not expose per-quarter history on this
 * endpoint).
 *
 * Requires RAPIDAPI_KEY with a subscription to "Yahoo Finance" on rapidapi.com
 * (free tier: https://rapidapi.com/apidojo/api/yahoo-finance1).
 * Gracefully skips (not an error) when the key is absent or the API returns
 * 403 (not subscribed).
 */
import { db } from "../../../db";
import { reitBenchmarks, type InsertReitBenchmark } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:fmp-reit]";

const YF_FETCH_TIMEOUT_MS = 15_000;
const YF_HOST = "apidojo-yahoo-finance-v1.p.rapidapi.com";
const YF_BASE_URL = `https://${YF_HOST}`;
// 3 months per quarter (12 months / 4 quarters)
const MONTHS_PER_QUARTER = 3;

const REIT_TICKERS = ["HST", "RHP", "PEB", "APLE", "SHO"] as const;

interface YfRawValue {
  raw?: number;
}

interface YfStatistics {
  defaultKeyStatistics?: {
    debtToEquity?: YfRawValue;
    enterpriseToEbitda?: YfRawValue;
  };
  financialData?: {
    profitMargins?: YfRawValue;
    returnOnEquity?: YfRawValue;
  };
  summaryDetail?: {
    trailingAnnualDividendYield?: YfRawValue;
  };
}

function currentQuarterPeriod(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / MONTHS_PER_QUARTER);
  return `${now.getUTCFullYear()}-Q${q}`;
}

async function fetchYfStatistics(ticker: string, apiKey: string): Promise<InsertReitBenchmark[]> {
  const url = `${YF_BASE_URL}/stock/v2/get-statistics?symbol=${encodeURIComponent(ticker)}&region=US`;
  const response = await fetch(url, {
    headers: {
      "x-rapidapi-host": YF_HOST,
      "x-rapidapi-key": apiKey,
    },
    signal: AbortSignal.timeout(YF_FETCH_TIMEOUT_MS),
  });

  if (response.status === 403) {
    throw new Error("NOT_SUBSCRIBED");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as YfStatistics;
  const period = currentQuarterPeriod();

  const raw: Record<string, number | undefined> = {
    debt_to_equity:    data.defaultKeyStatistics?.debtToEquity?.raw,
    ev_over_ebitda:    data.defaultKeyStatistics?.enterpriseToEbitda?.raw,
    net_profit_margin: data.financialData?.profitMargins?.raw,
    return_on_equity:  data.financialData?.returnOnEquity?.raw,
    dividend_yield:    data.summaryDetail?.trailingAnnualDividendYield?.raw,
  };

  return Object.entries(raw)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([metricKey, value]) => ({
      ticker,
      metricKey,
      value: value as number,
      period,
      source: "rapidapi-yf",
      fetchedAt: new Date(),
    }));
}

export async function runMinionFmpReit(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    logger.warn(`${TAG} RAPIDAPI_KEY not set — skipping`);
    return { source: "fmp-reit", rowsUpserted: 0, rowsFailed: 0, errors: ["RAPIDAPI_KEY not set — skipping"], durationMs: Date.now() - t0 };
  }

  const results = await Promise.allSettled(
    REIT_TICKERS.map(ticker => fetchYfStatistics(ticker, apiKey)),
  );

  let rowsUpserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const ticker = REIT_TICKERS[i];
    const result = results[i];

    if (result.status === "rejected") {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      if (msg === "NOT_SUBSCRIBED") {
        logger.info(`${TAG} RapidAPI Yahoo Finance not subscribed — skipping (subscribe at rapidapi.com/apidojo/api/yahoo-finance1)`);
        return { source: "fmp-reit", rowsUpserted: 0, rowsFailed: 0, errors: [], durationMs: Date.now() - t0 };
      }
      errors.push(`${ticker}: ${msg}`);
      continue;
    }

    for (const row of result.value) {
      try {
        await db.insert(reitBenchmarks)
          .values(row)
          .onConflictDoUpdate({
            target: [reitBenchmarks.ticker, reitBenchmarks.metricKey, reitBenchmarks.period],
            set: { value: sql`excluded.value`, source: sql`excluded.source`, fetchedAt: sql`excluded.fetched_at` },
          });
        rowsUpserted++;
      } catch (err: unknown) {
        errors.push(`${ticker} ${row.metricKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "fmp-reit", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
