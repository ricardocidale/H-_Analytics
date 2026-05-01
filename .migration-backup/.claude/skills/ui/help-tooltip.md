# HelpTooltip — In-App Field Help System

> **See also**: [`info-icons.md`](info-icons.md) — the `InfoTooltip` component (ℹ icon) for read-only values and calculated metrics. Use HelpTooltip (?) for "what should I do here?" on inputs, and InfoTooltip (ℹ) for "what does this mean?" on displayed values.

## Purpose
The `HelpTooltip` component provides contextual help for every input field across the application. It displays a `?` icon next to field labels that reveals an explanatory tooltip on hover or click. Optionally links to the relevant Checker Manual section.

## Component Location
`client/src/components/ui/help-tooltip.tsx`

## API

```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";

<HelpTooltip
  text="Explanation of the field"   // Required — plain-text help content
  light={false}                      // Optional — use true on dark backgrounds
  side="top"                         // Optional — "top" | "bottom" | "left" | "right"
  manualSection="global-assumptions" // Optional — links to CheckerManual section id
  manualLabel="See Global Assumptions" // Optional — custom link text
/>
```

### Props
| Prop            | Type    | Default                     | Description |
|-----------------|---------|-----------------------------|-|
| `text`          | string  | —                           | Help text shown in the tooltip popup |
| `light`         | boolean | `false`                     | Sage green icon on light backgrounds; white icon on dark backgrounds |
| `side`          | string  | `"top"`                     | Preferred tooltip direction. Radix auto-flips if clipped by viewport. |
| `manualSection` | string  | —                           | Section id in CheckerManual.tsx. Renders a clickable link to `/checker-manual#{id}`. |
| `manualLabel`   | string  | `"Learn more in the Manual"` | Custom text for the manual link. Only used when `manualSection` is set. |

### Available Manual Sections
These are the valid `manualSection` ids (defined in CheckerManual.tsx `sections` array):
| Section ID | Title |
|---|---|
| `app-overview` | 1. Application Overview |
| `mgmt-company` | 2. Management Company |
| `property-portfolio` | 3. Property Portfolio (SPVs) |
| `global-assumptions` | 4. Global Assumptions |
| `property-assumptions` | 5. Property-Level Assumptions |
| `cashflow-streams` | 6. Cash Flow Streams |
| `financial-statements` | 7. Financial Statements |
| `export-system` | 8. Export System |
| `design-config` | 9. Design Configuration |
| `scenario-mgmt` | 10. Scenario Management |
| `my-profile` | 11. My Profile |
| `dashboard-kpis` | 12. Dashboard & KPIs |
| `ai-research` | 13. AI Research & Calibration |
| `property-crud` | 14. Property CRUD & Images |
| `testing-methodology` | 15. Testing Methodology |
| `property-formulas` | 16. Property Financial Formulas |
| `company-formulas` | 17. Management Company Formulas |
| `consolidated-formulas` | 18. Consolidated Portfolio Formulas |
| `investment-returns` | 19. Investment Returns (DCF/FCF/IRR) |
| `funding-financing` | 20. Funding, Financing & Refinancing |
| `glossary` | 21. Glossary |

## Implementation Details
- Built on top of Radix UI `Tooltip` via shadcn (`@/components/ui/tooltip`)
- Uses portal rendering for proper z-index stacking
- Collision-aware: auto-repositions when tooltip would clip viewport edges
- 200ms delay before showing to prevent accidental triggers
- Accessible: `aria-label="Help"`, keyboard focusable with visible focus ring
- Test IDs: `help-tooltip-trigger`, `help-tooltip-content`, `help-tooltip-manual-link`
- Manual link uses `ExternalLink` icon from lucide-react, 10px text, subtle color

## Placement Patterns

### Next to a Label (most common)
```tsx
<Label className="flex items-center gap-1">
  Field Name <HelpTooltip text="What this field does" />
</Label>
```

### With manual section link
```tsx
<Label className="flex items-center gap-1">
  Exit Cap Rate
  <HelpTooltip
    text="Cap rate used to calculate terminal value at disposition."
    manualSection="investment-returns"
    manualLabel="See IRR methodology"
  />
</Label>
```

### Section-level help (standalone)
```tsx
<h3 className="flex items-center gap-2">
  Section Title
  <HelpTooltip text="Overview of this entire section" />
</h3>
```

### Co-located with ResearchBadge
When a field has both a tooltip and AI research data, place the `HelpTooltip` first (inside the label) and the `ResearchBadge` after the input:
```tsx
<Label className="flex items-center gap-1">
  ADR <HelpTooltip text="Average Daily Rate..." />
</Label>
<Input ... />
<ResearchBadge field="startAdr" ... />
```

## Writing Tooltip Text

### GAAP-Standardized Fields
For values mandated by regulation or accounting standards, cite the authority and note they are not subjective:
- "Depreciation uses 27.5-year straight-line per IRS Publication 946 for residential rental property."
- "Room revenue uses 30.5 days per month — hospitality industry standard for annualizing."

### Market-Variable Fields
For values that depend on market conditions or user judgment, describe what the field controls and provide typical ranges:
- "Annual interest rate on the acquisition loan. Market rates vary; currently 6–8% for commercial hospitality loans."
- "Expected annual inflation rate. The Federal Reserve targets 2% annually."

### Switches and Toggles
Explain the consequence of enabling/disabling:
- "Whether target properties include Food & Beverage operations like restaurants and bars."

## When to Add manualSection
- Add to tooltips that explain financial calculations or formulas (formula verification is the manual's primary purpose)
- Add to tooltips for key assumptions that affect multiple calculations
- Do NOT add to every tooltip — only where a manual link provides real verification value
- Settings/CompanyAssumptions page tooltips explaining settings concepts can link to `global-assumptions` or `company-formulas`

## Coverage

### Current Usage (all fields covered)
| Page | Count | Includes |
|------|-------|----------|
| `Settings.tsx` | 41 | Portfolio profile, financing defaults, macro assumptions, branding, AI model, calc transparency |
| `PropertyEdit.tsx` | 52 | Revenue, costs, financing, exit, staffing, events, F&B, wellness |
| `CompanyAssumptions.tsx` | 36 | Start date, company name, logo, fees, compensation, overhead, taxes |
| `Dashboard.tsx` | 5 | NOI, debt service, cash flow |
| `InvestmentAnalysis.tsx` | 12 | Total equity, exit value, equity multiple, cash-on-cash, FCFE, BTCF, ATCF, IRR |
| `PropertyDetail.tsx` | 4 | NOI, debt service, cash flow, PP&E schedule |

### Mandatory Rule
Every user-facing input field **must** have a `HelpTooltip`. When adding new fields, always add a corresponding tooltip.

## Do Not
- Do not create local `HelpTooltip` functions inside page components — always import the shared component
- Do not use the old absolute-positioned custom tooltip approach
- Do not skip tooltips on any input field, even toggles and sliders
- Do not add `manualSection` to tooltips where the manual link would not help with verification
- Do not use `HelpTooltip` (?) for read-only values or calculated metrics — use `InfoTooltip` (ℹ) instead (see `info-icons.md`)
