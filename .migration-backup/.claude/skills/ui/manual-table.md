# ManualTable Component

**Location:** `client/src/components/ui/manual-table.tsx`

## Purpose
Simple data table for documentation pages. Used by both the User Manual (`/methodology`) and Checker Manual (`/checker-manual`) to present structured data like default values, cost rates, and loan parameters.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `headers` | `string[]` | required | Column header labels |
| `rows` | `string[][]` | required | Row data (array of arrays) |
| `variant` | `"dark" \| "light"` | `"dark"` | Visual theme variant |

## Variants

### Dark (default)
- Border: `border-white/10`
- Header bg: `bg-white/10`
- Header text: `text-white/90`
- Row bg: `bg-white/5`
- Row border: `border-white/10`
- Row hover: `hover:bg-white/[0.08]`
- Cell text: `text-white/80`
- Used by: Checker Manual

### Light
- Border: `border-gray-200`
- Header bg: `bg-gray-50`
- Header text: `text-gray-900`
- Row border: `border-gray-200`
- Row hover: `hover:bg-gray-50`
- Cell text: `text-gray-700`
- Used by: User Manual (Methodology)

## Usage Example

```tsx
import { ManualTable } from "@/components/ui/manual-table";

<ManualTable
  variant="light"
  headers={["Parameter", "Default Value"]}
  rows={[
    ["Projection Period", `${PROJECTION_YEARS} years`],
    ["Exit Cap Rate", pct1(DEFAULT_EXIT_CAP_RATE)],
    ["Tax Rate", pct(DEFAULT_TAX_RATE)],
  ]}
/>
```

## Notes
- Horizontally scrollable (`overflow-x-auto`) for narrow viewports
- Header cells use `whitespace-nowrap` to prevent wrapping
- Row values are plain strings — format numbers before passing (use `pct()`, `pct1()`, or template literals)

## Related Skills
- **section-card.md** — Collapsible section containing tables
- **callout.md** — Alert component often used alongside tables
