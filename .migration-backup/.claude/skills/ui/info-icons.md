# Info Icons — Contextual Clarification System

## Purpose
Whenever a variable, label, heading, metric, or any text element has clarification or additional information available, it **must** display an info icon next to it. This is the universal pattern for surfacing context throughout the app — from form labels to dashboard KPIs to financial statement line items.

## Decision: Which Icon Type to Use

| Scenario | Icon | Component | Reason |
|----------|------|-----------|--------|
| **Form field label** | `?` (HelpCircle) | `<HelpTooltip>` | Explains what to enter and why |
| **Financial metric / KPI** | `ℹ` (Info) | `<InfoTooltip>` | Explains how a value is calculated |
| **Table column header** | `?` or `ℹ` | `<HelpTooltip>` or `<InfoTooltip>` | Defines the column's meaning or formula |
| **Accordion / Section heading** | `ℹ` (Info) | `<InfoTooltip>` | Explains the section metrics and calculation methodology |
| **Financial metric / KPI card** | `ℹ` (Info) | `<InfoTooltip>` | Shows the exact formula (e.g., EM, CoC, IRR) |
| **Abbreviation or acronym** | `ℹ` (Info) | `<InfoTooltip>` | Expands and explains the term |
| **Calculated value in a report** | `ℹ` (Info) | `<InfoTooltip>` | Shows the formula or data source |

### Rule of Thumb
- **`?` (HelpCircle)** — "What should I do here?" → user needs guidance to act
- **`ℹ` (Info)** — "What does this mean?" → user needs understanding of a displayed value

## Components

### 1. HelpTooltip (already exists)
For form inputs. See `skills/ui/help-tooltip.md` for full documentation.

```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";

<Label className="flex items-center gap-1">
  ADR <HelpTooltip text="Average Daily Rate — revenue per occupied room per night." />
</Label>
```

**Location:** `client/src/components/ui/help-tooltip.tsx`

### 2. InfoTooltip (for read-only values, metrics, headers)
For non-input contexts where information is being displayed, not collected.

```tsx
import { InfoTooltip } from "@/components/ui/info-tooltip";

<span className="flex items-center gap-1">
  NOI <InfoTooltip text="Net Operating Income = GOP − Management Fees − FF&E Reserve" />
</span>
```

**Location:** `client/src/components/ui/info-tooltip.tsx`

#### InfoTooltip Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | — | Clarification text (required) |
| `formula` | string | — | Optional formula shown in monospace below the text |
| `light` | boolean | `false` | White icon variant for dark backgrounds |
| `side` | "top" \| "bottom" \| "left" \| "right" | `"top"` | Preferred direction |
| `manualSection` | string | — | Links to Checker Manual section |

## Placement Patterns

### Next to a Label (form input)
```tsx
<Label className="flex items-center gap-1">
  Field Name <HelpTooltip text="..." />
</Label>
```

### Next to a Metric Value
```tsx
<div className="flex items-center gap-1">
  <span className="text-sm text-muted-foreground">Cap Rate</span>
  <InfoTooltip text="Capitalization rate = NOI ÷ Property Value" />
</div>
<span className="text-2xl font-bold">6.8%</span>
```

### Next to a Table Column Header
```tsx
<th className="...">
  <span className="flex items-center gap-1">
    DSCR
    <InfoTooltip text="Debt Service Coverage Ratio = NOI ÷ Annual Debt Service. Must be ≥ 1.25× for most lenders." />
  </span>
</th>
```

### Next to a Financial Statement Line Item
```tsx
<td className="flex items-center gap-1">
  Gross Operating Profit
  <InfoTooltip
    text="Total revenue minus all departmental expenses."
    formula="GOP = Revenue − Rooms Exp − F&B Exp − Admin − Marketing − Property Ops − Utilities"
  />
</td>
```

### Next to a Dashboard KPI Card Title
```tsx
<h4 className="flex items-center gap-1 text-sm text-muted-foreground">
  Portfolio NOI
  <InfoTooltip text="Sum of Net Operating Income across all active properties in the current month." />
</h4>
```

### Next to an Abbreviation Inline
```tsx
<p>
  The property's <span className="inline-flex items-center gap-0.5">
    RevPAR <InfoTooltip text="Revenue Per Available Room = ADR × Occupancy Rate" side="bottom" />
  </span> grew 12% year-over-year.
</p>
```

## Writing Guidelines

### For Formulas and Calculations
Always state the formula explicitly:
- "Net Operating Income = Gross Operating Profit − Management Fees − FF&E Reserve"
- "DSCR = NOI ÷ Annual Debt Service"

### For Industry Terms
Define the term and provide typical ranges:
- "Cap Rate (Capitalization Rate): NOI ÷ Property Value. Typical range for boutique hotels: 6–9%."

### For Assumptions
Clarify the calculation base:
- "Base Management Fee: 5% of Total Property Revenue (room + F&B + events + other)."

### For Toggles and Switches
Explain the consequence:
- "When enabled, refinancing proceeds are distributed to equity investors."

### Tone
- Concise: 1–2 sentences maximum for the primary text
- Specific: name the exact formula or data source
- Neutral: state facts, not opinions

## Mandatory Rules

1. **Every user-facing input field** must have a `HelpTooltip`
2. **Every calculated metric or KPI** displayed to the user should have an `InfoTooltip` explaining its formula
3. **Every abbreviation or acronym** used in the UI should have an `InfoTooltip` on first occurrence per page
4. **Financial statement line items** that are subtotals or derived values should have an `InfoTooltip` showing the formula
5. Never create local tooltip components inside pages — always use the shared components
6. Never skip tooltips on sliders, toggles, or any interactive control
7. When a field has both a tooltip and a `ResearchBadge`, place the tooltip inside the label and the badge after the input

## Testing
- All tooltip triggers must have `data-testid` attributes
- `HelpTooltip`: `help-tooltip-trigger`, `help-tooltip-content`
- `InfoTooltip`: `info-tooltip-trigger`, `info-tooltip-content`
- Tooltips are keyboard-accessible and screen-reader friendly

## Related Skills
- `skills/ui/help-tooltip.md` — Full HelpTooltip API and coverage table
- `skills/ui/calculation-transparency.md` — Broader calc transparency system
- `skills/ui/research-badges.md` — AI research indicators on assumption fields
