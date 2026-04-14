# Intelligence Engine — Detailed Architecture & User Workflow

> **This document describes HOW the research engines create intelligence for users.**
> It covers the step-by-step flow, async background processes, user interactions,
> and what happens when at every stage.

---

## 1. The User's Experience (What They See)

### 1.1 Creating a New Property

```
User clicks "Add Property"
  → Enters base info: address, room count, quality tier, business model, amenities
  → App immediately computes DEFAULTS using engine/helpers/default-resolver.ts:
     • Quality tier "Luxury" + country "US" + 10 rooms → ADR $400, occupancy 70%
     • Business model "hotel" → F&B share 30%, events share 18%
     • Country "US" → 21% tax, 39yr depreciation
     • Small property (<10 rooms) → +5% cost rate adjustment
  → Defaults populate all assumption fields instantly (no API call needed)
  → Gold badges next to each field show "No Research" (gray)
  → Blue banner: "Press Regenerate Intelligence to get AI-recommended ranges"
```

### 1.2 Regenerating Intelligence (The Core Workflow)

```
User presses "Regenerate Intelligence" button (sparkles icon)
  → Loading state: "Researching..." with progress indicator
  → Button shows freshness dot (green/amber/red)
  
  WHAT HAPPENS ON THE SERVER (5-10 seconds):
  
  Phase 1: SMART DATA ROUTING (instant, 0-500ms)
  ├── Check pre-collected tables FIRST (free, no API call):
  │   ├── market_adr_index → ADR range for this market
  │   ├── seasonal_calendars → demand pattern for this location
  │   ├── labor_rates → staffing costs for this market
  │   ├── fb_benchmarks → F&B operating metrics
  │   └── hospitality_benchmarks → industry-wide metrics
  │
  ├── Then call targeted APIs (only what's needed, in priority order):
  │   ├── Amadeus → live hotel pricing (comp-set)
  │   ├── FRED → current mortgage rates, CPI, treasury yields
  │   ├── Google Maps → distance to airports, nearby amenities
  │   ├── Walk Score → walkability/transit score
  │   └── RapidAPI → Booking.com/Airbnb/Zillow data
  │
  └── Progressive relaxation if data is sparse:
      ├── L0: Exact city + quality tier + property type
      ├── L1: Relax property type (boutique → luxury)
      ├── L2: Relax geography (city → metro area)
      ├── L3: Relax quality tier (luxury → upscale)
      ├── L4: Relax to state/region
      └── L5: Relax to country (widest ranges, still real data)
  
  Phase 2: MARKET INTELLIGENCE AGGREGATION (1-3 seconds)
  ├── MarketIntelligenceAggregator.gatherFresh() runs 14 services in parallel
  ├── Each service gated by admin toggle + health check
  ├── Results assembled into MarketIntelligence object
  └── Data recency warnings flagged
  
  Phase 3: WEB RESEARCH (1-3 seconds, parallel with Phase 2)
  ├── Perplexity Sonar: synthesized answer with citations
  ├── Tavily Advanced: domain-filtered hospitality search
  └── Results tagged as web_sourced (lower confidence than API data)
  
  Phase 4: LLM PROMPT ASSEMBLY (200ms)
  ├── Domain preamble: "You are a hospitality investment analyst..."
  ├── Entity context pack: 60+ property fields + amenities + location
  ├── VERIFIED DATA block: hard numbers from APIs (Phase 1)
  ├── UNVERIFIED block: fields needing LLM research
  ├── Regulatory context: country licensing, zoning, foreign investment
  ├── Comparable set: from progressive relaxation engine
  ├── Source health status: which sources are verified/unavailable
  └── Instructions: "Anchor on verified data. Research unverified. Cite sources."
  
  Phase 5: N+1 LLM RESEARCH (3-8 seconds)
  ├── Panel 1 (Gemini): analyzes market from one perspective
  ├── Panel 2 (Claude): analyzes from a different angle
  ├── Both panels receive the SAME verified data + entity context
  ├── Responses parsed for numerical ranges (low/mid/high)
  ├── Cross-validation: if panels disagree by >20%, flag for review
  └── Ranges extracted with confidence (high/medium/low)
  
  Phase 6: SYNTHESIS & STORAGE (500ms)
  ├── Merge API data + LLM ranges → final guidance per field
  ├── Store in assumption_guidance table (per scenario, per entity, per field)
  ├── Index summary in Pinecone (research-history namespace) for future RAG
  ├── Update staleness timestamps
  └── Return to client
  
  USER SEES:
  → Gold badges appear next to EVERY assumption field
  → Each badge shows: range (e.g., $285-$420), confidence (High/Medium/Low)
  → Colors: green (value within range), yellow (near edge), red (outside range)
  → Tooltip on hover: "Luxury boutique hotels in Catskills average $310 ADR (STR 2024, 8 comps)"
  → Apply dialog: "Research suggests different values. Apply?" with per-field checkboxes
  → Dirty fields (user already edited) are unchecked by default with "Edited" badge
```

### 1.3 Adjusting Assumptions

```
User sees ADR field: $400 (default) with gold badge showing ($285-$420)
  → Badge is GREEN (value is within range)
  → User changes ADR to $280
  → Badge turns RED (below range minimum $285)
  → Tooltip: "Your ADR is below the researched range. Consider: luxury boutique comps average $310."

User changes room count from 10 to 6
  → Banner appears: "Property characteristics changed. Press Regenerate to update ranges."
  → Previous ranges are still shown but labeled "May be outdated"
  → User presses Regenerate Intelligence again
  → NEW ranges come back reflecting 6-room economics (higher cost ratios, different comp set)
  → ADR range shifts to ($250-$380) because smaller properties in this market charge less
  → User adjusts to $320

User saves assumptions
  → App recalculates ALL financial statements
  → Income Statement, Cash Flow, Balance Sheet, Investment Analysis update
  → IRR recalculated with new assumptions
  → Scenario snapshot saved
```

### 1.4 Scenario Comparison

```
User creates 3 scenarios:
  Scenario A: "Conservative" — ADR at P25 of range, occupancy at low end
  Scenario B: "Base Case" — ADR at midpoint, occupancy at midpoint
  Scenario C: "Optimistic" — ADR at P75, occupancy at high end
  
  Tags: base_case, bull_case, bear_case
  
  User clicks "Compare Scenarios" → batch comparison
  → Side-by-side: IRR, equity multiple, NOI, cash flow
  → Ranking table: Scenario C → 22% IRR, Scenario B → 16% IRR, Scenario A → 11% IRR
  → Risk flags: "Scenario C assumes 82% occupancy — above luxury segment average of 74%"
```

---

## 2. Asynchronous Background Processes

These run WITHOUT user interaction, keeping data fresh:

### 2.1 Ambient Data Refresh (Every 6 Hours)

```
Scheduler fires every 6 hours:
  1. FRED API: fetch 11 macro series (rates, CPI, unemployment)
  2. Frankfurter: fetch 9 FX pairs (USD/EUR, USD/COP, USD/GBP, etc.)
  3. Source health check: test all 25 registered sources
  4. Update hospitality_benchmarks from DB (if admin edited)
  5. Log results to benchmark_snapshots for history
  
  NO user notification — silent background refresh.
  If any critical source fails, mark as "degraded" in source_registry.
```

### 2.2 Market Data Table Refresh (Suggested Schedule)

```
WEEKLY (automated or admin-triggered):
  - market_adr_index: refresh from latest available reports
  - labor_rates: check BLS data for updates
  
MONTHLY:
  - seasonal_calendars: verify patterns haven't shifted
  - fb_benchmarks: check for industry report updates
  
QUARTERLY:
  - Full re-seed of market_adr_index with new quarter data
  - Event calendar update for next 12 months
  
ON PROPERTY CREATE/ADDRESS CHANGE:
  - airport_distances: compute via Google Maps API, cache forever
```

### 2.3 Research Staleness Detection (On Every Page Load)

```
User opens Property Edit page:
  → Client calls GET /api/research/staleness
  → Server checks assumption_guidance updatedAt vs 30-day threshold
  → If any critical field (ADR, occupancy, cap rate) is stale:
     → Yellow banner: "Research data is 45 days old. Press Regenerate to refresh."
  → If NO research exists:
     → Blue banner: "Press Regenerate Intelligence to get AI-recommended ranges."
  → If all fresh:
     → No banner (clean view)
```

### 2.4 Pinecone Vector Indexing (After Research Completes)

```
After every research generation:
  → Summary of findings indexed in Pinecone (research-history namespace)
  → Includes: property context, market, ranges found, sources cited
  → Purpose: when researching a SIMILAR property later, the system can say
    "We previously found ADR $285-$420 for luxury boutique in Catskills"
  → This makes the system SMARTER over time — it learns from its own research
```

---

## 3. Intelligence for Different Entity Types

### 3.1 Property (Hotel Model)

Fields researched and their primary sources:

| Field | Source Priority | What Intelligence Provides |
|-------|---------------|---------------------------|
| ADR | Market ADR table → Amadeus → Booking.com → Benchmarks | Range: $285-$420 for luxury boutique in Catskills |
| Occupancy | Benchmarks → CoStar → FRED | Range: 68-74% for luxury segment |
| ADR Growth | FRED CPI → CoStar rent growth | Range: 2.5-4.0% based on inflation + market premium |
| F&B Share | Benchmarks → USALI | Range: 25-35% of total revenue for properties with full F&B |
| Events Share | Benchmarks → Web research | Range: 12-22% depending on event space and vertical |
| Cost Rates | USALI benchmarks → Market adjustments | Range per department with quality tier adjustment |
| Cap Rate | CBRE → Benchmarks → FRED spread | Range: 6.2-7.8% for full-service luxury |
| Interest Rate | FRED MORTGAGE30US + spread | Current: 7.22% + 100-200bps property spread |
| Tax Rate | Country defaults table | Exact: 21% (US), 35% (Colombia), etc. |
| Depreciation | Country defaults + regulatory data | Exact: 39yr (US IRS §168), 20yr (Colombia) |
| Property Tax | Country/state defaults → Zillow | Range: 1.2-2.5% depending on municipality |
| Management Fees | HVS benchmarks | Range: 3-5% base, 10-20% incentive |

### 3.2 Property (Luxury Rental / VRBO Model)

| Field | Source Priority | What Intelligence Provides |
|-------|---------------|---------------------------|
| Nightly Rate | Airbnb scraper → VRBO scraper → Amadeus | Range based on whole-property comps |
| Platform Fees | Airbnb/VRBO fee schedules | Exact: 3% host fee + 14% guest fee (Airbnb) |
| Occupancy | AirDNA (if available) → Airbnb scraper | Lower than hotels: 50-65% typical for luxury rental |
| F&B Events | Web research → Market knowledge | Per-event pricing, not daily service |
| Seasonality | Seasonal calendars table → Web research | Sharper peaks/troughs than hotels |

### 3.3 Management Company (ManCo / Brand)

| Field | Source Priority | What Intelligence Provides |
|-------|---------------|---------------------------|
| Base Fee % | HVS benchmarks → Industry reports | Range: 3-5% of property total revenue |
| Incentive Fee % | HVS benchmarks | Range: 10-20% of GOP |
| Staff Salaries | Labor rates table → BLS data | By role: GM $95K, front desk $37K, chef $75K |
| Overhead | Benchmarks → Market data | Office, tech, insurance by market |
| Marketing Spend | Industry benchmarks | Range: 4-8% of revenue |
| Break-even Timeline | Cash flow modeling | Estimate: 18-30 months with typical funding |

---

## 4. How N+1 Research Pipeline Works (Detailed)

### Step 1: Context Assembly

The entity context pack (`server/ai/context-pack/`) assembles 60+ fields:
- Property identity: name, address, rooms, quality tier, business model
- Physical: amenities (natural language), event space sq ft, F&B venues, acreage
- Financial: current ADR, occupancy, cap rate, LTV, debt terms
- Market: city, state, country, market tier, location type
- Vertical: ICP alignment (wellness, corporate, etc.)

### Step 2: Comparable Set Assembly

Progressive relaxation engine (`server/ai/comparables/`) finds similar properties:
- Queries local DB + Pinecone vector search in parallel
- Star rating guard: ±1 star only (hard constraint)
- Business model boost: +15% score for matching model
- Evidence score: 30% count + 25% similarity + 20% constraints + 15% diversity + 10% model
- If <3 comps found, web enricher queries Perplexity/Tavily for additional data

### Step 3: Dual-Panel Analysis

Two LLM models analyze the same data independently:
- Panel A (typically Gemini): focuses on market positioning and revenue
- Panel B (typically Claude): focuses on risk factors and cost structure
- Both receive identical verified data + entity context
- Cross-validation: significant disagreement (>20%) triggers a note

### Step 4: Opus Synthesis

A synthesis model (Claude Opus or equivalent) merges both panels:
- Reconciles disagreements
- Produces final ranges with attribution
- Assigns confidence per field
- Generates source citations

### Step 5: Validation & Storage

- Sanity bounds check: ADR $30-$5,000, occupancy 5%-100%, cap rate 2%-20%
- Cross-field validation: cap rate >12% with occupancy >85% = anomalous
- Store in assumption_guidance with full provenance
- Index in Pinecone for future research RAG

---

## 5. What Makes This Different from Excel + Google

| Feature | Excel + Google | H+ Analytics |
|---------|---------------|--------------|
| ADR data | Manual search, copy-paste, stale | Live from Amadeus + 5 fallback sources, refreshed on demand |
| Comparable set | "I think similar hotels charge..." | Progressive relaxation across DB + Pinecone + web, scored and attributed |
| Cost benchmarks | Guess or find one report | USALI benchmarks + market-adjusted + quality tier + scale adjusted |
| Interest rates | Check bankrate.com once | Live FRED data, automatically updated every 6 hours |
| Regulatory | "I should look into zoning..." | 18-country profiles with licensing, zoning, foreign investment, labor |
| Risk assessment | Gut feeling | 5-factor scoring + DSCR breach detection + LLM narratives |
| Seasonality | "Summer is busy" | 12-month demand multipliers per market, data-backed |
| F&B economics | "Restaurants make 30% margin" | USALI benchmarks: COGS 28-35%, labor 33-36%, by property type |
| Confidence | None | 7-factor score with source attribution and relaxation level |
| Staleness | "This data is from 2022" | Auto-detected, banner prompts refresh, 30/90 day thresholds |

---

## 6. Future Enhancements (Not Yet Built)

### 6.1 Additional Pre-Collected Tables Needed

The system should grow to include:
- **Construction cost index** by market (renovation $/sqft)
- **Insurance rates** by location and property type
- **Utility rates** by municipality (electricity, water, gas)
- **Zoning approval timelines** by municipality (not just country-level)
- **Vertical market calendars** (wellness retreat seasons, corporate event seasons)
- **Practitioner rates** for vertical programming (yoga instructor, chef, therapist)

### 6.2 Learning from User Decisions

Track when users accept vs. override ranges:
- If users consistently override ADR DOWN for a market → the range may be too high
- If users consistently ACCEPT occupancy ranges → the engine is well-calibrated
- Feed this back into confidence scoring: fields with high acceptance rate = higher confidence

### 6.3 Self-Improvement Loop (Engines Get Smarter Over Time)

The research engines MUST learn from their own results. Every research run produces data that improves the NEXT run:

**Pinecone RAG feedback loop (already built, 7 namespaces):**
```
Research run for Property A in Catskills
  → Results stored in Pinecone "research-history" namespace
  → Next time ANY Catskills property is researched:
     → RAG query finds: "Previous research for similar luxury boutique in Catskills
        found ADR $285-$420 from 8 comps (April 2026)"
     → This becomes ADDITIONAL context for the new research
     → The LLM can say: "Consistent with prior research for similar properties"
     → Or flag: "ADR has shifted 15% since last research — market may be moving"
```

**User decision tracking (built, guidance_decisions table):**
```
User accepts ADR range ($285-$420) and sets $310
  → Decision recorded: accept, field=startAdr, value=310
  
User overrides occupancy range (68-74%) and sets 80%
  → Decision recorded: override, field=startOccupancy, value=80, range_was=68-74
  
Over time, the system learns:
  → "Users in Catskills luxury segment consistently accept ADR ranges" → high calibration
  → "Users consistently override occupancy UP by 8-12%" → range may be too conservative
  → Feed this into confidence scoring: high-acceptance fields get higher confidence
```

**Comparable quality improvement:**
```
Each comparable match is scored (evidence score 0-1)
  → High-scoring matches are prioritized in Pinecone
  → Low-scoring matches are de-weighted over time
  → The vector database accumulates better comps with each research run
  → After 50+ research runs, the system has a rich proprietary comp database
    that no competitor can replicate
```

**Source reliability tracking:**
```
Each source that provides data gets a rolling success rate (EMA)
  → Sources that consistently return useful data → trust_score = "verified"
  → Sources that return stale/empty data → trust_score = "degraded"
  → Degraded sources get lower priority in the routing table
  → This is automatic — no admin intervention needed
```

### 6.4 Portfolio-Level Intelligence

When multiple properties exist:
- Cross-property comparison: "Your Catskills property charges $350 but your similar Medellín property charges $180. The purchasing power difference is 1.9x, consistent with the FX-adjusted market spread."
- Portfolio optimization: "Adding a property in Miami would reduce your geographic concentration risk from D to B grade."
- Seasonal portfolio balance: "Your Catskills and Park City properties both peak Dec-Mar. A Caribbean property would fill your Q2-Q3 trough."
