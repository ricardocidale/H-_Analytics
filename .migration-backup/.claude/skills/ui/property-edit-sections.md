# Property Edit Sections

## Architecture
PropertyEdit.tsx is a ~220-line shell that manages queries, mutations, draft state, and section layout. Seven Glass Card sections are extracted into `client/src/components/property-edit/`.

## Prop-Based Pattern
All sections share the same `draft` object (not own data fetching). Props flow down from PropertyEdit:
- `draft` — the mutable property state object
- `onChange(key, value)` — sets a draft field and marks dirty
- `onNumberChange(key, valueStr)` — parses string to number, then sets
- `globalAssumptions` — company-level assumptions from API
- `researchValues` — merged research defaults (generic + DB + AI)

## File Map
| File | Description | Extra Props |
|------|-------------|-------------|
| `types.ts` | `PropertyEditSectionProps`, `ManagementFeesSectionProps`, `OtherAssumptionsSectionProps` | — |
| `BasicInfoSection.tsx` | Name, location, market, address, photo, status, room count | — |
| `TimelineSection.tsx` | Acquisition date, operations start date | — |
| `CapitalStructureSection.tsx` | Purchase price, improvements, financing (LTV, interest, term), refinancing | — |
| `RevenueAssumptionsSection.tsx` | ADR, occupancy, ramp-up, revenue mix | — |
| `OperatingCostRatesSection.tsx` | Cost rates by room revenue, total revenue, property value | — |
| `ManagementFeesSection.tsx` | Fee categories, incentive management fees | `feeDraft`, `onFeeCategoryChange`, `totalServiceFeeRate` |
| `OtherAssumptionsSection.tsx` | Exit cap rate, income tax, sale commission | `exitYear` |
| `index.ts` | Barrel export for all sections + types | — |

## Usage in PropertyEdit.tsx
```tsx
const sectionProps = { draft, onChange: handleChange, onNumberChange: handleNumberChange, globalAssumptions, researchValues };

<BasicInfoSection {...sectionProps} />
<TimelineSection {...sectionProps} />
<CapitalStructureSection {...sectionProps} />
<RevenueAssumptionsSection {...sectionProps} />
<OperatingCostRatesSection {...sectionProps} />
<ManagementFeesSection {...sectionProps} feeDraft={feeDraft} onFeeCategoryChange={handleFeeCategoryChange} totalServiceFeeRate={totalServiceFeeRate} />
<OtherAssumptionsSection {...sectionProps} exitYear={exitYear} />
```

## Key Dependencies
- `@/lib/constants` — all DEFAULT_* values
- `@/lib/loanCalculations` — DEFAULT_LTV, DEFAULT_INTEREST_RATE, etc.
- `@/lib/formatters` — formatMoneyInput, parseMoneyInput
- `@/components/ui/*` — Slider, EditableValue, ResearchBadge, HelpTooltip
- `@/features/property-images` — PropertyImagePicker (BasicInfoSection only)
