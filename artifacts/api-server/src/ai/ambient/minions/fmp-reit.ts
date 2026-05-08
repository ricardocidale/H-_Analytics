/**
 * MinionFmpReit — REIT fundamentals from Financial Modeling Prep.
 *
 * Fetches quarterly key-metrics for hotel REITs (HST, RHP, PEB, APLE, SHO)
 * from FMP API v3 and upserts into reit_benchmarks.
 *
 * FMP free tier: 250 req/day. Each run consumes ~10 requests (5 tickers × 2
 * endpoints). daily_request_budget = 200 on the admin_resources row enforces
 * the cap upstream before dispatch.
 */
import { db } from "../../../db";
import { reitBenchmarks, type InsertReitBenchmark } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:fmp-reit]";

const FMP_REIT_FETCH_TIMEOUT_MS = 15_000;
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";
// 3 months per quarter (calendar constant: 12 months / 4 quarters)
const MONTHS_PER_QUARTER = 3;
const FMP_QUARTERS_TO_FETCH = 4;

const REIT_TICKERS = ["HST", "RHP", "PEB", "APLE", "SHO"] as const;

interface FmpKeyMetric {
  date?: string;
  capexToOperatingCashFlow?: number;
  debtToEquity?: number;
  currentRatio?: number;
  priceToOperatingCashFlowsRatio?: number;
  netProfitMargin?: number;
  returnOnEquity?: number;
  dividendYield?: number;
  enterpriseValueOverEBITDA?: number;
}

function periodFromDate(dateStr: string): string {
  // FMP dates are "YYYY-MM-DD" quarterly; convert to "YYYY-Q#"
  const d = new Date(dateStr);
  const quarter = Math.ceil((d.getMonth() + 1) / MONTHS_PER_QUARTER);
  return `${d.getFullYear()}-Q${quarter}`;
}

async function fetchFmpMetrics(ticker: string, apiKey: string): Promise<InsertReitBenchmark[]> {
  const url = `${FMP_BASE_URL}/key-metrics/${ticker}?period=quarter&limit=${FMP_QUARTERS_TO_FETCH}&apikey=${apiKey}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FMP_REIT_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as FmpKeyMetric[];
  if (!Array.isArray(data) || data.length === 0) return [];

  const rows: InsertReitBenchmark[] = [];
  for (const q of data) {
    if (!q.date) continue;
    const period = periodFromDate(q.date);

    const metrics: Record<string, number | undefined> = {
      debt_to_equity: q.debtToEquity,
      net_profit_margin: q.netProfitMargin,
      return_on_equity: q.returnOnEquity,
      dividend_yield: q.dividendYield,
      ev_over_ebitda: q.enterpriseValueOverEBITDA,
    };

    for (const [metricKey, value] of Object.entries(metrics)) {
      if (value === undefined || value === null) continue;
      rows.push({ ticker, metricKey, value, period, source: "fmp", fetchedAt: new Date() });
    }
  }
  return rows;
}

export async function runMinionFmpReit(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.FMP_ACCESS_TOKEN;
  if (!apiKey) {
    logger.warn(`${TAG} FMP_ACCESS_TOKEN not set — skipping`);
    return { source: "fmp-reit", rowsUpserted: 0, rowsFailed: 0, errors: ["FMP_ACCESS_TOKEN not set — skipping"], durationMs: Date.now() - t0 };
  }

  const results = await Promise.allSettled(
    REIT_TICKERS.map(ticker => fetchFmpMetrics(ticker, apiKey)),
  );

  let rowsUpserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const ticker = REIT_TICKERS[i];
    const result = results[i];

    if (result.status === "rejected") {
      errors.push(`${ticker}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
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
        errors.push(`${ticker} ${row.metricKey} ${row.period}: ${err instanceof Error ? err.message : String(err)}`);
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
