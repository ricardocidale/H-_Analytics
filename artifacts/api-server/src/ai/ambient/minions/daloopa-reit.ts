/**
 * MinionDaloopaReit — REIT fundamentals from SEC EDGAR XBRL API.
 *
 * Previously Daloopa MCP; replaced with the SEC's free public XBRL company
 * facts API (https://data.sec.gov/api/xbrl/companyfacts/). No API key
 * required. Fetches quarterly 10-Q GAAP line items for hotel REITs and
 * computes derived metrics:
 *
 *   net_profit_margin  = NetIncomeLoss / Revenue (quarterly)
 *   return_on_equity   = (NetIncomeLoss × 4) / StockholdersEquity (annualised)
 *   debt_to_equity     = LongTermDebt / StockholdersEquity (balance sheet)
 *
 * Source field = "edgar". Fetches are sequential (EDGAR rate limit: 10 req/s).
 * Upserts last 4 quarters for each ticker into reit_benchmarks.
 *
 * CIK registry (verified 2026-05-08 via SEC EDGAR):
 *   HST  → 0001070750  (Host Hotels & Resorts, Inc.)
 *   RHP  → 0001040829  (Ryman Hospitality Properties, Inc.)
 *   PEB  → 0001474098  (Pebblebrook Hotel Trust)
 *   APLE → 0001418121  (Apple Hospitality REIT, Inc.)
 *   SHO  → 0001295810  (Sunstone Hotel Investors, Inc.)
 */
import { db } from "../../../db";
import { reitBenchmarks, type InsertReitBenchmark } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:daloopa-reit]";

const EDGAR_FETCH_TIMEOUT_MS = 20_000;
const EDGAR_BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts";
const EDGAR_USER_AGENT = "hplus-analytics contact@hplus.io";
// Annualise a single quarter (4 quarters per year)
const QUARTERS_PER_YEAR = 4;
const QUARTERS_TO_FETCH = 4;
// Delay between EDGAR requests to stay under 10 req/s
const EDGAR_REQUEST_DELAY_MS = 200;

const REIT_CIK_MAP: Record<string, string> = {
  HST:  "0001070750",
  RHP:  "0001040829",
  PEB:  "0001474098",
  APLE: "0001418121",
  SHO:  "0001295810",
};

const REIT_TICKERS = Object.keys(REIT_CIK_MAP) as Array<keyof typeof REIT_CIK_MAP>;

// Revenue can be filed under several GAAP line items depending on the filer.
// Tried in order; first one with data wins.
const REVENUE_FIELDS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
] as const;

interface EdgarEntry {
  start?: string;
  end: string;
  val: number;
  form: string;
  fy: number;
  fp: string;
}

interface EdgarFacts {
  facts: {
    "us-gaap"?: Record<string, { units?: { USD?: EdgarEntry[] } }>;
  };
}

function edgarPeriod(fy: number, fp: string): string {
  if (fp === "FY") return `${fy}-Q4`;
  return `${fy}-${fp}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function quarterlyEntries(facts: EdgarFacts, field: string): EdgarEntry[] {
  const entries = facts.facts["us-gaap"]?.[field]?.units?.USD ?? [];
  return entries
    .filter(e => e.form === "10-Q" && e.fp.startsWith("Q"))
    .sort((a, b) => b.end.localeCompare(a.end));
}

function balanceSheetEntries(facts: EdgarFacts, field: string): EdgarEntry[] {
  const entries = facts.facts["us-gaap"]?.[field]?.units?.USD ?? [];
  return entries
    .filter(e => (e.form === "10-Q" && e.fp.startsWith("Q")) || e.form === "10-K")
    .sort((a, b) => b.end.localeCompare(a.end));
}

async function fetchEdgarFacts(ticker: string, cik: string): Promise<InsertReitBenchmark[]> {
  const url = `${EDGAR_BASE_URL}/CIK${cik}.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": EDGAR_USER_AGENT },
    signal: AbortSignal.timeout(EDGAR_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const facts = (await response.json()) as EdgarFacts;

  const netIncome = quarterlyEntries(facts, "NetIncomeLoss");

  let revenue: EdgarEntry[] = [];
  for (const field of REVENUE_FIELDS) {
    revenue = quarterlyEntries(facts, field);
    if (revenue.length > 0) break;
  }

  const longTermDebt   = balanceSheetEntries(facts, "LongTermDebt");
  const equity         = balanceSheetEntries(facts, "StockholdersEquity");

  const rows: InsertReitBenchmark[] = [];
  const recentQuarters = netIncome.slice(0, QUARTERS_TO_FETCH);

  for (const niEntry of recentQuarters) {
    const period = edgarPeriod(niEntry.fy, niEntry.fp);

    // Match revenue entry by same fy+fp
    const revEntry = revenue.find(r => r.fy === niEntry.fy && r.fp === niEntry.fp);

    // Match balance sheet entries by end date (≤ end of quarter)
    const debtEntry   = longTermDebt.find(d => d.end <= niEntry.end);
    const equityEntry = equity.find(e => e.end <= niEntry.end);

    const metrics: Record<string, number | null> = {
      net_profit_margin: (revEntry && revEntry.val !== 0)
        ? niEntry.val / revEntry.val
        : null,
      return_on_equity: (equityEntry && equityEntry.val !== 0)
        ? (niEntry.val * QUARTERS_PER_YEAR) / equityEntry.val
        : null,
      debt_to_equity: (debtEntry && equityEntry && equityEntry.val !== 0)
        ? debtEntry.val / equityEntry.val
        : null,
    };

    for (const [metricKey, value] of Object.entries(metrics)) {
      if (value === null || !isFinite(value)) continue;
      rows.push({
        ticker,
        metricKey,
        value,
        period,
        source: "edgar",
        fetchedAt: new Date(),
      });
    }
  }

  return rows;
}

export async function runMinionDaloopaReit(): Promise<MinionResult> {
  const t0 = Date.now();
  let rowsUpserted = 0;
  const errors: string[] = [];

  for (const ticker of REIT_TICKERS) {
    const cik = REIT_CIK_MAP[ticker];
    try {
      const rows = await fetchEdgarFacts(ticker, cik);

      for (const row of rows) {
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
    } catch (err: unknown) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Respect EDGAR rate limit between tickers
    await sleep(EDGAR_REQUEST_DELAY_MS);
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "daloopa-reit", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
