# Screen–Export Parity Rule

## Rule

On-screen financial numbers and exported numbers (PDF, Excel, PPTX, PNG, CSV, DOCX) MUST derive from the **same data path**. If a user sees $X on screen, every export format must show $X.

## Cash Derivation — Three Authoritative Locations

All three MUST use the identical formula:

```
operatingCashFlow = cumulativeANOI − debtService − incomeTax
cash = operatingReserve + operatingCashFlow + refinancingProceeds
```

| Location | File | Purpose |
|----------|------|---------|
| On-screen (consolidated) | `ConsolidatedBalanceSheet.tsx` | Dashboard balance sheet display |
| On-screen (dashboard tab) | `BalanceSheetTab.tsx` | Dashboard Balance Sheet tab |
| Export (portfolio) | `statementBuilders.ts` | PDF/PPTX/PNG/CSV portfolio exports |
| Export (single property) | `property-sheets.ts` | Excel single-property export |

**Critical**: All four MUST use `m.anoi`, never `m.noi`. NOI overstates cash by cumulative FF&E reserve.

## DSCR Formula

DSCR = ANOI / Total Debt Service (interest + principal)

Must match in:
- `YearlyIncomeStatement.tsx` (property detail)
- `IncomeStatementTab.tsx` (dashboard)
- `statementBuilders.ts` (exports)
- `property-sheets.ts` (Excel)

## Cash Flow Sections (ASC 230)

Single-property exports call `computeCashFlowSections()` from `cashFlowSections.ts`.
Portfolio exports aggregate pre-computed `YearlyCashFlowResult[]` — they do NOT independently reconstruct CFO/CFI/CFF.

## Verification Checklist

When changing any financial calculation:
1. Check all four balance sheet locations use the same formula
2. Check DSCR uses ANOI in all locations
3. Export a single-property Excel — verify BS balances within $1
4. Compare dashboard numbers vs exported PDF numbers for one property
