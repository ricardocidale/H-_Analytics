---
name: Research System
description: The research system provides industry-backed financial guidance for every property assumption in the simulation. It operates as an 11-layer multi-LLM pipeline: N+1 orchestrator (dual analyst panels → API validation → Opus synthesis), 15 prompt-builder tools, 10 deterministic calc tools, 7 live market data sources, Pinecone vector similarity, post-LLM validation, guidance extraction, SSE streaming, and a 3-tier badge display hierarchy. Load this skill for any work touching research generation, badges, research config, or the orchestration pipeline.
---

# Research System — Master Skill

**Related skills:** `research-orchestrator/` (N+1 synthesis deep-dive), `market-intelligence/` (7-source data aggregator), `icp-research/` (property targeting), `deterministic-tools` rule (calc tool registry)

---

## Purpose & Design Philosophy

The research system gives users **market-validated guidance** for every financial assumption in the simulation. It operates as amber "Research" badges next to every editable field. Badges show suggested ranges (e.g., `$280–$450`) derived from live market data, comparable properties, and LLM analysis.

**Core principle:** LLMs handle market knowledge and narrative. Deterministic calc tools handle all arithmetic. Research values are guidance only — they never auto-apply and never override the financial engine.

**Asset agnosticism:** The property type is never hardcoded. All prompts reference `globalAssumptions.propertyLabel` (default: `"Boutique Hotel"`). STR/Airbnb properties, resorts, and B&Bs are all supported — the LLM calibrates to the asset type.

---

## 11-Layer Architecture

```
User clicks "Run Research"
        │
        ▼
[1] POST /api/research/generate
        │ Load admin config (researchConfig JSONB)
        │ Build PropertyContextPack or CompanyContextPack
        │
        ▼
[2] MarketIntelligenceAggregator.gather()
        │ FRED + CoStar/STR + Grounded + Moody's + S&P + CoStar + Xotelo
        │ Partial failure OK — circuit breaker per service
        │
        ▼
[3] research-orchestrator.ts (property research only)
        │
        ├──[3a] Phase 0: Pinecone comparable retrieval
        │        Progressive relaxation L1–L5 strictness
        │        Top 15 prior research vectors injected
        │
        ├──[3b] Phase 1: Parallel Analyst Panels (Promise.all)
        │        Analyst A: Gemini 2.5 Flash (QUANTITATIVE)
        │        Analyst B: Claude Sonnet (MARKET-STRATEGY)
        │        Each runs full tool-calling loop (max 10 iterations)
        │
        ├──[3c] Phase 2: API Validation
        │        Compare analyst outputs vs. live data (ADR/Occ/Cap/RevPAR)
        │        Divergence calc: >15% diff → status "diverge"
        │        Consensus ratio: 0–1 agreement fraction
        │
        └──[3d] Phase 3: Synthesis (Claude Opus)
                 AGREE → HIGH confidence, tight range
                 DIVERGE → wider range, LOW/MEDIUM confidence
                 API confirms → elevated confidence
                 Streams JSON via SSE → client sees it build in real time
        │
        ▼
[4] Tool-Calling Iteration Loop (aiResearch.ts)
        │ Each LLM call returns text blocks + tool calls
        │ Tool calls dispatched to [5] or [6]
        │ Results fed back as next message
        │ Loop continues until end_turn or 0 tool calls (max 10)
        │
        ├──[5] Prompt-Builder Tools (15 tools)
        │        analyze_market, analyze_adr, analyze_occupancy,
        │        analyze_event_demand, analyze_cap_rates,
        │        analyze_competitive_set, analyze_catering,
        │        analyze_land_value, analyze_operating_costs,
        │        analyze_property_value_costs,
        │        analyze_management_service_fees,
        │        analyze_income_tax, analyze_outsourcing_make_vs_buy,
        │        analyze_local_economics, analyze_marketing_costs
        │        → Returns rich in-context guidance blocks
        │
        └──[6] Deterministic Calc Tools (10 tools → calc/dispatch.ts)
                 compute_property_metrics, compute_depreciation_basis,
                 compute_debt_capacity, compute_occupancy_ramp,
                 compute_adr_projection, compute_cap_rate_valuation,
                 compute_cost_benchmarks, compute_service_fee,
                 compute_markup_waterfall, compute_make_vs_buy
                 → Returns exact numbers (no LLM arithmetic)
        │
        ▼
[7] parseResearchJSON() → extract full structured output
        │
        ▼
[8] Post-LLM Validation (validate-research.ts)
        │ Bounds checks: ADR $50–$2000, occupancy 20–100%, cap rate 3–15%...
        │ Cross-validation: ADR → NOI margin check (warn if <5%)
        │ Cap Rate → implied value vs. purchase price (warn if >2x deviation)
        │ Attaches _validation: { passed, warned, failed }
        │
        ▼
[9] Guidance Extraction (guidance/extractor.ts)
        │ Walks research JSON sections → GuidanceRecord[] per assumption key
        │ 25+ keys: adr, occupancy, capRate, costHousekeeping, svcFeeMarketing...
        │ Upserts to assumption_guidance table
        │ Writes extracted values to properties.research_values JSONB
        │
        ▼
[10] Storage
        │ market_research table: full parsed JSON content
        │ assumption_guidance table: per-key normalized records
        │ properties.research_values: lightweight badge values
        │ Async: Pinecone index (fire-and-forget, non-blocking)
        │
        ▼
[11] Client Badge Display (PropertyEdit.tsx)
         3-tier merge: GENERIC_DEFAULTS → seed overlay → AI overlay
         ResearchBadge: amber pill, tooltip (source + date)
         ResearchBadgePopover: Apply Value | View Details | Ask Rebecca
         ConfidenceBadge: conservative (blue) | moderate (green) | aggressive (amber)
```

---

## Research Event Types

| Event | Trigger | Models | Output |
|-------|---------|--------|--------|
| **Property** | "Run Research" on property page; auto-refresh on login if >7 days stale | Gemini 2.5 Flash + Claude Sonnet → Claude Opus (N+1) | 12 analysis sections → 25 guidance keys |
| **Company** | "Run Research" on Management Company page | Configurable (admin) single-model | Fee structures, GAAP, ICP benchmarks |
| **Global** | "Run Research" on global market page | Configurable (admin) single-model | Industry trends, cap rates, lending environment, supply pipeline |

---

## Research Skill Files (14 Analysis Modules)

Each skill file is loaded by `loadSkill(type)` from `.claude/skills/research/*/SKILL.md`. They define the analysis scope, output JSON schema, and tool invocation order for that dimension.

| Skill | Directory | Output Section |
|-------|-----------|---------------|
| Market Overview | `research/market-overview/` | `marketOverview` |
| ADR Analysis | `research/adr-analysis/` | `adrAnalysis` |
| Occupancy Analysis | `research/occupancy-analysis/` | `occupancyAnalysis` |
| Cap Rate Analysis | `research/cap-rate-analysis/` | `capRateAnalysis` |
| Competitive Set | `research/competitive-set/` | `competitiveSet` |
| Event Demand | `research/event-demand/` | `eventDemandAnalysis` |
| Land Value | `research/land-value/` | `landValueAllocation` |
| Operating Costs | `research/operating-costs/` | `operatingCostAnalysis` |
| Property Value Costs | `research/property-value-costs/` | `propertyValueCostAnalysis` |
| Management Service Fees | `research/management-service-fees/` | `managementServiceFeeAnalysis` |
| Income Tax | `research/income-tax/` | `incomeTaxAnalysis` |
| Local Economics | `research/local-economics/` | `localEconomics` |
| Marketing Costs | `research/marketing-costs/` | `marketingCostAnalysis` |
| Company Research | `research/company-research/` | Company-level output |
| Global Research | `research/global-research/` | Global-level output |

---

## Prompt-Builder Tools (15)

These tools execute in-context during the LLM tool-calling loop. They return rich guidance blocks that inform the LLM's next response. They do NOT compute numbers — that is the deterministic tools' job.

```
analyze_market               → Local market conditions, supply, demand, tourism
analyze_adr                  → ADR benchmarking, comparable rates, OTA data
analyze_occupancy            → Occupancy patterns, seasonal, ramp-up timeline
analyze_event_demand         → Wellness retreat, corporate, wedding demand
analyze_cap_rates            → Investment cap rates, transaction comps
analyze_competitive_set      → 4–6 comparable properties with metrics
analyze_catering             → F&B catering boost, event catering revenue
analyze_land_value           → IRS land allocation for depreciation basis
analyze_operating_costs      → USALI-aligned departmental cost benchmarks
analyze_property_value_costs → Insurance rates, property tax rates
analyze_management_service_fees → 5-category service fees + incentive fee
analyze_income_tax           → SPV entity tax rates, federal/state breakdown
analyze_outsourcing_make_vs_buy → Vendor vs in-house cost comparison
analyze_local_economics      → Inflation, interest rates, economic health
analyze_marketing_costs      → Hospitality marketing spend benchmarks
```

---

## Deterministic Calc Tools (10)

Called during the same tool-calling loop. Return exact numbers. LLM receives results and interprets them — never recomputes them.

| Tool | File | Computes |
|------|------|---------|
| `compute_property_metrics` | `calc/research/property-metrics.ts` | Room revenue, F&B, total revenue, NOI, NOI margin |
| `compute_depreciation_basis` | `calc/research/depreciation-basis.ts` | Land %, building %, depreciable basis |
| `compute_debt_capacity` | `calc/research/debt-capacity.ts` | Max loan from DSCR, LTV, term |
| `compute_occupancy_ramp` | `calc/research/occupancy-ramp.ts` | Month-by-month occupancy schedule |
| `compute_adr_projection` | `calc/research/adr-projection.ts` | Multi-year ADR with growth rate |
| `compute_cap_rate_valuation` | `calc/research/cap-rate-valuation.ts` | Implied property value from NOI ÷ cap rate |
| `compute_cost_benchmarks` | `calc/research/cost-benchmarks.ts` | Dollar amounts from percentage cost rates |
| `compute_service_fee` | `calc/research/service-fee.ts` | Service fee in dollars from percentage |
| `compute_markup_waterfall` | `calc/research/markup-waterfall.ts` | Vendor markup cost allocation |
| `compute_make_vs_buy` | `calc/research/make-vs-buy.ts` | In-house vs. outsourced cost comparison |

---

## Research JSON Output Structure

```typescript
interface ParsedResearch {
  // 12 analysis sections (property research)
  marketOverview?: object
  adrAnalysis: {
    recommendedRange: string        // "$250–$350"
    mid: number                     // 300
    confidence: "high" | "medium" | "low"
    marketComparables: Array<{ name, adr, roomCount }>
    sourceName: string              // "CoStar STR"
    sourceDate: string              // "2025-04-06"
  }
  occupancyAnalysis: {
    recommendedRange: string
    initialOccupancy: { value: number, confidence: string }
    rampUpTimeline: { months: number, confidence: string }
    seasonalPatterns: { spring, summer, fall, winter }
  }
  capRateAnalysis: { ... }
  operatingCostAnalysis: {
    roomRevenueBased: { housekeeping, fbCostOfSales }
    totalRevenueBased: { adminGeneral, marketing, propertyOps, utilities, ffe, it, other }
  }
  // ... more sections
  
  // Post-LLM metadata (added by pipeline, not LLM)
  _validation?: { passed: number, warned: number, failed: number }
  _marketIntelligence?: { benchmarks, rates, moodys, spGlobal, costar, xotelo, groundedResearch, errors, fetchedAt }
  _orchestrator?: OrchestratorMeta  // see research-orchestrator skill
  
  // Fallback (if LLM output unparseable)
  rawResponse?: string
}
```

---

## 3-Tier Client Display Hierarchy

```typescript
// PropertyEdit.tsx merge logic
const researchValues = {
  ...GENERIC_DEFAULTS,          // Tier 3: National US averages (last resort)
  ...dbSeedValues,              // Tier 2: Location-aware seeds from properties.research_values
  ...aiResearchValues,          // Tier 1: AI-generated values from market_research table
}
```

| Tier | Source tag | When present |
|------|-----------|-------------|
| 1 (highest) | `"ai"` | After user runs research |
| 2 | `"seed"` | Always — generated at property creation |
| 3 (fallback) | (none) | Only if property has no researchValues AND no AI research |

### Badge Entry Shape
```typescript
interface ResearchBadgeEntry {
  display: string      // "$250–$350" or "70%–82%"
  mid: number          // 300 or 76
  source?: "seed" | "ai" | "market" | "none"
  sourceName?: string  // "CoStar STR"
  sourceDate?: string  // "2025-04-06"
}
```

---

## Research Value Keys (25 total)

| Key | Badge Location | Base | Format |
|-----|---------------|------|--------|
| `adr` | Starting ADR | — | `$280–$450` |
| `occupancy` | Max Occupancy | — | `70%–82%` |
| `startOccupancy` | Initial Occupancy | — | `30%–45%` |
| `rampMonths` | Ramp-Up Months | — | `12–24 mo` |
| `capRate` | Exit Cap Rate | — | `6.5%–8.5%` |
| `catering` | Catering Boost | — | `25%–35%` |
| `landValue` | Land Value % | — | `15%–25%` |
| `costHousekeeping` | Housekeeping | Room Revenue | `15%–22%` |
| `costFB` | F&B Cost | F&B Revenue | `7%–12%` |
| `costAdmin` | Admin & General | Total Revenue | `4%–7%` |
| `costPropertyOps` | Property Ops | Total Revenue | `3%–5%` |
| `costUtilities` | Utilities | Total Revenue | `2.9%–4.0%` |
| `costFFE` | FF&E Reserve | Total Revenue | `3%–5%` |
| `costMarketing` | Marketing | Total Revenue | `1%–3%` |
| `costIT` | IT | Total Revenue | `0.5%–1.5%` |
| `costOther` | Other Expenses | Total Revenue | `3%–6%` |
| `costInsurance` | Insurance | Property Value | `0.3%–0.5%` |
| `costPropertyTaxes` | Property Taxes | Property Value | `1.0%–2.5%` |
| `svcFeeMarketing` | Svc: Marketing | Total Revenue | `0.5%–1.5%` |
| `svcFeeIT` | Svc: Technology | Total Revenue | `0.3%–0.8%` |
| `svcFeeAccounting` | Svc: Accounting | Total Revenue | `0.5%–1.5%` |
| `svcFeeReservations` | Svc: Reservations | Total Revenue | `1.0%–2.0%` |
| `svcFeeGeneralMgmt` | Svc: General Mgmt | Total Revenue | `0.7%–1.2%` |
| `incentiveFee` | Incentive Fee | GOP | `8%–12%` |
| `incomeTax` | Income Tax Rate | Taxable Income | `24%–28%` |

---

## Admin Configuration (researchConfig JSONB)

Stored in `global_assumptions.researchConfig`. Loaded in `server/routes/research.ts` and threaded as `eventConfig` into the orchestration pipeline.

```typescript
interface ResearchConfig {
  preferredLlm: string            // Fallback model ID for unspecified contexts
  
  propertyLlm?: ContextLlmConfig  // { primaryLlm, llmMode: "single"|"dual", secondaryLlm?, llmVendor? }
  companyLlm?: ContextLlmConfig
  marketLlm?: ContextLlmConfig
  
  property?: ResearchEventConfig
  company?: ResearchEventConfig
  global?: ResearchEventConfig
  
  companySources?: Array<{ label, url, category }>
}

interface ResearchEventConfig {
  enabled: boolean               // Block this research type entirely if false
  refreshIntervalDays: number    // Staleness threshold (default 7)
  sources?: string[]             // Custom URL sources
  enabledTools?: string[]        // Whitelist of allowed tool names
  focusAreas?: string[]          // Research focus areas
  regions?: string[]             // Geographic scope
  customInstructions?: string    // Admin prose injected into system prompt
  customQuestions?: string[]     // Required research questions
}
```

---

## Context Packs (V2 Prompt Architecture)

The research system builds rich context narratives before calling the LLM:

### PropertyContextPack (`server/ai/context-pack/property-pack.ts`)
Includes: location display, amenity detection (F&B/events/wellness), revenue narrative (ADR/occupancy/revenue shares), cost narrative (all rates), capital narrative (loan terms/refi plans), ICP alignment score (0–100%), full current assumptions summary (20+ fields).

### CompanyContextPack (`server/ai/context-pack/company-pack.ts`)
Includes: global assumptions, all active properties, service templates, overhead structure.

---

## Research Freshness & Auto-Refresh

**Staleness threshold**: `refreshIntervalDays` (default 7 days) per research type.

**Status endpoint**: `GET /api/research/status`
```typescript
{
  properties: [{ propertyId, name, status: "fresh"|"stale"|"missing", updatedAt, llmModel }]
  company: { status, updatedAt }
  global: { status, updatedAt }
}
```

**Auto-refresh on login**: If any property research is `"stale"` or `"missing"`, the ResearchRefreshOverlay surfaces (3D animated) inviting the user to refresh.

**Manual refresh**: "Run Research" button on any assumption page. Re-runs the full pipeline for that event type.

---

## Confidence Scoring

Every recommended metric includes a `confidence` field:

| Value | Meaning | ConfidenceBadge Color |
|-------|---------|----------------------|
| `"high"` | Below-market / cautious — safer for underwriting | Blue |
| `"medium"` | Market-aligned with strong comparable data | Green |
| `"low"` | Above-market / optimistic — higher risk | Amber |

**Injected via**: `CONFIDENCE_PREAMBLE` in `server/ai/research-resources.ts`, loaded into every LLM system prompt. Defined once, not duplicated in skill files.

---

## Post-LLM Validation

`validateResearchValues()` in `calc/research/validate-research.ts`:

**Bounds checks:**
- ADR: $50–$2,000/night
- Occupancy: 20%–100%
- Cap rate: 3%–15%
- Catering boost: 5%–80%
- Cost rates: 0.5%–50% of revenue
- Service fee rates: 0.5%–10% per category

**Cross-validation:**
- ADR → compute NOI margin via `computePropertyMetrics()` → warn if margin < 5%
- Cap rate → compute implied value via `computeCapRateValuation()` → warn if >2× deviation from purchase price

Validation results are stored in `_validation` metadata. Warnings do NOT block storage — they are advisory.

---

## Storage Layer

| Store | What | Key |
|-------|------|-----|
| `market_research` table | Full parsed JSON research content | `(userId, propertyId, type)` |
| `assumption_guidance` table | Per-key GuidanceRecord (extracted + normalized) | `(propertyId, assumptionKey)` |
| `properties.research_values` | Lightweight badge values `{ display, mid, source }` | JSONB column on property |
| Pinecone | Embedded guidance vectors for cross-property similarity | Vector IDs linked to assumption_guidance |

### Persistence Sequence (post-LLM)
1. `parseResearchJSON()` → structured output
2. `extractResearchValues()` → 25 badge entries
3. `validateResearchValues()` → bounds/cross-validation
4. `storage.updateProperty()` → write to `properties.research_values`
5. `extractGuidance()` → GuidanceRecord[] (25+ records)
6. `storage.upsertAssumptionGuidance()` → insert/update guidance table
7. `indexAssumptionGuidance()` → async Pinecone indexing (fire-and-forget)
8. `storage.upsertMarketResearch()` → write full JSON to `market_research`

---

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/research.ts` | HTTP entry point, config loading, orchestration dispatch |
| `server/ai/research-orchestrator.ts` | N+1 parallel analyst + API validation + Opus synthesis |
| `server/ai/aiResearch.ts` | Tool-calling iteration loop, JSON parsing, streaming |
| `server/ai/research-client.ts` | Multi-vendor LLM abstraction (Anthropic/OpenAI/Gemini) |
| `server/ai/research-resources.ts` | Skill loading, CONFIDENCE_PREAMBLE, tool definitions |
| `server/ai/research-tool-prompts.ts` | 15 prompt-builder tool implementations |
| `server/ai/research-prompt-builders.ts` | User prompt assembly from context packs |
| `server/ai/context-pack/property-pack.ts` | PropertyContextPack builder |
| `server/ai/context-pack/company-pack.ts` | CompanyContextPack builder |
| `server/ai/guidance/extractor.ts` | Research JSON → GuidanceRecord[] |
| `calc/research/validate-research.ts` | Post-LLM bounds + cross-validation |
| `calc/dispatch.ts` | Deterministic tool registry (10 research tools) |
| `server/researchSeeds.ts` | 25+ regional seed profiles |
| `client/src/components/property-research/useResearchStream.ts` | SSE hook |
| `client/src/components/ui/research-badge.tsx` | Amber badge component |
| `client/src/components/research/ResearchBadgePopover.tsx` | Apply / Details / Ask Rebecca |
| `client/src/pages/PropertyEdit.tsx` | 3-tier merge logic (lines 97–150) |

---

## Invariants

1. **LLMs never compute numbers** — all arithmetic goes through deterministic calc tools
2. **Research never auto-applies** — user must explicitly click "Apply Value"
3. **Source tracking is mandatory** — every badge entry has `source: "seed" | "ai" | "none"`
4. **Asset type is dynamic** — never hardcode "boutique hotel"; always use `propertyLabel`
5. **Validation warnings don't block** — invalid/suspect values are flagged, not rejected
6. **AI overrides seed** — AI values take precedence in the 3-tier merge
7. **Badge hides when source="none"** — `ResearchBadge` returns null for falsy display values
8. **Cost bases must match** — different costs have different bases (Room Rev vs Total Rev vs Property Value)
9. **Admin config is respected** — disabled research types are blocked at the route level before any LLM is called
10. **Pinecone indexing is async** — research result storage never waits for Pinecone
