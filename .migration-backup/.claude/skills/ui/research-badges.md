# Research Badges

**Component**: `ResearchBadge` (`client/src/components/ui/research-badge.tsx`)

## Golden Rule

**Any page with user-editable assumption fields that have corresponding AI-researched market data MUST show a gold/amber `ResearchBadge` next to the input.** Clicking the badge applies the researched value.

## Import

```tsx
import { ResearchBadge } from "@/components/ui/research-badge";
```

## Props

| Prop        | Type                           | Default   | Description                                |
| ----------- | ------------------------------ | --------- | ------------------------------------------ |
| `value`     | `string \| null \| undefined`  | —         | Display text; renders nothing if falsy      |
| `onClick`   | `() => void`                   | —         | Applies the researched value to the field   |
| `variant`   | `"light" \| "dark"`            | `"light"` | Light for white backgrounds, dark for glass |
| `className` | `string`                       | —         | Additional classes                          |

## Variants

All variants use the `accent-pop` theme variable, ensuring colors adapt to the active theme.

### `light` — White/Cream Backgrounds
- **Text**: `text-accent-pop`, hover `text-accent-pop`
- **Background**: `bg-accent-pop/10`, hover `bg-accent-pop/15`
- **Border**: `border-accent-pop/20`

```tsx
<ResearchBadge value="$350–$450" onClick={() => handleChange("startAdr", "400")} />
```

### `dark` — Glass/Dark Panels
- **Text**: `text-accent-pop`, hover `text-accent-pop`
- **Background**: `bg-accent-pop/10`, hover `bg-accent-pop/20`
- **Border**: `border-accent-pop/30`

```tsx
<ResearchBadge variant="dark" value="5.5%–7.0%" onClick={() => handleChange("capRate", "0.0625")} />
```

## Usage Pattern

Place inline with the field label, to the right:

```tsx
<div className="flex items-center gap-2">
  <label>Starting ADR</label>
  <ResearchBadge
    value={researchValues.adr?.display}
    onClick={() => researchValues.adr && handleChange("startAdr", researchValues.adr.mid.toString())}
  />
</div>
<input value={draft.startAdr} onChange={...} />
```

## Data Source — 3-Tier Hierarchy

Research badge data follows a 3-tier priority system. Each entry has `{ display, mid, source }`:

| Tier | Source | `source` value | Stored In | When Applied |
|------|--------|---------------|-----------|--------------|
| 1 (base) | Location-aware DB seeds | `'seed'` | `properties.research_values` JSONB | Property creation / seed backfill |
| 2 (override) | AI research | `'ai'` | `market_research` table → parsed | "Run Research" button / auto-refresh |
| 3 (fallback) | Generic national averages | (none) | Hardcoded in `PropertyEdit.tsx` | Only when tiers 1 & 2 are absent |

### Merge Logic (PropertyEdit.tsx)

```typescript
// Start with generic national averages
const baseDefaults = { ...GENERIC_DEFAULTS };

// Tier 1: Overlay location-aware DB seeds (skip source='none')
if (property.researchValues) {
  for (const [key, val] of Object.entries(property.researchValues)) {
    if (val.source !== 'none') baseDefaults[key] = val;
  }
}

// Tier 2: Overlay AI research (highest priority)
if (research?.content) {
  const aiValues = parseAIContent(research.content);
  for (const [key, val] of Object.entries(aiValues)) {
    if (val) merged[key] = { ...val, source: 'ai' };
  }
}
```

### Source Tracking

| `source` | Badge visible? | Meaning |
|----------|---------------|---------|
| `'seed'` | Yes | Location-aware industry default from `researchSeeds.ts` |
| `'ai'` | Yes | AI-generated market research |
| `'none'` | No | Explicitly hidden — badge returns null |
| (absent) | Yes | Generic fallback (pre-seed properties) |

### Available Research Fields (25 keys)

| Badge Field | Key | Format Example | Calculation Base |
|-------------|-----|----------------|------------------|
| ADR | `adr` | `"$280–$450"` | — |
| Max Occupancy | `occupancy` | `"70%–82%"` | — |
| Initial Occupancy | `startOccupancy` | `"30%–45%"` | — |
| Ramp-Up Months | `rampMonths` | `"12–24 mo"` | — |
| Cap Rate | `capRate` | `"6.5%–8.5%"` | — |
| Catering Boost (DEPRECATED) | `catering` | `"0%"` | — |
| Land Value | `landValue` | `"15%–25%"` | — |
| Housekeeping | `costHousekeeping` | `"15%–22%"` | Room Revenue |
| F&B CoS | `costFB` | `"7%–12%"` | F&B Revenue |
| Admin & General | `costAdmin` | `"4%–7%"` | Total Revenue |
| Property Ops | `costPropertyOps` | `"3%–5%"` | Total Revenue |
| Utilities | `costUtilities` | `"2.9%–4.0%"` | Total Revenue |
| FF&E Reserve | `costFFE` | `"3%–5%"` | Total Revenue |
| Marketing | `costMarketing` | `"1%–3%"` | Total Revenue |
| IT | `costIT` | `"0.5%–1.5%"` | Total Revenue |
| Other | `costOther` | `"3%–6%"` | Total Revenue |
| Insurance | `costInsurance` | `"0.3%–0.5%"` | Property Value |
| Property Taxes | `costPropertyTaxes` | `"1.0%–2.5%"` | Property Value |
| Svc Fee: Marketing | `svcFeeMarketing` | `"0.5%–1.5%"` | Total Revenue |
| Svc Fee: IT | `svcFeeIT` | `"0.3%–0.8%"` | Total Revenue |
| Svc Fee: Accounting | `svcFeeAccounting` | `"0.5%–1.5%"` | Total Revenue |
| Svc Fee: Reservations | `svcFeeReservations` | `"1.0%–2.0%"` | Total Revenue |
| Svc Fee: General Mgmt | `svcFeeGeneralMgmt` | `"0.7%–1.2%"` | Total Revenue |
| Incentive Fee | `incentiveFee` | `"8%–12%"` | GOP |
| Income Tax | `incomeTax` | `"24%–28%"` | Taxable Income |

### AI Research Parsing Helpers

When AI research exists, raw text is parsed into `{ display, mid }` objects:

```tsx
const parseRange = (rangeStr: string | undefined) => {
  if (!rangeStr) return null;
  const nums = rangeStr.replace(/[^0-9.,\-–]/g, ' ')
    .split(/[\s–\-]+/)
    .map(s => parseFloat(s.replace(/,/g, '')))
    .filter(n => !isNaN(n));
  if (nums.length >= 2) return { low: nums[0], high: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
  if (nums.length === 1) return { low: nums[0], high: nums[0], mid: nums[0] };
  return null;
};

const parsePct = (pctStr: string | undefined) => {
  if (!pctStr) return null;
  const match = pctStr.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
};
```

## HelpTooltip + ResearchBadge Co-Location Rule

**Every user-editable input field MUST have both:**
1. A `HelpTooltip` (? icon) explaining what the field does
2. A `ResearchBadge` (amber/gold) if AI market research data exists for that field

These appear together in the Label row:

```tsx
<Label className="label-text flex items-center gap-1">
  Starting ADR
  <HelpTooltip text="The initial nightly rate charged per room..." />
  <ResearchBadge value={researchValues.adr?.display} onClick={...} />
</Label>
```

### GAAP-Standardized vs. Market-Variable Fields

Some assumptions are regulated by GAAP, IRS, or industry standards and are **not subjective**. Tooltips for these fields should reflect this certainty:

| Field | Authority | Standard Value | Tooltip Guidance |
|-------|-----------|---------------|------------------|
| Depreciation Period | IRS Pub 946 / ASC 360 | 27.5 years | "Fixed at 27.5 years per IRS Publication 946 for residential rental property." |
| Days Per Month | Industry standard | 30.5 days | "Industry convention: 365 ÷ 12 = 30.42, rounded to 30.5." |
| Amortization Terms | Market convention | 20–30 years | "Standard commercial mortgage terms. 25 years is most common." |
| Closing Costs | Market convention | 1–3% | "Includes lender fees, legal, appraisal, title insurance." |
| Broker Commission | NAR / market | 4–6% | "Industry standard, split between buyer's and seller's agents." |
| Inflation Rate | Federal Reserve | ~2% target | "Based on CPI forecasts. The Federal Reserve targets 2% annually." |

For market-variable fields (ADR, occupancy, cap rate), tooltips explain the concept and research badges show the AI-recommended range.

## Currently Implemented

- **Property Edit** (`client/src/pages/PropertyEdit.tsx`): All 39+ input fields have HelpTooltips. ResearchBadges on: startAdr, maxOccupancy, startOccupancy, occupancyRampMonths, cateringBoostPercent, exitCapRate, landValuePercent.
- **Company Assumptions** (`client/src/pages/CompanyAssumptions.tsx`): ResearchBadges on management company cost fields, sourced from `useMarketResearch("company")`:
  - `staffSalary` — from `content.compensationBenchmarks.manager`
  - `marketingRate` — from `content.industryBenchmarks.operatingExpenseRatios` (matching "marketing" or "sales & marketing")
  - `eventExpenseRate` — from `content.industryBenchmarks.operatingExpenseRatios` (matching "event", "banquet", or "catering")
  - Note: Management fee rates (base, incentive) are now **per-property** — edited on each property's PropertyEdit page, with a read-only summary table on CompanyAssumptions
- **Settings** (`client/src/pages/Settings.tsx`): All input fields (portfolio, macro, other tabs) have HelpTooltips. No ResearchBadges (global settings are not property-specific).

## Integration Checklist

When adding research badges to a new page:

1. Import `ResearchBadge` from `@/components/ui/research-badge`
2. Fetch research data via `useMarketResearch(type, entityId)`
3. Parse fields with `parseRange()` / `parsePct()` into `{ display, mid }` objects
4. Place `<ResearchBadge>` next to each field that has research data
5. Wire `onClick` to apply the `mid` value to the field
6. Use `variant="dark"` on glass/dark panels

## Design Rules

1. **Never show without data** — component returns null if `value` is falsy
2. **Always clickable** — clicking applies midpoint of researched range
3. **Format matches field** — "$350–$450" for money, "65%–75%" for percentages
4. **Text format**: `(Research: {value})` with parentheses
5. **Placement**: Inline with label, to the right, same flex row
6. **Tooltip**: Always `title="Click to apply research-recommended value"`
