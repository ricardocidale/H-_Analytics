# Intelligence Pipeline Architecture

End-to-end flow from property creation through research, defaults computation, stress testing, and risk intelligence.

---

## Full Flow Diagram

```
Property base info (rooms, country, model, tier)
        |
        v
computePropertyDefaults()          [engine/helpers/default-resolver.ts]
  (model -> country -> tier -> scale adjustment)
        |
        v
Base assumptions seeded into property record
        |
        v
User clicks "Regenerate Intelligence"
        |
        v
Entity context pack assembled        [server/ai/research-prompt-builders.ts]
  (property profile, location, business model, financial snapshot)
        |
        v
Source health check                   [server/ai/source-health-checker.ts]
  (getHealthySources() -> only include available data sources in prompt)
        |
        v
Domain preamble injected
  ("boutique hospitality conversion specialist, fundraising context")
        |
        v
Dynamic prompt built per research type (N+1 research engines)
  (ADR, occupancy, cap rate, operating costs, tax, market, events, etc.)
        |
        v
Multi-LLM execution                  [primary + fallback per domain]
        |
        v
Guidance extraction & confidence scoring
        |
        v
Range badges displayed next to inputs
  (user sees "Research suggests $180-$220" tooltip)
        |
        v
User accepts or overrides -> Save -> Recalculate financials
```

---

## Default Resolution: 4-Layer Cascade

`computePropertyDefaults()` in `engine/helpers/default-resolver.ts` resolves assumptions through a deterministic cascade. Pure function, no I/O.

| Layer | Source | What it provides | Example |
|-------|--------|-----------------|---------|
| 1. **Business model** | `BUSINESS_MODEL_DEFAULTS[model]` | Cost rates, revenue shares, fee rates | Hotel: rooms cost rate 25%, F&B 35% |
| 2. **Country** | `getCountryDefaults(country)` | Income tax rate, depreciation years, property tax | Colombia: 35% tax, 20yr depreciation |
| 3. **Quality tier** | `QUALITY_TIER_ADR[tier]` / `QUALITY_TIER_OCCUPANCY[tier]` | ADR range (min/max/default), occupancy range | Luxury: ADR $350-$500, occupancy 65-75% |
| 4. **Scale adjustment** | Room count brackets | Cost premium for small properties | <10 rooms: +5% on all cost rates |

**Provenance tracking:** Every resolved value includes a `sources` map showing which layer determined it. Example: `{ "startAdr": "tier:Luxury:range_350-500", "incomeTaxRate": "country:Colombia" }`.

US state overrides refine federal defaults when `country = "United States"` and `stateProvince` is provided.

---

## Research Pipeline

Each research request follows this sequence:

### 1. Entity Context Pack
Assembled from the property record: location (city, state, country), business model, room count, quality tier, target verticals, current assumptions, and financial snapshot.

### 2. Source Health Check
`getHealthySources()` queries the source registry for active, trusted sources. Only these appear in the prompt's "Data Sources Available" block.

### 3. Dynamic Prompt Building
`server/ai/research-prompt-builders.ts` constructs domain-specific prompts. Each prompt includes:
- Domain preamble (boutique hospitality, fundraising context)
- Entity context (property specifics)
- Source block (only healthy sources)
- Regulatory data (country/state licensing, zoning, building codes)
- Output format instructions (JSON with ranges, confidence, citations)

### 4. Multi-LLM Execution
Each research domain has a primary and fallback LLM model. If primary fails, fallback executes automatically. Admin configures model assignments.

### 5. Guidance Extraction
Raw LLM output is parsed into structured guidance records with min/max ranges, recommended values, and source citations.

### 6. Confidence Scoring
7-factor weighted average produces a 0-100 confidence score per guidance record.

---

## Stress Scenarios

`computeStressScenarios()` in `engine/helpers/stress-scenarios.ts`. Pure function, deterministic, no I/O.

| # | Scenario | Shock | What it tests |
|---|----------|-------|---------------|
| 1 | Occupancy -15% | Recession demand drop | Revenue sensitivity to occupancy |
| 2 | ADR -10% | Rate compression | Revenue sensitivity to pricing |
| 3 | Interest Rate +200bps | Refinancing risk | Debt service coverage under rate hikes |
| 4 | Operating Costs +20% | Inflation | Margin resilience to cost increases |
| 5 | Combined (-10% occ, +10% costs) | Stagflation | Dual-shock worst-case |

**DSCR breach detection:** If stressed DSCR falls below 1.25x, the scenario flags a covenant breach. Below 1.0x triggers "critical" severity — property cannot cover debt service.

**Severity classification:** `low` (NOI impact <20%) -> `moderate` (>20%) -> `severe` (DSCR <1.25x) -> `critical` (DSCR <1.0x).

Each scenario generates an investor-grade narrative describing the impact in plain language with formatted currency.

---

## Risk Intelligence

Combines deterministic stress results with optional LLM-generated narratives:

- **Deterministic insights:** Computed from `computeStressScenarios()` output. Always available, zero API cost.
- **LLM narratives:** Optional investor-grade narratives that contextualize stress results with market conditions. Triggered on demand.

---

## Confidence Scoring

7-factor weighted average (0-100 scale):

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| Comparable count | 20% | Number of quality comparables found |
| Data quality | 15% | Source reliability and freshness |
| Recency | 15% | How recent the data points are |
| Relaxation penalty | 10% | Was search criteria relaxed to find results? |
| Cross-validation | 15% | Agreement between multiple sources/models |
| Coverage | 10% | Percentage of requested metrics actually returned |
| Source availability | 15% | Are critical data sources healthy? |

Scores are classified: 80+ = High confidence, 60-79 = Moderate, 40-59 = Low, <40 = Very low.

Exposed via `/api/research/confidence` endpoint and embedded in guidance API responses.
