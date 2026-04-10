# Audit #325 — Client Financial & Dashboard Components

**Auditor:** Opus Code-Review Agent  
**Date:** 2026-04-10  
**Scope:** 125 files, ~18,074 lines across 14 directories  
**Verdict:** PASS — 0 Critical, 1 High, 4 Medium, 5 Low  
**Resilience Score:** 8.6 / 10

---

## Directories in Scope

| Directory | Files | Lines | Purpose |
|-----------|-------|-------|---------|
| `components/dashboard/` | 23 | ~5,200 | Portfolio dashboard tabs, overview, export renderers |
| `components/statements/` | 4 | ~2,400 | Property-level USALI income, cash flow, balance sheet statements |
| `components/financial-table/` | 7 | ~700 | Shared table row primitives (common, expandable, specialized) |
| `components/charts/` | 5 | ~800 | D3 tornado, heatmap, line, bar charts |
| `components/portfolio/` | 3 | ~1,600 | Portfolio management & research cards |
| `components/investment/` | 3 | ~900 | FCF analysis, IRR waterfall, investment returns |
| `components/financing/` | 5 | ~2,000 | DSCR, stress test, debt yield, prepayment, amortization |
| `components/sensitivity/` | 6 | ~1,200 | Sensitivity analysis tables & export hooks |
| `components/scenarios/` | 6 | ~800 | Scenario comparison & sharing dialogs |
| `components/funding/` | 4 | ~600 | SAFE/equity funding analysis |
| `lib/financial/` | 16 | ~25 | Barrel re-exports from `@engine/` |
| `lib/audits/` | 13 | ~2,600 | Client-side GAAP/USALI verification checkers |
| `lib/charts/` | 2 | ~226 | Chart type definitions |
| `dashboard/usePortfolioFinancials.ts` | 1 | 207 | Portfolio financial computation orchestrator |
| `dashboard/useBalanceSheetData.ts` | 1 | 169 | Balance sheet yearly data hook |
| `dashboard/statementBuilders.ts` | 1 | 334 | Export data builders for IS, BS, CF |

---

## T001 — USALI Ordering Compliance ✅ PASS

All three statement components follow the canonical USALI waterfall:

```
Revenue → Departmental Expenses → Undistributed Expenses → GOP →
Management Fees → AGOP → Fixed Charges (Dep + Insurance + Prop Tax) →
NOI → FF&E Reserve → ANOI → Debt Service → Net Income
```

- **YearlyIncomeStatement.tsx** (616L): Full USALI with expandable chevron sections, per-room KPI rows (ADR, RevPAR, Occ%), cross-check validation (ADR × Occupancy = RevPAR).
- **IncomeStatementTab.tsx** (596L): Consolidated multi-property USALI with same ordering, weighted metrics.
- **statementBuilders.ts** (334L): Export data builders maintain USALI order for PDF/Excel/PPTX.

**Assessment:** Outstanding compliance. The waterfall ordering is consistent across display, export, and audit verification layers.

---

## T002 — ASC 230 Cash Flow Statement ✅ PASS

**YearlyCashFlowStatement.tsx** (671L) implements ASC 230 indirect method correctly:

1. **Operating Activities:** Net Income → Add back Depreciation → Add back Interest → Less Tax Adjustment → Operating Cash Flow
2. **Investing Activities:** Capital Expenditures (FF&E Reserve)
3. **Financing Activities:** Debt Service (P+I), Refinancing Proceeds
4. **Net Change in Cash** grand total row

The `CashFlowTab.tsx` dashboard tab aggregates pre-computed server-side values via `.reduce()` across properties — no independent recalculation.

---

## T003 — Balance Sheet Formula Consistency ✅ PASS

Both implementations use identical cash formula:

```
Cash = Operating Reserve + (cumulative ANOI − Debt Service − Tax) + Refi Proceeds
```

- `useBalanceSheetData.ts` line 108: `cash = operatingReserve + operatingCF + refiProceeds`
- `statementBuilders.ts` line 81: `cash = operatingReserve + (cumulativeANOI - cumulativeDebtService - cumulativeTax) + cumulativeRefi`

**Initially suspected variance between export and display — confirmed CONSISTENT.** Both also use the same retained earnings formula: `netIncome - preOpeningCosts`.

---

## T004 — `as any` Usage (4 instances)

| Location | Usage | Justification | Severity |
|----------|-------|---------------|----------|
| `usePortfolioFinancials.ts:67` | `p as any, global as any` | Property/GlobalResponse → engine input types | Medium |
| `exportRenderersPdf.ts:41` | `(doc as any).lastAutoTable` | jsPDF-autotable plugin extends doc | Low |
| `exportRenderersPdfComprehensive.ts:327` | `(doc as any).lastAutoTable` | Same jsPDF plugin pattern | Low |
| `useSensitivityExports.ts:89` | `(doc as any).lastAutoTable` | Same jsPDF plugin pattern | Low |

**Assessment:** 4 total, well within client budget (≤100). The 3 jsPDF casts are unavoidable — the `jspdf-autotable` plugin monkey-patches the doc prototype. The `usePortfolioFinancials` cast (`p as any`) is the only one worth addressing long-term via a shared `PropertyEngineInput` type adapter.

---

## T005 — Catch Block Compliance ✅ PASS

All 10 catch blocks in scope use `catch (e: unknown)` or `catch (error: unknown)`:

- `DSCRTab.tsx` (2 blocks) — `e: unknown`
- `StressTestTab.tsx` (2 blocks) — `e: unknown`
- `PrepaymentTab.tsx` (1 block) — `e: unknown`
- `DebtYieldTab.tsx` (1 block) — `e: unknown`
- `ShareScenarioDialog.tsx` (2 blocks) — `error: unknown`
- 2 `.catch(() => {})` fire-and-forget patterns for non-critical status checks — acceptable best-effort

**Assessment:** Fully compliant with `catch (error: unknown)` rule.

---

## Findings

### HIGH

#### H-001: FormulaDetailRow duplicated 3×
**Files:**
- `financial-table/specialized-rows.tsx:93` (exported, shared)
- `YearlyCashFlowStatement.tsx:36` (local copy)
- `YearlyIncomeStatement.tsx:69` (local copy)

**Impact:** The shared version in `specialized-rows.tsx` is exported and available. The two statement-level copies are functionally identical but use a different prop signature (`colCount` instead of `positive`). This mirrors the same pattern flagged in audit #323 (server export duplication).

**Recommendation:** Consolidate to a single shared component in `financial-table/specialized-rows.tsx` with optional `colCount` prop support. Delete the local copies.

---

### MEDIUM

#### M-001: FCFAnalysisTable props typed as `any[]`
**File:** `investment/FCFAnalysisTable.tsx:10-18`

```typescript
properties: any[];
getYearlyConsolidated: (yearIndex: number) => any;
getPropertyAcquisitionYear: (prop: any) => number;
getPropertyInvestment: (prop: any) => number;
getConsolidatedYearlyDetails: (yearIndex: number) => any;
```

Five `any` types in the props interface. The component itself correctly accesses typed fields (`prop.id`, `prop.name`, `prop.taxRate`, etc.), proving the shape is known.

**Recommendation:** Replace `any[]` with `Property[]` and type the callback return types using existing `YearlyCashFlowResult` / `YearlyPropertyFinancials` types.

---

#### M-002: `data-testid` gap in financial-table/ (0 testids in 6 files)
**Directory:** `components/financial-table/`

The shared row primitives (`common-rows.tsx`, `expandable-rows.tsx`, `specialized-rows.tsx`, `table-shell.tsx`, `balance-sheet-rows.tsx`) contain zero `data-testid` attributes. These components render the core financial data rows used across all statement views.

**Recommendation:** Add `data-testid` to at least the subtotal, grand total, and expandable toggle elements (e.g., `data-testid="subtotal-{label}"`, `data-testid="expandable-toggle-{label}"`).

---

#### M-003: `data-testid` gap in charts/ (2 testids in 5 files)
**Directory:** `components/charts/`

D3 chart components (TornadoDiagram, Heatmap, D3ChartContainer) render entirely via SVG DOM manipulation, making them difficult to test without testids on wrapper elements.

**Recommendation:** Add `data-testid` to chart container `<div>` wrappers (e.g., `data-testid="chart-tornado"`, `data-testid="chart-heatmap"`).

---

#### M-004: CashFlowTab.tsx aggregation complexity
**File:** `dashboard/CashFlowTab.tsx`

Contains 12 separate `.reduce()` aggregation calls (lines 54-124), each iterating `allPropertyYearlyCF` independently per metric per year. While functionally correct and consistent with the T016 rule (aggregating pre-computed server data), this is O(metrics × years × properties) when a single pass per year would suffice.

**Recommendation:** Consolidate into a single loop that computes all 12 metrics per year in one pass. Not a correctness issue — optimization for readability and minor performance.

---

### LOW

#### L-001: PortfolioResearchCard client-side weighted averages
**File:** `dashboard/PortfolioResearchCard.tsx:52-128`

Computes weighted ADR, occupancy, and cap rate from property data directly. These are display-only summaries using property-level seed values (not engine outputs), so this is acceptable for the research overview card.

---

#### L-002: OverviewPerformanceSection Math.min/max clamping
**File:** `dashboard/OverviewPerformanceSection.tsx:67-155`

Uses `Math.min(Math.max(...))` to clamp IRR gauge values to [0, 100] and SVG stroke lengths. This is purely visual — prevents gauge overflow on extreme IRR values.

---

#### L-003: jsPDF `as any` pattern (3 instances)
**Files:** `exportRenderersPdf.ts:41`, `exportRenderersPdfComprehensive.ts:327`, `useSensitivityExports.ts:89`

All three cast `doc as any` to access `lastAutoTable.finalY` — a property injected by the jspdf-autotable plugin at runtime. No typed alternative exists. Acceptable.

---

#### L-004: usePortfolioFinancials `as any` engine input cast
**File:** `dashboard/usePortfolioFinancials.ts:67`

```typescript
const financials = generatePropertyProForma(p as any, global as any, projectionMonths);
```

The `Property` and `GlobalResponse` types don't exactly match engine input types. The cast bridges this gap. A shared adapter type would be better but is not urgent given the `USE_SERVER_COMPUTE` toggle defaults to server-side computation.

---

#### L-005: lib/financial/ barrel re-exports (16 files, ~25 lines total)
**Directory:** `client/src/lib/financial/`

All 16 files are 1-line re-exports from `@engine/` (e.g., `export * from '@engine/debt/loanCalculations'`). This creates a clean abstraction layer between client components and the engine, but the files could be consolidated into a single index.ts barrel.

---

## Positive Observations

### P-001: Outstanding GAAP/USALI Verification System
The `lib/audits/` directory (2,616 lines across 13 files) implements a comprehensive client-side financial verification system:
- **auditIncomeStatement.ts** (272L): Validates Revenue = ADR × Sold Rooms, GOP formula, expense ratios
- **gaapComplianceChecker.ts** (393L): ASC 470/230/360/606 compliance verification with detailed workpaper references
- **crossCalculatorValidation.ts** (545L): Cross-validates IS/BS/CF statement consistency
- **formulaChecker.ts** (362L): Mathematical accuracy verification

This is an impressive dual-verification architecture — server engine + client audit = defense in depth.

### P-002: Financial-table shared component library
Zero `as any`, zero duplication within the 7-file library. Clean typed interfaces with proper tooltip/formula/calc-detail context support. Components handle edge cases (zero suppression, negation, percentage formatting, indent levels).

### P-003: D3 chart components properly typed
`TornadoDiagram.tsx` uses strongly-typed `TornadoVariable` interface, `CHART_COLORS` constant palette, proper `forwardRef` with `useImperativeHandle` for canvas export. No `any` casts in rendering logic.

### P-004: Balance sheet self-verification
`ConsolidatedBalanceSheet.tsx` includes an `isBalanced` flag that checks `totalAssets === totalLiabilitiesEquity` and renders a warning badge when unbalanced — proactive GAAP compliance in the UI.

### P-005: Consistent cash formula across display/export layers
Both `useBalanceSheetData.ts` and `statementBuilders.ts` use identical cash derivation logic, preventing export-vs-display variance.

### P-006: Server-compute toggle architecture
`usePortfolioFinancials.ts` cleanly branches between `USE_SERVER_COMPUTE` (server-side) and client-side calculation paths. The client path includes a per-property LRU cache keyed on `updatedAt` timestamps to avoid unnecessary recalculation.

---

## Summary Table

| Severity | Count | IDs |
|----------|-------|-----|
| Critical | 0 | — |
| High | 1 | H-001 |
| Medium | 4 | M-001 through M-004 |
| Low | 5 | L-001 through L-005 |

**Overall Assessment:** The financial dashboard and statement components demonstrate exceptional GAAP/USALI compliance with consistent formula application across display, export, and verification layers. The FormulaDetailRow duplication (H-001, same issue from #323) and FCFAnalysisTable `any` props (M-001) are the only findings worth addressing near-term. The client-side audit verification system (P-001) provides impressive defense-in-depth beyond what most financial applications implement.
