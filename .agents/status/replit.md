# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T17:30:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

fix: apply min-w-0/shrink-0 flex overflow discipline to Property Edit and Company Assumptions

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
