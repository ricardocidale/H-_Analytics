---
name: external-data-source-integration
description: "Integrate a new external data source (API, MCP, or scraper) into H+ Analytics following the FRED template: admin_resources row + scheduled minion fetcher + DB cache table + Rebecca tool + parity map entry + health probe. Use when adding any new data source — financial, hospitality, market, or research. Makes source #6 cost as little as source #2."
---

# External Data Source Integration

Use this skill when adding a new external data source to H+ Analytics. The pattern is
established by FRED (the canonical working example). Every source follows the same five-layer
architecture; deviating from it creates fragmentation that slows future agents.

## The Five Layers

Every integrated data source must implement all five layers:

```
Layer 1: admin_resources row    → admin visibility, health monitoring
Layer 2: Minion fetcher         → deterministic fetch + transform + upsert
Layer 3: DB cache table         → fast reads with no live API call at runtime
Layer 4: Rebecca tool           → agent-accessible via conversation
Layer 5: Parity map entry       → CLAUDE.md §7 compliance
```

## Step-by-Step

### Step 1 — Register in admin_resources

Add a seed row to `artifacts/api-server/src/seeds/` (or migration guard if deploying to
existing DB):

```ts
await db.insert(adminResources).values({
  kind: "mcp",          // or "api" | "source" | "benchmark"
  slug: "fmp-reit",
  displayName: "Financial Modeling Prep — REIT Fundamentals",
  description: "Quarterly income statement and KPI data for hotel REITs (HST, RHP, PEB, APLE, SHO)",
  config: {
    baseUrl: "https://financialmodelingprep.com/api/v3",
    dailyRequestBudget: 200,   // respect rate limits
  },
  secretRef: "FMP_ACCESS_TOKEN",   // env var name — never the value
}).onConflictDoNothing();
```

**Kind selection:**
- `mcp` — MCP server (remote HTTP or stdio)
- `api` — REST API called directly by the server
- `source` — data source without a standard API shape (scraper, file)
- `benchmark` — pre-computed market benchmark table
- `search_url` — research URL for admin/specialist reference
- `research_prompt` — prompt template for specialist or Rebecca use

**`secretRef` rule:** always the env var **name**, never the value. The probe system reads
`process.env[row.secretRef]` to verify the key is present.

### Step 2 — Write the minion fetcher

Minions are deterministic TypeScript functions — no LLM, no judgment. They:
1. Call the external API
2. Transform the response to the canonical DB schema
3. Upsert into the target table
4. Return a structured result

Location: `artifacts/api-server/src/ai/data-minions/<minion-name>.ts`

```ts
export interface MinionResult {
  source: string;
  rowsUpserted: number;
  rowsFailed: number;
  errors: string[];
  durationMs: number;
}

export async function runMinionFmpReit(): Promise<MinionResult> {
  const t0 = Date.now();
  const tickers = ["HST", "RHP", "PEB", "APLE", "SHO"];
  let rowsUpserted = 0;
  const errors: string[] = [];

  for (const ticker of tickers) {
    try {
      const data = await fetchFmpFundamentals(ticker);
      await db.insert(reitBenchmarks)
        .values(transformFmpToSchema(ticker, data))
        .onConflictDoUpdate({ target: [reitBenchmarks.ticker, reitBenchmarks.period], set: { ... } });
      rowsUpserted++;
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source: "fmp-reit", rowsUpserted, rowsFailed: errors.length, errors, durationMs: Date.now() - t0 };
}
```

**Naming convention:** `MinionFmpReit`, `MinionBookingRates`, `MinionDaloopaReit`, etc.
Minions are named in CLAUDE.md §10 alongside the agents that dispatch them.

### Step 3 — Create the DB cache table

Add a migration and Drizzle schema for the target table.

```ts
// lib/db/src/schema/data-tables.ts
export const reitBenchmarks = pgTable("reit_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticker: text("ticker").notNull(),
  metricKey: text("metric_key").notNull(),
  value: doublePrecision("value"),
  period: text("period").notNull(),    // e.g. "2024-Q4"
  source: text("source").notNull(),    // "fmp" | "daloopa"
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("reit_benchmarks_ticker_metric_period_uniq").on(t.ticker, t.metricKey, t.period),
  index("reit_benchmarks_fetched_idx").on(t.fetchedAt),
]);
```

**Cache design rules:**
- Always include `fetched_at` — Pietro reads it to decide whether data is stale
- Use a unique index on the natural key so upserts are idempotent
- Never remove cached rows on re-fetch — add a new row and let queries select the most recent

### Step 4 — Register with Pietro's scheduler

Add the minion to Pietro's dispatch table in `artifacts/api-server/src/ai/pietro/minions.ts`:

```ts
export const MINION_REGISTRY: Record<string, MinionFn> = {
  "fmp-reit":      runMinionFmpReit,
  "booking-rates": runMinionBookingRates,
  "expedia-rates": runMinionExpediaRates,
  // ...
};
```

Pietro reads the `admin_resources` row's slug to look up the minion function. If no minion
is registered for a slug, Pietro logs it and skips — the health probe still runs.

**Default cadence** (set on the `admin_resources` row config):
- REIT fundamentals: weekly (earnings are quarterly; weekly catches late filings)
- Competitor rates: weekly (trend data, not real-time pricing)
- FRED extensions: daily (macro data updates daily)
- Research URLs: never auto-refreshed (static catalog)

### Step 5 — Add a Rebecca tool

Every pre-populated source needs a Rebecca tool so agents can read the cached data.

```ts
// artifacts/api-server/src/chat/rebecca-tools.ts — in REBECCA_TOOLS array:
{
  name: "get_reit_benchmarks",
  description: "Get REIT financial benchmarks for hotel REITs (HST, RHP, PEB, APLE, SHO). Returns cached data from most recent fetch. Use for cap rate comps, NOI margins, debt ratios.",
  parameters: {
    type: "object",
    properties: {
      ticker: { type: "string", description: "REIT ticker symbol, e.g. HST" },
      metric: { type: "string", description: "Metric key, e.g. cap_rate, noi_margin, occupancy" },
    },
    required: [],
  },
},

// In the switch dispatcher:
case "get_reit_benchmarks":
  return await toolGetReitBenchmarks(args, ctx);

// Implementation:
async function toolGetReitBenchmarks(args, ctx) {
  const rows = await storage.getReitBenchmarks(args.ticker, args.metric);
  if (rows.length === 0) return { result: { message: "No data cached. Trigger regeneration from Admin → Sources." } };
  return { result: rows };
}
```

### Step 6 — Update the parity map

Add a row to `docs/discipline/agent-native-parity-map.md`:

```markdown
| Read REIT benchmark data | Admin → Sources → REIT Benchmarks card | `get_reit_benchmarks` | ✅ |
| Regenerate REIT data     | Regenerate button in REIT Benchmarks card | `regenerate_data_source("fmp-reit")` | ✅ |
```

## Checklist (gate before merging any new source)

- [ ] `admin_resources` seed row with correct `kind`, `slug`, `secretRef`, `dailyRequestBudget`
- [ ] Minion registered in `MINION_REGISTRY` with correct slug match
- [ ] DB cache table with `fetched_at` and idempotent upsert
- [ ] Migration applied and guard added to `migration-guards.json`
- [ ] Rebecca tool in `REBECCA_TOOLS` array + switch case + implementation
- [ ] Parity map entry (✅ or ⚠️)
- [ ] `CLAUDE.md` §10 updated with minion name if it's a named minion
- [ ] Secret (`secretRef` env var) set in both Railway and Replit

## FRED Is the Template

Read `artifacts/api-server/src/ai/ambient/fetchers.ts` — the FRED fetcher is the canonical
working example. When in doubt, mirror what FRED does.

Key pattern from FRED:
```ts
// 1. Check staleness before fetching
const lastFetch = await storage.getLastFetchTime("fred-extended");
if (isRecent(lastFetch, TTL_HOURS)) return; // skip — still fresh

// 2. Fetch with error isolation per series
for (const series of FRED_SERIES) {
  try {
    const data = await fetchFredSeries(series.id);
    await storage.upsertMarketBenchmark(series.key, data);
  } catch (err) {
    logger.warn(`[fred] Failed to fetch ${series.id}: ${err.message}`);
    // continue — one failure doesn't abort the whole batch
  }
}
```

## Related

- `docs/brainstorms/pietro-data-infrastructure-requirements.md` — full requirements for Pietro
- `artifacts/api-server/src/ai/ambient/fetchers.ts` — FRED canonical template
- `artifacts/api-server/src/chat/rebecca-tools.ts` — where Rebecca tools live
- `docs/discipline/agent-native-parity-map.md` — parity tracking
- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — where Sources & Resources lives in Admin nav
- `docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md`
