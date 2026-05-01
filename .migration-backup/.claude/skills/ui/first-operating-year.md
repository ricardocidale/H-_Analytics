# First Operating Year Pattern

## Problem
Properties are acquired at different times across the projection model.
A property acquired in Year 3 has $0 revenue in Years 1-2.  Displaying
"Year 1 Revenue: $0" on the property detail page is misleading.

## Solution
Use `findFirstOperatingYear()` from `client/src/lib/firstOperatingYear.ts`
to locate the first year with positive revenue, then display that year's
metrics and label (e.g. "2028 Revenue: $482K" instead of "Year 1 Revenue: $0").

## Helper API

```ts
import { findFirstOperatingYear } from "@/lib/firstOperatingYear";

// With YearlyChartDataPoint[] (has .Revenue and .year fields)
const result = findFirstOperatingYear(yearlyChartData);
// result = { index: 2, data: { year: "2028", Revenue: 482000, ... }, year: "2028" }

// With custom field names
const result2 = findFirstOperatingYear(rows, "revenueTotal", "year");
```

### Return type
```ts
{ index: number; data: T; year: string | number | undefined } | null
```
Returns `null` only if the array is empty. If no year has revenue > 0,
falls back to index 0 so the UI always has data to display.

### Shorthand (index only)
```ts
import { findFirstOperatingYearIndex } from "@/lib/firstOperatingYear";
const idx = findFirstOperatingYearIndex(yearlyChartData); // number
```

## Where to apply
- **PropertyKPIs.tsx** — KPI cards on property detail (already done)
- **PropertyDetail exports** — PDF/Excel summary rows
- **Company pages** — per-property first-year breakdowns
- **Dashboard consolidated** — any per-property KPI display

## Rules
- Always use the helper instead of hardcoding `[0]` for "first year" data
- If the array might be empty, check for `null` return
- The `revenueKey` default is `"Revenue"` (matches `YearlyChartDataPoint`)
- For `YearlyPropertyFinancials` arrays, pass `"revenueTotal"` as the key
