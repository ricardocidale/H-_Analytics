# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T17:30:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(#1626): Playwright narrow-layout squeeze regression — all 6 tests pass

## What Replit Did This Session

Audited and fixed all flex-row label overflow in Property Edit and Company Assumptions pages.
Applied `min-w-0` on label/left side and `shrink-0` on value/control side in all
`flex justify-between items-center` rows across:

**Company Assumptions:**
- FixedOverheadSection.tsx (5 rows)
- VariableCostsSection.tsx (3 rows)
- CompensationSection.tsx (staffSalary row)
- CostOfEquityCard.tsx (costOfEquity row)
- FundingSection.tsx (6 CapitalRaisesCard rows + 6 ConvertibleTermsCard rows; Select wrapped in span)

**Property Edit:**
- ManagementFeesSection.tsx (fee-category rows + incentive fee row)
- OperatingCostRatesSection.tsx (Total Allocation, Housekeeping, F&B, Admin, PropertyOps, Utilities, FF&E, Other, Marketing, IT, Property Taxes, Insurance — 12 rows)
- RevenueAssumptionsSection.tsx (ADR, ADR Growth, Starting Occupancy, Stabilized Occupancy, Occupancy Ramp, Occupancy Growth Step, Events, F&B, Other, Catering — 10 rows)
- OtherAssumptionsSection.tsx (Exit Cap Rate, Income Tax Rate, Inflation Rate, Sale Commission, Country Risk Premium — 5 rows)
- CapitalStructureSection.tsx (Cost Segregation toggle, Acq LTV, Acq Interest Rate, Acq Loan Term, Acq Closing Costs, Refi Years After Acq, Refi LTV, Refi Interest Rate, Refi Loan Term, Refi Closing Costs — 10 rows)

Typecheck passes clean (0 errors).

Task #1626 — Completed the Playwright narrow-layout squeeze regression guard:
- Created `tests/layout/` workspace package (`@workspace/tests-layout`)
  - `playwright.config.ts` — resolves Nix Chromium (Replit) or Playwright-installed (CI);
    falls back to undefined so `playwright install --with-deps chromium` works on Ubuntu CI
  - `fixtures/narrow-layout.html` — self-contained HTML fixture with a PROTECTED card
    (min-w-0 label + shrink-0 chip wrapper) and a REGRESSION card (rigid nowrap label
    + min-width:0/flex-shrink:1 chip) at 246 px inner width simulating one column of a
    2-column grid at 768 px
  - `tests/narrow-layout.spec.ts` — 6 Playwright tests; per-format minimum thresholds:
    percent ≥ 40 px, dollar ≥ 40 px, number ≥ 15 px; regression control asserts
    unprotected chip ≤ 35 px (measured ~30 px vs protected ~56 px)
- Added `tests/*` to `pnpm-workspace.yaml`
- Added `layout-tests` CI job to `.github/workflows/ci.yml` (installs Playwright Chromium
  with `--with-deps`, runs the 6 Playwright tests on ubuntu-latest)
- Kept complementary source-level test `narrow-layout-squeeze.test.ts` (18 vitest tests)
  in the portal package — all 397 portal tests still pass

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

None pending.

## Pending Replit Work

- U3 UI: Add refi LTV cap field to `DebtSection.tsx` — blocked on CC completing Phase 5 engine wiring

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
