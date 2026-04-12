---
name: Golden Scenario Testing Methodology
description: How to create, maintain, and run golden scenarios that verify calculation correctness. Based on real properties. Edge cases included. If golden can't reproduce = serious problem.
---

# Golden Scenario Testing

## What Golden Scenarios Are
- Scenarios with KNOWN 100% correct outputs created by the development team
- Locked in database, away from user and admin access
- App tests its own calculations against these known-good results
- If the app cannot reproduce the golden scenario outputs → SERIOUS PROBLEM
- The checker role is QA/testing — largely automated

## Golden Scenarios Based on Real Properties
1. **Medellín duplex** — luxury rental model, COP/USD, per-property-per-night pricing
2. **Cartagena Obra Pía** — hotel model, 50/50 rooms/F&B, Colombian tax/depreciation
3. **New York properties** — estate conversion, hotel model, NY tax, NY liquor
4. **Utah property** — hotel model, restricted liquor, different financing norms

## Edge Cases to Include
- Zero occupancy months (pre-opening period)
- 100% occupancy (capacity ceiling)
- Negative cash flow during ramp-up
- Refinance timing and proceeds
- Properties switched ON/OFF in scenarios
- Rolling up property statements to portfolio consolidated level
- Management company revenue from property fee cascade
- Currency handling (COP vs USD properties in same portfolio)
- Seasonal variation effects on monthly projections
- Multiple properties with different start dates and ramp timelines
- Debt service during pre-opening gap (acquisition before operations start)

## Testing Flow
1. Admin clicks "Run Tests" in Admin Testing section
2. App loads golden scenario inputs from locked DB records
3. Engine runs full calculation pipeline
4. Compares every output to known-correct values
5. Reports: pass/fail per check with details (expected vs actual)
6. Historical results saved for 1+ YEAR (not 7 days)

## What Must Be Verified
- Every calculation in calc/ (37 computation tools)
- Property engine monthly projections (all MonthlyFinancials fields)
- Management company engine (CompanyMonthlyFinancials fields)
- Financial statement generation (income, cash flow, balance sheet — both entities)
- Scenario save/load fidelity (inputs in = same inputs out)
- Intercompany elimination (management fees paid = fees received)
- IRR, NPV, DSCR, equity multiple, exit valuation
- Rounding consistency (no penny drift across 120-month projection)

## Golden Scenario Creation Process
1. Define all inputs precisely (every field, no defaults relied upon)
2. Calculate expected outputs by hand or in verified spreadsheet
3. Cross-check with at least one independent method
4. Lock inputs + expected outputs in DB
5. Version-control the golden data
6. Any code change that shifts outputs must be investigated before deploy
