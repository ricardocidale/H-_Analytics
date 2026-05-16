# Seed Calibration — Demo Portfolio IRR Targets (2026-05-13)

**Plan:** `docs/plans/2026-05-13-001-feat-seed-calibration-bracket-defaults-and-irr-views-plan.md`
**Units completed:** U1, U2, U3, U5, U6, U7, U8 (full plan — all runtime guards applied)
**Target IRR band:** 28–38% (combined levered/equity IRR across the demo INITIAL portfolio)

---

## Purpose

This runbook documents:

1. The calibrated per-property exit cap rates and Medellin Duplex strategic overrides applied by `properties-demo-seed-overrides-001.ts` and `properties-demo-seed-overrides-002.ts`.
2. The rationale for the Duplex's below-market exit cap (7.5%) so future engineers do not "correct" it to the LatAm STR market rate of ~11%.
3. The verified IRR outcomes after calibration.

---

## Property-Level Exit Cap Assignments

All values are Layer-3 per-entity overrides written by `properties-demo-seed-overrides-001`. They flow from the bracket-default substrate (Layer-2 `icp_brackets`) for the six INITIAL properties; the Duplex values are CONFIRMED strategic overrides that deviate from the bracket default.

| Property | Country / Tier | Exit Cap Rate | Source / Rationale |
|---|---|---|---|
| Belleayre Mountain | US tertiary boutique resort | **9.75%** | PwC/CBRE/HVS 2025 H2 going-in + 75bp terminal; Catskills/Northeast mountain market |
| Loch Sheldrake | US tertiary boutique resort | **9.75%** | Same bracket; Catskill mountain market |
| Lakeview Haven Lodge | US tertiary boutique resort | **9.75%** | Same bracket; Ogden Valley, Utah |
| Scott's House | US tertiary boutique resort | **9.75%** | Same bracket |
| Jano Grande Ranch | LatAm rural / illiquid hacienda | **12.00%** | Colombia country-risk premium + illiquidity discount; HVS LatAm 2024 + 200bp spread |
| San Diego (Cartagena) | LatAm prime urban boutique | **10.50%** | CBRE Colombia prime coastal Q4 2024 + 50bp terminal |
| Medellin Duplex | LatAm luxury STR — **strategic override** | **7.50%** | See §"Medellin Duplex Rationale" below |

---

## Medellin Duplex — Strategic Overrides

Two per-entity CONFIRMED overrides on the Duplex deviate from the bracket-default values:

| Field | Bracket default (LatAm luxury STR) | Per-entity override | Rationale |
|---|---|---|---|
| `exit_cap_rate` | ~11.0% | **7.5%** | Package-sale exit to LP / trophy buyer; El Poblado prime residential-hospitality; compressed cap consistent with a single buyer acquiring the asset as part of a Cartagena package. **Do not change to 11% without explicit user directive.** |
| `max_occupancy` | ~0.50 (LatAm luxury STR) | **0.30** | Ultra-luxury $1,500 ADR positioning; 20–35% steady-state occupancy per AirDNA Q1-2026 El Poblado top-decile 2BR STR data. |

Additionally, `properties-demo-seed-overrides-002.ts` applies a full-equity refi rule to the Duplex:
- `will_refinance = 'Yes'` with `refinance_years_after_acquisition = 3`
- Refi LTV 0.75 (capped to 0.70 × purchase price by `refi_max_ltv_to_original`)
- Rate 0.07, term 25 yr, closing cost 3%

This gives the Duplex a modest cash-out refi 3 years post-operations-start (2028-09-01), consistent with the full-equity refi rule established in Plan 2026-05-13-001 U8.

---

## Verified IRR Outcomes

**Verified 2026-05-16** (CC session, full 7-property run via `POST /api/finance/compute`, global modelStartDate=2026-04-01, projectionYears=10).

**Combined portfolio IRR: 35.55% ✓ PASS (target: 28–38%)**

| Property | Levered/Equity IRR | Equity Invested | Exit Value | Notes |
|---|---|---|---|---|
| San Diego (Cartagena) | **51.6%** | $1,950,000 | $16,044,525 | 60% LTV; prime urban boutique; 10.5% exit cap |
| Scott's House | **42.6%** | $2,200,000 | $13,842,131 | 60% LTV; US tertiary resort |
| Lakeview Haven Lodge | **37.7%** | $2,605,000 | $13,581,443 | 65% LTV; lodge; 9.75% exit cap |
| Loch Sheldrake | **37.1%** | $4,550,000 | $7,668,765 | Full-equity + refi; US tertiary resort |
| Belleayre Mountain | **30.4%** | $5,050,000 | $12,165,692 | Full-equity + refi; US tertiary resort |
| Jano Grande Ranch | **29.8%** | $2,050,000 | $5,389,121 | Full-equity + refi; LatAm rural; 12% exit cap |
| Medellin Duplex | **13.5%** | $1,025,000 | $835,067 | Intentionally below band — see §"Medellin Duplex Rationale" |

**Portfolio totals:** Equity invested $19,430,000 · Exit value $69,526,743 · Equity multiple 6.12×

> **Note:** Per-property IRRs above and below the 28–38% band are expected. The target is the combined portfolio IRR (35.55%). Medellin Duplex is intentionally below band by design (ultra-luxury $1,500 ADR, 30% max occupancy, compressed 7.5% exit cap for package-sale exit — do not change). San Diego and Scott's House are above band due to leverage and favorable market positioning — this is acceptable and investor-positive.

---

## Runtime Guard Wiring

Both guards run idempotently on every server boot via `startup/migrations.ts`:

```
properties_demo_seed_overrides_001  →  properties-demo-seed-overrides-001.ts
properties_demo_seed_overrides_002  →  properties-demo-seed-overrides-002.ts
```

Idempotency: `properties-demo-seed-overrides-001` uses `WHERE name = …` (same values on re-run). `properties-demo-seed-overrides-002` is an unconditional UPDATE (same values on re-run). Both are gated by `isMigrationApplied(…)` so they only run once per environment.

---

## Scope Exclusions

SYNC properties (Hudson Estate, Eden Summit, Austin Hillside, Casa Medellín, Blue Ridge Manor) carry independent pipeline assumptions and are intentionally excluded from this calibration. Their exit caps and occupancy ceilings are seeded by their own pipeline data.
