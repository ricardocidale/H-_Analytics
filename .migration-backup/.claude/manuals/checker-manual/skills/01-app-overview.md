# Chapter 1: Application Overview

## The H+ Analytics by Norfolk AI Business Simulation Portal

The H+ Analytics by Norfolk AI Business Simulation Portal is a full-stack financial modeling platform purpose-built for a boutique hotel management company. It enables real-time financial simulation, multi-year projection, and scenario analysis for hospitality business planning across a portfolio of luxury boutique hotels in North America and Latin America.

The platform provides the following core capabilities:

- **Financial Simulation** at monthly granularity across a configurable projection horizon (default 10 years), producing USALI-aligned income statements and GAAP-compliant balance sheets.
- **Projection** of ADR growth, occupancy ramp-up, inflation escalation, debt amortization, and refinancing events.
- **Scenario Analysis** through save/load of complete model snapshots with side-by-side comparison of base case versus alternatives.
- **Sensitivity Analysis** to vary key inputs (ADR, occupancy, cap rate, LTV) and observe their impact on IRR, NOI, and free cash flow.
- **Financing Analysis** to model acquisition debt, refinancing, loan comparisons, DSCR, and debt yield.
- **Investment Return Analysis** including levered and unlevered IRR, equity multiple, cash-on-cash return, and free cash flow waterfalls.

---

## Two-Entity Architecture

The financial model is structured around two distinct legal entity types, consistent with standard real estate private equity fund structures:

| Entity | Legal Form | Role | Financial Statements |
|--------|-----------|------|---------------------|
| **Management Company** | Operating company (OpCo) | Provides hotel management services; earns fees | Income Statement, Cash Flow Statement |
| **Property SPVs** | Special Purpose Vehicles | Each property is an independent SPV holding a single asset | Income Statement (USALI-aligned), Cash Flow Statement, Balance Sheet, FCF, IRR |

The Management Company does not own property. Properties are held in SPVs and pay management fees to the Management Company. This separation follows industry-standard asset-light management structures, consistent with ASC 606 revenue recognition for service contracts.

---

## Target Market

The platform is designed for luxury boutique hotels on private estates, typically characterized by:

- 10 to 80 guest rooms (per the configurable boutique definition)
- Full-service food & beverage (F&B) operations
- Event and catering revenue streams (weddings, corporate retreats, wellness programs)
- Independent ownership (not chain-affiliated)
- Markets across North America and Latin America

---

## Navigation Sections

The application is organized into the following primary areas:

| Section | Purpose |
|---------|---------|
| **Dashboard** | Portfolio KPIs, aggregated financials, charts, and performance summary |
| **Properties** | List of all property SPVs with access to individual property detail and financials |
| **Management Company** | Management Company income statement, cash flow, and fee revenue breakdown |
| **Property Finder** | Search and save prospective acquisition targets from external listing data |
| **Analysis** | Sensitivity tables, financing analysis, loan comparison, DSCR, debt yield, and refinance modeling |
| **Systemwide Assumptions** | Global model parameters affecting all entities (inflation, fees, SAFE funding, staffing, costs) |
| **My Profile** | User account settings and display preferences |
| **My Scenarios** | Saved model snapshots — create, load, compare, and delete scenarios |
| **Help** | Documentation of financial methodology, formulas, and GAAP/USALI references |
| **Administration** | User management, user groups, login logs, session management, verification, activity logs, and system configuration (admin role only) |

---

## Calculation Architecture

All financial calculations execute client-side in the browser using a deterministic financial engine. The key architectural principles are:

- **No hardcoded values.** Every financial parameter is configurable via assumptions at either the global or property level.
- **Centralized defaults as fallbacks only.** Default values serve as fallbacks when no user-configured value exists.
- **Three-tier fallback chain.** The engine resolves each parameter by checking the property-specific value first, then the global assumption, then the system default constant.
- **Deterministic computation.** The same inputs always produce identical outputs. There is no server-side computation for financial projections.
- **Monthly granularity.** All projections are computed at monthly resolution and then aggregated to annual figures for presentation.
- **Real-time recalculation.** Changing any assumption instantly recalculates all dependent financial statements.

---

## Data Export

Every data page in the application supports export functionality in two primary formats:

| Format | Content | Use Case |
|--------|---------|----------|
| **Excel (.xlsx)** | Multi-sheet workbook with formatted financial statements, assumptions, and summary data | Offline analysis, audit trail, investor presentations |
| **CSV (.csv)** | Raw tabular data | Data pipeline integration, spreadsheet import |

The checker should use exports extensively to verify calculations offline against independent spreadsheet models. Export functionality is available from the toolbar on the Dashboard, Property Detail, Management Company, Sensitivity Analysis, and Financing Analysis pages.

---

## Verification Notes

When verifying the application, the checker should follow this general approach:

1. Start by reviewing global assumptions on the Systemwide Assumptions page — these drive every downstream calculation.
2. Compare exported Excel or CSV data against the on-screen presentation to confirm rendering accuracy.
3. Use the Sensitivity Analysis page to stress-test edge cases such as zero occupancy, extreme ADR values, and 100% LTV.
4. Cross-check Management Company fee revenue against the corresponding fee expense on each property's income statement.
5. Verify that the Balance Sheet equation holds — Assets = Liabilities + Equity — for every property in every period.

The complete verification protocol is described in Chapter 15: Testing Methodology.
