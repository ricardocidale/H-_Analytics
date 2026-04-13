# Shared Constants & Configuration

## Constants Architecture

Shared constants (used by both client and server) are defined in `shared/constants.ts`. Client-only constants are defined in `client/src/lib/constants.ts`, which re-exports all shared constants. Server files (seed, routes, calculationChecker) import directly from `@shared/constants`.

## Fallback Pattern

The system uses a two-tier fallback for per-property values:

```
property-specific value → DEFAULT constant
```

**Example**:
```typescript
const exitCapRate = property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
const commission = property.dispositionCommission ?? DEFAULT_COMMISSION_RATE;
```

Note: Acquisition Financing, Refinancing, and Disposition Commission are per-property settings. The systemwide assumptions page shows "Defaults for New Properties" which are copied to new properties at creation time but do not affect existing properties.

For projection years specifically:
```typescript
const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
const projectionMonths = projectionYears * 12;
```

## Constant Categories

### Immutable Constants (never change)

These are mandated by external standards and must not be made configurable:

| Constant | Value | Source | Rationale |
|----------|-------|--------|-----------|
| `DEPRECIATION_YEARS` | 27.5 | IRS Pub 946 / ASC 360 | Tax law for residential rental property |
| `DAYS_PER_MONTH` | 30.5 | Industry standard | 365/12 = 30.4167, rounded |

### Default Financial Constants

Used as fallbacks when no user-configured value exists:

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_LTV` | 0.75 (75%) | Loan-to-value ratio for acquisitions |
| `DEFAULT_INTEREST_RATE` | 0.09 (9%) | Annual loan interest rate |
| `DEFAULT_TERM_YEARS` | 25 | Loan amortization period in years |
| `DEFAULT_EXIT_CAP_RATE` | 0.085 (8.5%) | Cap rate for property sale valuation |
| `DEFAULT_TAX_RATE` | 0.25 (25%) | Income tax rate |
| `DEFAULT_COMMISSION_RATE` | 0.05 (5%) | Sales commission on property sale |
| `DEFAULT_REFI_LTV` | 0.65 (65%) | Refinance loan-to-value ratio |
| `DEFAULT_REFI_CLOSING_COST_RATE` | 0.03 (3%) | Refinance closing costs |
| `DEFAULT_ACQ_CLOSING_COST_RATE` | 0.02 (2%) | Acquisition closing costs |
| `DEFAULT_COMPANY_TAX_RATE` | 0.30 (30%) | Company-level tax rate |

### Default Revenue Share Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_REV_SHARE_EVENTS` | 0.18 (18%) | Event revenue as % of total revenue |
| `DEFAULT_REV_SHARE_FB` | 0.30 (30%) | F&B revenue as % of total revenue |
| `DEFAULT_REV_SHARE_OTHER` | 0.03 (3%) | Other revenue as % of total revenue |

### Default Operational Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_EVENT_EXPENSE_RATE` | 0.65 (65%) | Event operating expense rate |
| `DEFAULT_OTHER_EXPENSE_RATE` | 0.60 (60%) | Other revenue expense rate |
| `DEFAULT_UTILITIES_VARIABLE_SPLIT` | 0.60 (60%) | Utilities: % that is variable vs fixed |
| `DEFAULT_CATERING_BOOST_PCT` | 0.00 (0%) | DEPRECATED — catering boost no longer used in revenue calc |

### Default Property Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_ADR_GROWTH_RATE` | 0.03 (3%) | Annual ADR growth |
| `DEFAULT_START_OCCUPANCY` | 0.55 (55%) | Starting occupancy rate |
| `DEFAULT_MAX_OCCUPANCY` | 0.85 (85%) | Maximum occupancy rate |
| `DEFAULT_OCCUPANCY_GROWTH_STEP` | 0.05 (5%) | Occupancy growth increment |
| `DEFAULT_OCCUPANCY_RAMP_MONTHS` | 6 | Months to ramp up occupancy |

### Default Cost Rate Constants (USALI Standard Allocations)

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_COST_RATE_ROOMS` | 0.36 (36%) | Room department costs |
| `DEFAULT_COST_RATE_FB` | 0.32 (32%) | F&B department COGS (USALI: 28-35% for full-service boutique) |
| `DEFAULT_COST_RATE_ADMIN` | 0.08 (8%) | Administrative costs |
| `DEFAULT_COST_RATE_MARKETING` | 0.05 (5%) | Marketing costs |
| `DEFAULT_COST_RATE_PROPERTY_OPS` | 0.04 (4%) | Property operations |
| `DEFAULT_COST_RATE_UTILITIES` | 0.05 (5%) | Utilities costs |
| `DEFAULT_COST_RATE_INSURANCE` | 0.015 (1.5%) | Insurance costs (% of property value) |
| `DEFAULT_COST_RATE_TAXES` | 0.03 (3%) | Property taxes (% of property value) |
| `DEFAULT_COST_RATE_IT` | 0.02 (2%) | IT costs |
| `DEFAULT_COST_RATE_FFE` | 0.04 (4%) | FF&E reserve |
| `DEFAULT_COST_RATE_OTHER` | 0.05 (5%) | Other costs |

### Default Company Cost Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_STAFF_SALARY` | $75,000 | Average annual staff salary |
| `DEFAULT_OFFICE_LEASE` | $36,000 | Annual office lease cost |
| `DEFAULT_PROFESSIONAL_SERVICES` | $24,000 | Annual professional services |
| `DEFAULT_TECH_INFRA` | $18,000 | Annual tech infrastructure |
| `DEFAULT_BUSINESS_INSURANCE_START` | $12,000 | Annual business insurance |
| `DEFAULT_TRAVEL_PER_CLIENT` | $12,000 | Annual travel per client |
| `DEFAULT_IT_LICENSE_PER_CLIENT` | $3,000 | Annual IT licenses per client |
| `DEFAULT_MARKETING_RATE` | 0.05 (5%) | Marketing as % of revenue |
| `DEFAULT_MISC_OPS_RATE` | 0.03 (3%) | Miscellaneous ops as % of revenue |
| `DEFAULT_SAFE_TRANCHE` | $800,000 | Default SAFE funding tranche |

### Projection & Model Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PROJECTION_YEARS` | 10 | Default projection period (configurable 1-30) |
| `PROJECTION_MONTHS` | 120 | PROJECTION_YEARS × 12 |
| `DEFAULT_MODEL_START_DATE` | '2026-04-01' | Fallback model start date |

### Operating Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `OPERATING_RESERVE_BUFFER` | $50,000 | Operating reserve buffer per property |
| `COMPANY_FUNDING_BUFFER` | $100,000 | Company-level funding buffer |
| `RESERVE_ROUNDING_INCREMENT` | $10,000 | Round reserves to nearest increment |

### Staffing Tier Defaults

| Constant | Value | Description |
|----------|-------|-------------|
| `STAFFING_TIERS[0]` | {max: 3, fte: 2.5} | Up to 3 properties → 2.5 FTE |
| `STAFFING_TIERS[1]` | {max: 6, fte: 4.5} | Up to 6 properties → 4.5 FTE |
| `STAFFING_TIERS[2]` | {max: ∞, fte: 7.0} | 7+ properties → 7.0 FTE |

These are now configurable via global assumptions (`staffTier1MaxProperties`, `staffTier1Fte`, etc.)

### Partner Defaults

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_PARTNER_COUNT` | 3 | Default number of partners per year |
| `DEFAULT_REFI_PERIOD_YEARS` | 3 | Default refinance period (years after ops start) |

```typescript
DEFAULT_PARTNER_COMP = [
  540000, 540000, 540000,  // Years 1-3
  600000, 600000,           // Years 4-5
  700000, 700000,           // Years 6-7
  800000, 800000,           // Years 8-9
  900000                    // Year 10
]
```

### Presentation & Audit Thresholds

| Constant | Value | Description |
|----------|-------|-------------|
| `IRR_HIGHLIGHT_THRESHOLD` | 0.15 (15%) | IRR above this shows as accent color |
| `AUDIT_VARIANCE_TOLERANCE` | 0.01 (1%) | Max % variance before audit finding |
| `AUDIT_DOLLAR_TOLERANCE` | $100 | Max dollar variance before audit finding |
| `AUDIT_VERIFICATION_WINDOW_MONTHS` | 24 | Months of data to sample for audit |
| `AUDIT_CRITICAL_ISSUE_THRESHOLD` | 3 | Critical issues before ADVERSE opinion |

## Consumers

Files that import from `constants.ts`:

| Consumer | What It Uses |
|----------|-------------|
| `financial/property-engine.ts` | All constants for property pro-forma calculations |
| `financial/company-engine.ts` | Constants for company pro-forma calculations |
| `financialAuditor.ts` | Constants for GAAP audit validation |
| `runVerification.ts` | Constants for verification checks |
| `loanCalculations.ts` | Re-exports loan-related constants |
| `Dashboard.tsx` | PROJECTION_YEARS for dynamic projection period |
| `PropertyDetail.tsx` | PROJECTION_YEARS, DEFAULT_LTV for display |
| `Company.tsx` | PROJECTION_YEARS, STAFFING_TIERS for company model |
| `CompanyAssumptions.tsx` | Various defaults for form validation |
| `PropertyEdit.tsx` | Cost rate defaults for form fields |
| `ConsolidatedBalanceSheet.tsx` | PROJECTION_YEARS for table columns |

## Server-Side Constants

`server/calculationChecker.ts`, `server/seed.ts`, and `server/routes.ts` all import shared constants from `@shared/constants`. This eliminates the need to manually sync values between client and server. Only loan-specific constants (`DEFAULT_LTV`, `DEFAULT_INTEREST_RATE`, `DEFAULT_TERM_YEARS`) remain as local constants in `calculationChecker.ts`.

## Adding New Constants

### Shared constants (used by both client and server)

1. Add the constant to `shared/constants.ts` (single source of truth)
2. Re-export it from `client/src/lib/constants.ts` via the `export { ... } from "@shared/constants"` block
3. Import it in server files (`server/seed.ts`, `server/routes.ts`, `server/calculationChecker.ts`) from `@shared/constants`
4. If it's a configurable value, add the database column to `shared/schema.ts`
5. Update seed endpoints in `server/routes.ts` and `server/seed.ts` with the named constant
6. Add UI controls to the appropriate assumptions page
7. Update consumers to use the fallback pattern
8. Update this documentation

### Client-only constants (UI thresholds, presentation, staffing tiers)

1. Add the constant to `client/src/lib/constants.ts` directly (below the shared re-exports)
2. These do NOT go in `shared/constants.ts` — they are not needed by the server
3. Examples: `STAFFING_TIERS`, `AUDIT_VARIANCE_TOLERANCE`, `IRR_HIGHLIGHT_THRESHOLD`, `DEFAULT_PARTNER_COMP`

### Server-local constants (verification independence)

Only `PROJECTION_YEARS`, `DEFAULT_LTV`, `DEFAULT_INTEREST_RATE`, and `DEFAULT_TERM_YEARS` remain as local constants in `server/calculationChecker.ts`. All other constants are imported from `@shared/constants`.

## Commission Rate Fields

The `global_assumptions` table has two commission-related fields that both represent **property sale commission**:

| Field | Section | Used By |
|-------|---------|---------|
| `commissionRate` | Portfolio settings | Dashboard, Settings, YearlyCashFlowStatement |
| `salesCommissionRate` | Exit & Sale Assumptions | CompanyAssumptions, SensitivityAnalysis |

Both default to `DEFAULT_COMMISSION_RATE` (5%). Dashboard.tsx uses `commissionRate ?? salesCommissionRate ?? DEFAULT_COMMISSION_RATE` as fallback chain. These are the same concept — property sale brokerage commission — surfaced in two UI locations.
