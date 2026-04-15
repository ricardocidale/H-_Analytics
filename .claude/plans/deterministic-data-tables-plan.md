# Deterministic Data Tables & Research Tools Plan

## The Principle

LLMs are expensive at looking up facts and bad at arithmetic. They're great at judgment, synthesis, and challenge. Every fact we pre-collect into a DB table is a fact the LLM doesn't have to hallucinate. Every calculation we put in a tool is a number the LLM doesn't have to estimate.

**Goal:** The research engine spends zero time on lookup and arithmetic, 100% on judgment and narrative.

## Dual Access Pattern

Every pre-collected data point is accessible two ways:
1. **Relational table** → deterministic tool does `SELECT FROM table WHERE market = X AND tier = Y` → returns exact number
2. **Pinecone vector** → RAG query returns contextual data when the LLM needs it for reasoning

The tool gives the LLM a fact. The vector gives the LLM context. Both come from the same source data.

---

## Layer 1: Pre-Collected Data Tables

### Already in Schema (7 tables — all EMPTY, need seeders + ambient refresh)

| Table | Schema | Columns | Seed Source | Refresh |
|---|---|---|---|---|
| `hospitality_benchmarks` | EXISTS, SEEDED (21 metrics) | category, segment, metricKey, value, unit, country, sourceYear | Hardcoded seed + admin CRUD | Admin edits |
| `market_adr_index` | EXISTS, EMPTY | market, segment, quarter, year, adr, occupancy, revpar, source | STR/CoStar data, web research results | Quarterly via ambient fetcher |
| `seasonal_calendars` | EXISTS, EMPTY | market, month (1-12), demandMultiplier, source | Historical occupancy patterns | Annually via research run |
| `event_calendars` | EXISTS, EMPTY | market, eventName, month, demandImpactPct, category | Tourism boards, convention centers | Annually via research run |
| `airport_distances` | EXISTS, EMPTY | propertyId, airportCode, airportName, distanceKm, driveMinutes | Google Maps Distance Matrix API | On property creation |
| `labor_rates` | EXISTS, EMPTY | country, role, tierMin, tierMid, tierMax, currency, source | BLS, local labor ministry data | Annually |
| `fb_benchmarks` | EXISTS, EMPTY | concept, costRatio, revenuePerSeat, avgCheck, source | Restaurant industry reports | Annually |

### New Tables Needed (4 tables)

| Table | Purpose | Columns | Seed Source |
|---|---|---|---|
| `cap_rate_transactions` | Recent hotel sale cap rates by market | market, propertyType, tier, capRate, salePrice, saleDate, source | CoStar, Real Capital Analytics, HVS |
| `construction_cost_index` | Renovation/conversion costs per sqft by country | country, buildingType, scope, costPerSqftLow, costPerSqftMid, costPerSqftHigh, source | RSMeans, local construction indices |
| `occupancy_ramp_benchmarks` | Months-to-stabilization by market/tier/size | market, tier, roomCount, monthsToStabilize, stabilizedOccupancy, source | STR, brand data |
| `operating_cost_benchmarks` | USALI cost ratios by property type and tier | propertyType, tier, costCategory, ratioLow, ratioMid, ratioHigh, source | CBRE Trends, HVS, PKF |

### Seeding Strategy

**Phase 1 — Static seeds (immediate):** Hardcode known benchmark data from industry sources (STR Global 2024, CBRE Trends, HVS, PKF). Same approach as `hospitality-benchmarks.ts`. Creates `server/seeds/market-data-tables.ts` (already exists but may be empty).

**Phase 2 — Research-driven population:** When the research engine runs for a property, any market data it discovers from web research gets upserted into the appropriate table. The LLM extracts structured data, the tool validates it, the seeder stores it. Next property in the same market gets instant lookup instead of web search.

**Phase 3 — Ambient refresh:** The ambient scheduler (every 6 hours) checks FRED for macro data (already working). Extend it to also refresh market ADR indices from available API sources.

### Pinecone Indexing

Every row inserted into a pre-collected table also gets indexed in Pinecone:
- `market_adr_index` → namespace `comparables` with text: "Medellín luxury hotel ADR Q1 2026: $245, occupancy 68%, RevPAR $167"
- `seasonal_calendars` → namespace `research-history` with text: "Medellín demand seasonality: Dec-Jan peak (1.35x), Jun-Aug low (0.7x)"
- `event_calendars` → namespace `research-history` with text: "Medellín Flower Festival August, +15% occupancy impact"
- etc.

Use the existing `indexBenchmarkSnapshot()` pattern from `pinecone-indexing.ts`.

---

## Layer 2: Deterministic Lookup Tools (LLM-callable)

These are new `calc/research/` modules registered in `calc/dispatch.ts`. The LLM calls them via tool_use. They query the pre-collected tables and return structured results.

### New Tools

| Tool Name | Input | Output | DB Table |
|---|---|---|---|
| `lookup_market_adr` | market, segment?, tier?, year? | { adr: {low,mid,high}, occupancy: {low,mid,high}, revpar, source, date } | `market_adr_index` + `hospitality_benchmarks` |
| `lookup_seasonal_curve` | market | { months: number[12], peakMonth, troughMonth, source } | `seasonal_calendars` |
| `lookup_event_calendar` | market, month? | { events: [{name, month, impactPct, category}] } | `event_calendars` |
| `lookup_labor_cost` | country, role? | { roles: [{role, min, mid, max, currency}], source } | `labor_rates` |
| `lookup_cap_rate_comps` | market, tier?, propertyType? | { transactions: [{capRate, salePrice, date}], range: {low,mid,high} } | `cap_rate_transactions` + `hospitality_benchmarks` |
| `lookup_fb_benchmarks` | concept? | { concepts: [{name, costRatio, revenuePerSeat, avgCheck}] } | `fb_benchmarks` |
| `lookup_construction_costs` | country, scope? | { costPerSqft: {low,mid,high}, source } | `construction_cost_index` |
| `lookup_occupancy_ramp` | market?, tier?, roomCount? | { monthsToStabilize, stabilizedOccupancy, source } | `occupancy_ramp_benchmarks` |
| `validate_assumption_range` | fieldName, value, market?, tier?, country? | { verdict: "within"\|"above"\|"below", benchmarkRange: {low,mid,high}, deviation: number, source } | ALL tables (dispatches to the right one based on fieldName) |

### The Key Tool: `validate_assumption_range`

This is the most powerful tool. It's the backbone of the "Ask the Analysts" workflow:

```
LLM: "Let me check if the user's ADR of $310 is reasonable..."
     → calls validate_assumption_range({ fieldName: "startAdr", value: 310, market: "Medellín", tier: "luxury" })
     → tool returns: { verdict: "above", benchmarkRange: { low: 220, mid: 265, high: 310 }, deviation: 0.17, source: "STR Q1 2026" }
     → LLM: "Your $310 ADR is at the top of the luxury range for Medellín ($220-$310).
             This is defensible if your property targets the ultra-luxury wellness segment,
             but an investor may question it. Consider having comp set data ready."
```

The LLM's job becomes pure judgment — the numbers come from the tool.

**Field-to-table mapping:**

| Field Name | Lookup Table | Key Columns |
|---|---|---|
| startAdr | market_adr_index + hospitality_benchmarks | market, tier |
| startOccupancy | market_adr_index + hospitality_benchmarks | market, tier |
| exitCapRate | cap_rate_transactions + hospitality_benchmarks | market, tier |
| costRateRooms..costRateOther | operating_cost_benchmarks | propertyType, tier |
| revShareFB, revShareEvents | fb_benchmarks + hospitality_benchmarks | concept |
| taxRate | countryDefaults (already exists) | country |
| depreciationYears | countryDefaults (already exists) | country |
| inflationRate | countryDefaults + FRED data | country |
| occupancyRampMonths | occupancy_ramp_benchmarks | market, tier, roomCount |
| purchasePrice | construction_cost_index | country, scope |
| acquisitionInterestRate | FRED treasury rates + spread | country |

---

## Layer 3: Skills That Guide the LLM

### `research/deterministic-lookups.md`
Tells the LLM:
- "Before suggesting ANY numeric value, call the appropriate lookup tool first"
- "If the tool returns data, cite it: 'Based on STR Q1 2026 data...'"
- "If the tool returns no data for this market, use web research as fallback and note lower conviction"
- Lists all available lookup tools with when to use each

### `research/assumption-validation.md`
Tells the LLM:
- "After the user saves assumptions, call validate_assumption_range for every key field"
- "If verdict is 'within' → High conviction, green Analyst Note"
- "If verdict is 'above' or 'below' → Moderate conviction, amber note with explanation"
- "If no benchmark data exists → Developing conviction, gray note"
- Maps field names to the conviction display

### `research/benchmark-interpretation.md`
Tells the LLM:
- "Never just parrot the number — interpret it for this specific property"
- "A $310 ADR that's 'above range' might be correct for a wellness vertical — explain why"
- "Always consider: quality tier, business model, vertical, location, comp set"
- "The benchmark is the starting point, not the answer"

---

## Layer 4: Research Engine Integration

### How research prompts change

**Before (current):** The research prompt says "Research the typical ADR for luxury boutique hotels in Medellín." The LLM searches the web, finds something, maybe hallucates.

**After:** The research prompt says "Use the lookup_market_adr tool to get current ADR data for Medellín luxury segment. If the tool returns data, use it as your primary source. If the tool returns no data, use web research via Perplexity/Tavily. Then compare the benchmark range against the user's current assumption using validate_assumption_range."

The LLM workflow becomes:
1. Call `lookup_market_adr(market, tier)` → get benchmark
2. Call `validate_assumption_range(fieldName, userValue, market, tier)` → get verdict
3. If gaps in data → call web research → fill gaps
4. Synthesize: benchmark + web research + property-specific context → recommendation with conviction

### How Analyst Notes get populated

When research completes for a property:
1. For every assumption field, `validate_assumption_range` was called
2. Results are stored in `assumption_guidance` table (already exists)
3. The Analyst Note badge on the UI reads from `assumption_guidance`
4. Conviction tier (High/Moderate/Developing) comes from:
   - High: benchmark data exists AND sources agree AND data is recent
   - Moderate: benchmark data exists but is old or sources disagree
   - Developing: no benchmark data, only web research or no data at all

---

## Execution Plan

### Phase 1: Seed the empty tables (Claude — 2 hours)
| # | What | Time |
|---|---|---|
| 1.1 | Create `server/seeds/market-adr-seeds.ts` — hardcode ADR/occupancy benchmarks for known markets (Medellín, Cartagena, NYC, Utah, etc.) | 30 min |
| 1.2 | Create `server/seeds/seasonal-calendar-seeds.ts` — 12-month demand curves for known markets | 20 min |
| 1.3 | Create `server/seeds/event-calendar-seeds.ts` — major events per market | 15 min |
| 1.4 | Create `server/seeds/labor-rate-seeds.ts` — hospitality wages by country/role | 20 min |
| 1.5 | Create `server/seeds/fb-benchmark-seeds.ts` — F&B cost ratios and revenue benchmarks | 15 min |
| 1.6 | Add schema for 4 new tables (cap_rate_transactions, construction_cost_index, occupancy_ramp_benchmarks, operating_cost_benchmarks) | 20 min |
| 1.7 | Seed the new tables with known data | 20 min |
| 1.8 | Wire seeds into `server/seeds/index.ts` | 5 min |

### Phase 2: Build lookup tools (Claude — 2 hours)
| # | What | Time |
|---|---|---|
| 2.1 | `calc/research/lookup-market-adr.ts` | 15 min |
| 2.2 | `calc/research/lookup-seasonal-curve.ts` | 10 min |
| 2.3 | `calc/research/lookup-event-calendar.ts` | 10 min |
| 2.4 | `calc/research/lookup-labor-cost.ts` | 10 min |
| 2.5 | `calc/research/lookup-cap-rate-comps.ts` | 15 min |
| 2.6 | `calc/research/lookup-fb-benchmarks.ts` | 10 min |
| 2.7 | `calc/research/lookup-construction-costs.ts` | 10 min |
| 2.8 | `calc/research/lookup-occupancy-ramp.ts` | 10 min |
| 2.9 | `calc/research/validate-assumption-range.ts` — THE key tool | 30 min |
| 2.10 | Register all tools in `calc/dispatch.ts` | 10 min |

### Phase 3: Pinecone indexing (Claude — 30 min)
| # | What | Time |
|---|---|---|
| 3.1 | Add index functions for each table type in `pinecone-indexing.ts` | 20 min |
| 3.2 | Call indexing after each seed/upsert | 10 min |

### Phase 4: Wire into research prompts (Claude — 1 hour)
| # | What | Time |
|---|---|---|
| 4.1 | Update prompt builders to instruct LLM to call lookup tools first | 30 min |
| 4.2 | Update prompt builders to call validate_assumption_range for each field | 20 min |
| 4.3 | Map validation results to conviction tiers in assumption_guidance | 10 min |

### Phase 5: Skills documentation (Claude — 30 min)
| # | What | Time |
|---|---|---|
| 5.1 | Create `research/deterministic-lookups.md` | 10 min |
| 5.2 | Create `research/assumption-validation.md` | 10 min |
| 5.3 | Create `research/benchmark-interpretation.md` | 10 min |

### Phase 6: Admin UI for benchmark management (Replit — 1 hour)
| # | What | Time |
|---|---|---|
| 6.1 | Admin page for market ADR data CRUD | 20 min |
| 6.2 | Admin page for seasonal calendars CRUD | 15 min |
| 6.3 | Admin page for event calendars CRUD | 15 min |
| 6.4 | Admin page for labor rates CRUD | 10 min |

**Total: ~7 hours** (5.5 Claude, 1 Replit, 0.5 both)

---

## The Result

**Before:** User clicks "Ask the Analysts" → LLM searches web → maybe finds data → guesses ranges → Moderate conviction on everything.

**After:** User clicks "Ask the Analysts" → tools instantly look up benchmarks → LLM gets exact numbers → validates every assumption against market data → High conviction where data exists, Developing where it doesn't → LLM focuses on interpreting the data for this specific property instead of finding it.

The unfair advantage: **the app gets smarter every time research runs.** Web research results are extracted and stored in the tables. Next property in the same market gets instant lookup. The tables accumulate intelligence over time.
