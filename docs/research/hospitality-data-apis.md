# Hospitality Data Sources & APIs — Research Summary

## Integration Priority

### Phase 1 — Free, High Value (Immediate)
1. **FRED API** — risk-free rates, CPI, exchange rates, hotel CPI. Free, 120 req/min.
2. **Damodaran (NYU Stern)** — Country risk premiums, industry betas, cost of capital. Free Excel files, stable URLs.
3. **Government stats APIs:**
   - US: BLS (CPI, hotel employment), Census, BEA — all free APIs
   - Colombia: DANE (CPI, GDP), Banco de la República (rates) — free APIs
   - France: INSEE (CPI, hotel occupancy) — free API
   - Spain: INE (hotel occupancy survey, CPI) — free API
   - Canada: Statistics Canada, Bank of Canada Valet API — free
4. **HVS/CBRE free reports** — Manual data entry for dev costs, expense ratios, fee structures

### Phase 2 — Early Paid ($6K–$50K/yr)
5. **AirDNA API** — STR comp data for leisure/resort markets. ~$500–$1K/mo for API.
6. **STR Trend data** — Market-level aggregate Occ/ADR/RevPAR (cheaper than full STAR)
7. **CBRE HOST subscription** — P&L benchmarking. ~$1.5K–$5K/yr.

### Phase 3 — Enterprise (when revenue justifies)
8. **STR API** (full competitive benchmarking) — $5K–$100K+/yr
9. **RCA/MSCI** — Transaction cap rates, price-per-key — $25K–$100K+/yr
10. **CoStar** — Supply pipeline, property details — $20K–$200K+/yr
11. **Transparent (Hotstats)** — Detailed P&L benchmarking — $15K–$50K+/yr

### Phase 4 — Nice to Have
12. **Lighthouse/OTA Insight** — Rate intelligence
13. **Perplexity Sonar API** — Market commentary layer. ~$5–$20/1000 queries.

## Key FRED Series IDs
| Series | Description | Use |
|--------|-------------|-----|
| DGS10 | 10-Year Treasury | Discount rate/cap rate input |
| DGS30 | 30-Year Treasury | Long-term financing |
| MORTGAGE30US | 30-Year Mortgage | Debt cost proxy |
| CPIAUCSL | CPI All Urban | Inflation/escalation |
| CPIHOSSL | CPI Hotels & Motels | Hotel-specific inflation |
| FEDFUNDS | Federal Funds Rate | Base rate environment |

## Damodaran Files (Stable URLs, Annual Update in January)
- `ctryprem.xlsx` — Country risk premiums (190+ countries)
- `betaGlobal.xlsx` — Industry betas (Hotel/Gaming row)
- `wacc.xlsx` — Cost of capital by industry
- `taxrate.xlsx` — Corporate tax rates by country

## Architecture Recommendation
Build a `MarketDataSource` abstraction:
- Source registry table (name, API endpoint, credentials, refresh frequency)
- Series mapping table (external series → internal concept)
- Timestamped value store
- Admin UI for refresh triggers and stale data overrides
- Start with free sources, progressively add paid without changing consumption layer

## Key Limitations
- STR/CoStar data has strict redistribution restrictions — cannot store/show to end users without licensing
- AI search APIs (Perplexity) are good for market commentary but NOT reliable for structured numerical data
- Many best sources (CBRE HOST, Transparent) are PDF/Excel only — no API, manual or scraped
