---
domain: research
scope: architecture
priority: critical
---

# Intelligence Pipeline — Complete Architecture

This is the definitive reference for the entire research/intelligence engine.
Use when explaining to investors, modifying any part of the pipeline, or
onboarding developers.

---

## The Unfair Advantage

Traditional hospitality pro-formas use static assumptions. Our app has:
1. **Pre-collected market data** (7 DB tables, 475+ data points, instant lookup)
2. **Deterministic calculation tools** (11 pure functions the LLM calls for exact math)
3. **N+1 multi-model synthesis** (Gemini + Claude in parallel, Claude Opus synthesizes)
4. **Progressive relaxation** (L0-L5 comparable set expansion until evidence threshold met)
5. **Dual-access data** (relational DB for tools + pgvector rows for RAG)
6. **Self-improving flywheel** (every research run discovers data → stored → next lookup is instant)

---

## Pipeline Flow — 7 Stages

### Stage 1: Gather Pre-Collected Facts (instant, free)
**File:** `server/ai/benchmark-lookups.ts`

Before any LLM runs, query 7 DB tables:

| Table | Data | Records |
|---|---|---|
| `market_adr_index` | ADR, occupancy, RevPAR by market/quarter/tier | 12 markets |
| `seasonal_calendars` | 12-month demand curves by market | 6 markets × 12 months |
| `event_calendars` | Demand-driving events (Feria de las Flores, Sundance, etc.) | 30+ events |
| `labor_rates` | Hospitality wages by market/role | 40+ roles |
| `fb_benchmarks` | F&B cost ratios and revenue metrics | 8+ market/type combos |
| `hospitality_benchmarks` | 21 industry metrics (STR, CBRE, HVS data) | 21 metrics |
| `airport_distances` | Per-property airport proximity | Per-property |

Smart Data Router (`data-routing.ts`) checks these as **Priority 0** before any API.

### Stage 2: Build Entity Context Pack (instant)
**Files:** `server/ai/context-pack/property-pack.ts`, `types.ts`

Assembles everything known about the property into a structured object:
- Identity (name, stable key)
- Location (address, lat/lng, market)
- Classification (star rating, hospitality type, business model, composite label)
- Physical character (room count, amenity detection via regex)
- Revenue profile (ADR, occupancy, ramp, revenue shares)
- Cost profile (11 USALI cost rate fields)
- Capital structure (purchase price, LTV, debt terms, exit cap)
- ICP alignment (0-100 match score against ICP config)
- Full narrative summary (formatted text for prompt injection)

### Stage 3: Find Comparable Properties (2-5 seconds)
**Files:** `server/ai/comparables/relaxation-engine.ts`, `query-builder.ts`, `web-enricher.ts`

**Progressive Relaxation** — loosens search criteria until evidence threshold is met:

| Level | Criteria | Example |
|---|---|---|
| L0 | Exact city + type + star | Medellín luxury boutique 5-star |
| L1 | Relax property type | Medellín luxury hotel (any type) |
| L2 | Relax geography | Medellín metro area |
| L3 | Relax quality tier | Medellín upscale+ |
| L4 | Relax to state/region | Antioquia department |
| L5 | Relax to country | Colombia |

Queries both local DB and pgvector in parallel at each level. Star guard (±1 star), business model boost (+15%), evidence score formula:

`0.30×countScore + 0.25×avgSimilarity + 0.20×constraintStrength + 0.15×diversityBonus + 0.10×businessModelAlignment`

If still below minimum comps, supplements via web research (50% evidence weight).

### Stage 4: Inject All Data into Prompt
**Files:** `server/ai/prompt/assemble-research-prompt.ts`, `benchmark-injector.ts`, `research-data-injector.ts`

The assembled prompt contains:
1. **Domain preamble** — boutique hospitality conversion specialist identity
2. **Entity context** — the full context pack
3. **Pre-collected benchmarks** — from Stage 1, marked as "primary evidence"
4. **Verified market data** — from Smart Data Router API calls, grouped by confidence
5. **Comparable properties** — from Stage 3, formatted with provenance
6. **Prior research** — from pgvector RAG (similar past research)
7. **FRED macro data** — ambient-refreshed treasury yields, CPI, mortgage rates
8. **Business model guidance** — VRBO/Lodge/Hotel-specific benchmark ranges
9. **Research instructions** — which assumptions to analyze (Tier 1 = all, Tier 2 = specific)
10. **Output schema** — JSON format the LLM must return

### Stage 5: N+1 Multi-Model Research (20-60 seconds)
**Files:** `server/ai/research-orchestrator.ts`, `aiResearch.ts`, `research-client.ts`

**Phase 0 — Comparable Set** (2-5s)
Progressive relaxation builds the comp set.

**Phase 1 — Parallel Analyst Panels** (10-30s)
Two LLMs run concurrently with the same prompt but different analytical angles:
- **Analyst A** (Gemini 2.5 Flash) — quantitative analysis: metrics, benchmarks, math
- **Analyst B** (Claude Sonnet) — market strategy: qualitative factors, risks, opportunities
Both use agentic tool-use loops (up to 10 iterations) calling deterministic calc tools.

**Phase 2 — Cross-Validation** (2-5s)
Panel outputs are validated against live API data (Xotelo, CoStar, FRED).
Discrepancies are flagged for the synthesis model.

**Phase 3 — Synthesis** (5-15s, streaming)
Claude Opus reads all three inputs (Panel A + Panel B + API validation) and produces
the final recommendation with ranges, confidence levels, source citations, and reasoning.
Streamed to the client via SSE for real-time display.

**Post-Processing:**
- Research results indexed to pgvector (`research-history` namespace)
- Assumption guidance extracted and stored in `assumption_guidance` table
- Each field validated against benchmarks via `validateAssumptionRange()`

### Stage 6: Extract & Validate Guidance
**Files:** `server/ai/guidance/extractor.ts`, `server/ai/benchmark-lookups.ts`

The LLM's JSON output is parsed into structured guidance records:
- 20+ property field mappings (ADR, occupancy, cost rates, cap rates...)
- 22 company field mappings (fees, staffing, overhead, tax...)
- Sanity bounds (30+ named bounds: ADR $30-$5000, cap rate 2-20%...)
- Cross-field rules (high cap rate + high occupancy = suspicious)
- Confidence/range-width reconciliation ("high" with >30% spread → downgrade)

Each field then validated by `validateAssumptionRange()`:
- `within` → High conviction, green Analyst Note
- `above`/`below` → Moderate conviction, amber note with explanation
- `no_data` → Developing conviction, gray note

### Stage 7: Score Confidence
**File:** `server/ai/confidence-scorer.ts`

7-factor weighted score (0-100):

| Factor | Weight | Source |
|---|---|---|
| Comparable count | 22% | How many matching comps found |
| Comparable quality | 22% | Evidence score from relaxation engine |
| Source recency | 13% | Age of most recent data |
| Relaxation level | 13% | How far criteria were loosened |
| Cross-validation | 10% | Do multiple sources agree? |
| Field coverage | 10% | % of critical fields with data |
| Source availability | 10% | Are FRED/Anthropic/pgvector healthy? |

Thresholds: ≥80 = High, ≥50 = Moderate, ≥20 = Developing, <20 = None

---

## The 11 Deterministic Calc Tools

Pure functions (no I/O) the LLM calls via tool_use during research:

| Tool | What It Computes |
|---|---|
| `compute_property_metrics` | Full annual P&L: room revenue, F&B, events, all costs, NOI, RevPAR |
| `compute_depreciation_basis` | IRS depreciable basis, monthly + annual straight-line |
| `compute_debt_capacity` | Max loan from NOI and target DSCR |
| `compute_occupancy_ramp` | Month-by-month schedule: start → stabilization |
| `compute_adr_projection` | Yearly ADR and RevPAR with growth rate |
| `compute_cap_rate_valuation` | Property value from NOI ÷ cap rate + sensitivity table |
| `compute_cost_benchmarks` | % rates → dollar amounts for all USALI categories |
| `compute_make_vs_buy` | TCO: in-house vs outsource with NPV |
| `compute_service_fee` | Expected fee range from industry benchmarks |
| `compute_markup_waterfall` | Vendor cost → fee → gross profit → margin |
| `validate_research` | Cross-validate research values against sanity bounds |

Registered in `calc/dispatch.ts` (33 total tools across Returns, Validation, Analysis, Financing, and Research categories).

---

## 7 pgvector Namespaces

| Namespace | Stores | Used By |
|---|---|---|
| `knowledge-base` | Methodology docs, platform guides | Rebecca RAG |
| `research-history` | Completed research results | Orchestrator (prior knowledge), comps engine |
| `comparables` | Benchmark snapshots (ADR, occupancy, cap rates) | Relaxation engine, market data indexing |
| `assumption-guidance` | Validated ranges (Low/Mid/High) per field | Guidance retrieval for similar properties |
| `documents` | Chunked property PDFs/OMs | Document search |
| `scenarios` | Financial scenario summaries | Rebecca context |
| `properties` | Property profiles with metadata | Property similarity search |

---

## Ambient Refresh System

Two independent schedulers run in background:

**Benchmark Scheduler** (every 6 hours):
- Fetches 6 FRED series (Fed Funds, 10yr/30yr Treasury, Mortgage30, CPI, Unemployment)
- Upserts to `benchmark_snapshots` table
- Runs source health check after each cycle

**Research Scheduler** (checks every 15 min):
- Finds due `ScheduledResearchWorkflow` records
- Anthropic vendor: batches into Anthropic Batch API (50% cost savings)
- Other vendors: runs synchronously
- Saves results to `market_research` + `research_runs` tables

---

## Multi-Vendor LLM Abstraction

`server/ai/research-client.ts` provides a vendor-agnostic adapter:

| Class | Vendor | Special Features |
|---|---|---|
| `AnthropicResearchClient` | Anthropic | Adaptive thinking for Sonnet/Opus, prompt caching |
| `OpenAIResearchClient` | OpenAI | Tool schema conversion, malformed JSON recovery |
| `GeminiResearchClient` | Google | Schema adaptation (removes additionalProperties) |

Factory: `createResearchClient(vendor, clients)` returns the right adapter.

---

## The Flywheel

```
Property created → research runs → web data discovered
         ↓
Market data extracted → stored in pre-collected tables
         ↓
Next property in same market → instant lookup (no web search needed)
         ↓
Tables accumulate → research gets faster and cheaper → conviction increases
```

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| **Lookups** | `server/ai/benchmark-lookups.ts` | 7 lookup functions + validateAssumptionRange |
| **Routing** | `server/ai/data-routing.ts` | Smart Data Router, 14 services, progressive relaxation |
| **Context** | `server/ai/context-pack/` | Entity context pack builder |
| **Comps** | `server/ai/comparables/relaxation-engine.ts` | Progressive relaxation comparable finder |
| **Prompts** | `server/ai/prompt/assemble-research-prompt.ts` | Full prompt assembly |
| **Injection** | `server/ai/prompt/benchmark-injector.ts` | Benchmark data → prompt text |
| **Orchestrator** | `server/ai/research-orchestrator.ts` | N+1 multi-model pipeline |
| **Research** | `server/ai/aiResearch.ts` | Single-model agentic tool-use loop |
| **Web** | `server/ai/web-research.ts` | Perplexity + Tavily web search |
| **Extraction** | `server/ai/guidance/extractor.ts` | JSON → validated guidance records |
| **Confidence** | `server/ai/confidence-scorer.ts` | 7-factor confidence scoring |
| **Tools** | `calc/research/*.ts` | 11 deterministic calculation tools |
| **Dispatch** | `calc/dispatch.ts` | Tool name → handler registry (33 tools) |
| **pgvector** | `server/ai/vector-store-service.ts` | 7-namespace vector store |
| **Indexing** | `server/ai/vector-indexing.ts` | Domain-specific vector indexing |
| **Seeds** | `server/seeds/market-data-tables.ts` | 475 lines of market benchmark data |
| **Ambient** | `server/ai/ambient/scheduler.ts` | 6-hour FRED + benchmark refresh |
| **Scheduled** | `server/ai/ambient/research-scheduler.ts` | 15-min workflow check + batch API |
| **LLM** | `server/ai/research-client.ts` | Vendor-agnostic LLM adapter |
| **Validation** | `server/ai/research-validation.ts` | Cross-validate panels against APIs |
