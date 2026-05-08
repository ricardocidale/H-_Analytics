/**
 * pietro-resources-001 — Seed 7 Pietro data-infrastructure admin_resource rows.
 *
 * Seeds MCPs and API sources managed by Pietro into admin_resources. Idempotent:
 * ON CONFLICT (kind, slug) DO NOTHING. Safe to re-run on every boot.
 *
 * Note: new resource kinds (mcp) are already supported after admin-resources-006
 * adds the daily_request_budget column and the TypeScript enum is updated.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] pietro-resources-001";

interface PietroSeedRow {
  kind: string;
  slug: string;
  displayName: string;
  description: string;
  config: Record<string, unknown>;
  secretRef: string | null;
  dailyRequestBudget: number | null;
}

const PIETRO_SEED_ROWS: PietroSeedRow[] = [
  {
    kind: "source",
    slug: "fred-extended",
    displayName: "FRED — Extended Hospitality Series",
    description: "Additional FRED series for hospitality analytics: hospitality CPI (CUUR0000SEHB), leisure & hospitality employment (CES7000000001), and housing starts proxy. Extends the existing market_benchmarks table.",
    config: { baseUrl: "https://api.stlouisfed.org/fred/series/observations" },
    secretRef: "FRED_API_KEY",
    dailyRequestBudget: null,
  },
  {
    kind: "mcp",
    slug: "fmp-reit",
    displayName: "Financial Modeling Prep — REIT Fundamentals",
    description: "Quarterly income statement and KPI data for hotel REITs (HST, RHP, PEB, APLE, SHO) from Financial Modeling Prep API v3. Populates reit_benchmarks table weekly.",
    config: { baseUrl: "https://financialmodelingprep.com/api/v3" },
    secretRef: "FMP_ACCESS_TOKEN",
    // FMP free tier: 250 requests/day. 5 tickers × ~4 endpoints = ~20 req/run.
    dailyRequestBudget: 200,
  },
  {
    kind: "mcp",
    slug: "daloopa-reit",
    displayName: "Daloopa — REIT Fundamentals",
    description: "Higher-fidelity REIT fundamentals from Daloopa via MCP (SEC filings, earnings transcripts). Same tickers as FMP; falls back to FMP if DALOOPA_API_KEY is absent.",
    config: { baseUrl: "https://mcp.daloopa.com/server/mcp" },
    secretRef: "DALOOPA_API_KEY",
    dailyRequestBudget: 100,
  },
  {
    kind: "mcp",
    slug: "booking-rates",
    displayName: "Booking.com — Competitor Rates",
    description: "Weekly competitor hotel rate snapshots for key US markets (Miami, New York, Denver, Los Angeles, Chicago) via RapidAPI Booking.com scraper. Populates competitor_rates table.",
    config: { baseUrl: "https://booking-com15.p.rapidapi.com" },
    secretRef: "RAPIDAPI_KEY",
    dailyRequestBudget: 50,
  },
  {
    kind: "mcp",
    slug: "expedia-rates",
    displayName: "Expedia — Competitor Rates",
    description: "Weekly competitor hotel rate snapshots for key US markets via Apify Expedia scraper. Populates competitor_rates table alongside Booking.com data.",
    config: { baseUrl: "https://api.apify.com/v2/acts/crawlerbros~expedia-hotels-scraper/runs" },
    secretRef: "APIFY_API_TOKEN",
    dailyRequestBudget: 50,
  },
  {
    kind: "mcp",
    slug: "exa-search",
    displayName: "Exa — Neural Web Search",
    description: "Exa neural web search for grounded market intelligence, property research, and competitive analysis. Will replace Perplexity as the web-grounded research provider in Rebecca.",
    config: { baseUrl: "https://api.exa.ai" },
    secretRef: "EXA_API_KEY",
    dailyRequestBudget: null,
  },
  {
    kind: "mcp",
    slug: "context7",
    displayName: "Context7 — Library Documentation",
    description: "Context7 library documentation lookup. Coding-session only — no production data fetched. daily_request_budget = 0 prevents Pietro from dispatching a minion for this source.",
    config: { baseUrl: "https://context7.com" },
    secretRef: null,
    // Prevents Pietro from dispatching any minion for this coding-session-only source.
    dailyRequestBudget: 0,
  },
];

export async function runPietroResources001(): Promise<void> {
  let inserted = 0;
  for (const row of PIETRO_SEED_ROWS) {
    const result = await db.execute(sql`
      INSERT INTO admin_resources
        (kind, slug, display_name, description, config, secret_ref, daily_request_budget)
      VALUES (
        ${row.kind},
        ${row.slug},
        ${row.displayName},
        ${row.description},
        ${JSON.stringify(row.config)}::jsonb,
        ${row.secretRef},
        ${row.dailyRequestBudget}
      )
      ON CONFLICT (kind, slug) DO NOTHING
      RETURNING id
    `);
    if (Array.isArray(result.rows) && result.rows.length > 0) inserted++;
  }
  logger.info(
    `${TAG} Pietro resource rows: ${inserted} seeded (${PIETRO_SEED_ROWS.length - inserted} already existed)`,
  );
}
