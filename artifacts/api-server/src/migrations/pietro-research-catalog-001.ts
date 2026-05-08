/**
 * pietro-research-catalog-001 — Seed research URL and prompt template rows.
 *
 * Pre-populates admin_resources with curated hospitality research catalog
 * entries (search_url + research_prompt kinds). These give Rebecca and research
 * specialists a starting point without open-ended web searches.
 *
 * Idempotent: ON CONFLICT (kind, slug) DO NOTHING. Safe to re-run on every boot.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { type InsertAdminResource } from "@workspace/db";

const TAG = "[migration] pietro-research-catalog-001";

const CATALOG_ROWS: InsertAdminResource[] = [
  // ── Research URLs ─────────────────────────────────────────────────────────
  {
    kind: "search_url",
    slug: "str-national-trends",
    displayName: "STR National Hotel Trends",
    description: "STR national hotel performance data — occupancy, ADR, RevPAR trends by chain scale and market tier.",
    config: { baseUrl: "https://str.com/data-insights/hotel-performance" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "cbre-hotel-cap-rates",
    displayName: "CBRE Hotel Cap Rate Survey",
    description: "CBRE semi-annual hotel cap rate survey by market and quality tier. Primary benchmark for exit cap rate assumptions.",
    config: { baseUrl: "https://www.cbre.com/insights/reports/cap-rate-survey" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "hvs-hotel-surveys",
    displayName: "HVS Hotel Industry Surveys",
    description: "HVS annual surveys covering management fees, franchise fees, and hotel development costs.",
    config: { baseUrl: "https://hvs.com/articles" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "sec-edgar-hotel-reits",
    displayName: "SEC EDGAR — Hotel REIT Filings",
    description: "SEC EDGAR filter for hotel REIT filings (10-K, 10-Q, 8-K) for HST, RHP, PEB, APLE, SHO.",
    config: { baseUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K&dateb=&owner=include&count=40&search_text=" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "fred-hospitality-employment",
    displayName: "FRED — Hospitality Employment",
    description: "FRED series for leisure & hospitality employment (CES7000000001) and hospitality CPI (CUUR0000SEHB).",
    config: { baseUrl: "https://fred.stlouisfed.org/series/CES7000000001" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "bls-accommodation-sector",
    displayName: "BLS — Accommodation Sector",
    description: "Bureau of Labor Statistics accommodation sector employment and wage data.",
    config: { baseUrl: "https://www.bls.gov/iag/tgs/iag721.htm" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "search_url",
    slug: "cbre-hotel-research-hub",
    displayName: "CBRE Hotel Research Hub",
    description: "CBRE hotel research publications — market outlooks, investment volumes, cap rate trends.",
    config: { baseUrl: "https://www.cbre.com/insights/topics/hotels" },
    secretRef: null,
    dailyRequestBudget: null,
  },
  // ── Research prompt templates ─────────────────────────────────────────────
  {
    kind: "research_prompt",
    slug: "market-rate-analysis",
    displayName: "Market Rate Analysis Template",
    description: "Prompt template for cap rate benchmarking by market. Structures a comparative analysis of local hotel cap rates against national benchmarks.",
    config: {
      template: `You are a hospitality investment analyst. Conduct a cap rate benchmarking analysis for the following market:

Market: {market}
Property Type: {property_type}
Quality Tier: {quality_tier}

Using available benchmark data (CBRE hotel cap rate survey, REIT comparable transactions, STR market data), provide:
1. Current cap rate range for this market/tier combination
2. Trend direction (compressing/expanding) over the past 12 months
3. Comparison to national averages by chain scale
4. Key drivers affecting local cap rates (supply pipeline, demand drivers, financing conditions)
5. Recommended exit cap rate assumption for a 10-year hold period

Cite specific data sources and dates for all benchmark figures.`,
    },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "research_prompt",
    slug: "reit-comp-analysis",
    displayName: "REIT Comp Analysis Template",
    description: "Prompt template for comparing a target property to public hotel REIT comps (HST, RHP, PEB, APLE, SHO).",
    config: {
      template: `You are a hospitality REIT analyst. Compare the following property to public hotel REIT benchmarks:

Property: {property_name}
Market: {market}
Property Type: {property_type}
Key Metrics: RevPAR {revpar}, NOI Margin {noi_margin}, Cap Rate {cap_rate}

Using available REIT benchmark data, provide:
1. Most comparable REIT(s) by geography, property type, and quality tier
2. Benchmarked NOI margin vs. REIT peers
3. Implied valuation using REIT cap rate comps
4. FFO multiple comparison if applicable
5. Key premium/discount factors vs. institutional REIT portfolios

Cite specific ticker, period, and data source for all REIT benchmarks used.`,
    },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "research_prompt",
    slug: "competitive-set-research",
    displayName: "Competitive Set Research Template",
    description: "Prompt template for competitor hotel analysis — rate positioning, occupancy, amenities.",
    config: {
      template: `You are a hospitality revenue analyst. Research the competitive set for:

Property: {property_name}
Location: {address}
Star Rating: {star_rating}
Room Count: {room_count}

Identify the top 5-7 competitive hotels within the same market and provide for each:
1. Property name, brand affiliation, room count, star rating
2. Current ADR range and occupancy (trailing 12 months where available)
3. Key differentiators (amenities, F&B, meeting space, loyalty program)
4. Estimated RevPAR index vs. subject property
5. Notable competitive advantages or vulnerabilities

Sources to consult: STR STAR report data, OTA rate comparisons, brand positioning, recent reviews.`,
    },
    secretRef: null,
    dailyRequestBudget: null,
  },
  {
    kind: "research_prompt",
    slug: "investment-thesis-research",
    displayName: "Investment Thesis Research Template",
    description: "Prompt template for operator/market due diligence and investment thesis development.",
    config: {
      template: `You are a hospitality investment analyst preparing an investment thesis for:

Property: {property_name}
Market: {market}
Acquisition Price: {acquisition_price}
Business Plan: {business_plan}

Develop a structured investment thesis covering:
1. Market fundamentals (supply/demand dynamics, barrier to entry, demand generators)
2. Property-level value creation opportunities (revenue enhancement, expense reduction, CapEx)
3. Comparable transaction analysis (recent hotel sales in market, price per key)
4. Risk factors and mitigants (market risk, execution risk, financing risk, exit risk)
5. Return profile summary (target IRR, equity multiple, hold period rationale)

Quantify all assumptions with market data sources and comparable evidence.`,
    },
    secretRef: null,
    dailyRequestBudget: null,
  },
];

export async function runPietroResearchCatalog001(): Promise<void> {
  let inserted = 0;
  let failed = 0;

  for (const row of CATALOG_ROWS) {
    try {
      const result = await db.execute(sql`
        INSERT INTO admin_resources
          (kind, slug, display_name, description, config, secret_ref, daily_request_budget)
        VALUES (
          ${row.kind},
          ${row.slug},
          ${row.displayName},
          ${row.description ?? null},
          ${JSON.stringify(row.config)}::jsonb,
          ${row.secretRef ?? null},
          ${row.dailyRequestBudget ?? null}
        )
        ON CONFLICT (kind, slug) DO NOTHING
        RETURNING id
      `);
      if (Array.isArray(result.rows) && result.rows.length > 0) inserted++;
    } catch (err) {
      failed++;
      logger.error(`${TAG} failed to seed ${row.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const skipped = CATALOG_ROWS.length - inserted - failed;
  logger.info(`${TAG} research catalog: ${inserted} seeded, ${skipped} already existed, ${failed} failed`);
}
