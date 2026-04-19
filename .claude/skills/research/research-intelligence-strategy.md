---
name: Research Intelligence Strategy
description: How the AI research engines work, what data sources to use, the tiered approach (N, N+1, N+2), source management, and the "press a button" UX.
---

# Research Intelligence Strategy

## Philosophy
- Research engines ARE the product. "If this section fails, the app fails."
- Cost per run is NOT a concern. Accuracy and elegance ARE.
- The app will be used by just a few people — optimize for quality.

## How Research Works for Users
1. User enters minimum property descriptors (address, rooms, quality tier, size, F&B capacity)
2. User clicks "Regenerate Research" button on any assumption page
3. Engines analyze entity context (ManCo, hotel, luxury rental)
4. Produce: `{ low, mid, high, rationale, sources, confidence }`
5. Display as range badges alongside each variable
6. User accepts (most common) or overrides
7. If engines can't determine a range → badge says "insufficient data" (don't guess)
8. Users press regenerate multiple times as they add more detail — each press improves results

## Engine Tiers
- **N** = base research (structured data, APIs, cached regulatory defaults)
- **N+1** = AI-enhanced (LLM analysis of property context + comp sets + market data)
- **N+2** = deep research (multi-source cross-referencing, confidence scoring, anomaly detection)

## Data Source Priority

### Phase 1 — Free, High Value (Immediate)
1. **FRED API** — risk-free rates, CPI, exchange rates, hotel CPI (free, 120 req/min)
2. **Damodaran (NYU Stern)** — CRP, industry betas, cost of capital (free Excel, stable URLs)
3. **Government APIs:** BLS, Census, BEA (US), DANE/Banco de la República (Colombia), INE (Spain), INSEE (France), Statistics Canada, Bank of Canada
4. **HVS/CBRE free reports** — dev costs, expense ratios, fee structures (manual entry)

### Phase 2 — Early Paid ($6K-$50K/yr)
5. **AirDNA API** — STR comp data for leisure markets
6. **STR Trend data** — market-level aggregate Occ/ADR/RevPAR
7. **CBRE HOST** — P&L benchmarking ($1.5K-5K/yr)

### Phase 3 — Enterprise
8. STR API, RCA/MSCI, CoStar, Transparent

## Source Management (Admin Block 3)
- Sources displayed as cards in admin
- Types: APIs (must work or switch OFF), URLs, RAG files, admin-entered text
- All seeded during development
- Admin tests any source via button click
- App monitors health — flags stale/broken sources automatically
- Timeout logic managed by app for critical sources
- Sources that consistently fail → auto-flagged for admin attention

## Entity Awareness
Engines must know what matters per entity:
- **Management Company:** fee benchmarks, overhead scaling, industry multiples, brand valuation
- **Hotel property:** ADR, occupancy, seasonality, cost structure, comp set, local regulations, conversion costs
- **Luxury rental:** nightly rate, booking patterns, event revenue potential, capacity pricing, comparable listings

## What the Defaults Taxonomy Looks Like
- **Country (law):** depreciation years, income tax, inflation, interest rate benchmarks
- **State/Province (law):** property tax, state income tax
- **City/Municipal (law):** hotel/tourism taxes, cost of capital
- **Research-driven (per property):** ADR, occupancy, cost rates, cap rates, revenue shares, seasonality — NEVER in static defaults tables

## Pre-Collected Data Strategy
Country/state/property-type regulatory data should be collected and cached BEFORE a user needs it. This speeds up per-property research by having the baseline ready.

## pgvector Integration
- 7 namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties
- Use for semantic search across comp sets, benchmarks, research history
- Index: "lb-hospitality", embedding: text-embedding-3-small (1536 dims)
