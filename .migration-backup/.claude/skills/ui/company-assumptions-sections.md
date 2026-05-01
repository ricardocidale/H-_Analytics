# Company Assumptions Sections

## Location
`client/src/components/company-assumptions/`

## Overview
Extracted from `client/src/pages/CompanyAssumptions.tsx` (1,226 → ~200 lines).
12 glassmorphism card sections sharing `formData` state via props.

## Components

| Component | Description |
|---|---|
| `EditableValue` | Reusable inline editable numeric display (percent/dollar/number) |
| `CompanySetupSection` | Company name, logo, ops start date, projection years |
| `FundingSection` | SAFE/funding tranches (amount, date), valuation cap, discount rate |
| `ManagementFeesSection` | Read-only per-property fee rate reference table |
| `CompensationSection` | Staff salary, staffing tiers (3 tiers with max properties + FTE) |
| `FixedOverheadSection` | Escalation rate, office lease, professional services, tech, insurance |
| `VariableCostsSection` | Travel/IT per client, marketing rate, misc ops rate |
| `TaxSection` | Company income tax rate |
| `ExitAssumptionsSection` | Default exit cap rate, sales commission rate |
| `PropertyExpenseRatesSection` | Event expense rate, other expense rate, utilities variable split |
| `CateringSection` | Read-only catering revenue model info |
| `PartnerCompSection` | Partner compensation schedule by year (10 years) |
| `SummaryFooter` | Escalation summary text |

## Shared Types (`types.ts`)

```typescript
interface CompanyAssumptionsSectionProps {
  formData: Partial<GlobalResponse>;
  onChange: <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => void;
  global: GlobalResponse;
}
```

Extended interfaces add: `isAdmin`, `properties`, `allFeeCategories`, `researchValues`, `modelStartYear`.

## Barrel Export
`import { CompanySetupSection, FundingSection, ... } from "@/components/company-assumptions";`

## Pattern
Each section is a self-contained glassmorphism card with blur decorations.
The parent shell (`CompanyAssumptions.tsx`) manages queries, mutations, formData state, and layout.
