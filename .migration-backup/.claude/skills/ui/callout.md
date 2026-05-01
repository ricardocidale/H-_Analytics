# Callout Component

**Location:** `client/src/components/ui/callout.tsx`

## Purpose
Alert/callout box for highlighting important information in documentation pages. Used by both the User Manual (`/methodology`) and Checker Manual (`/checker-manual`) for business rules, warnings, and notices.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | required | Callout content |
| `severity` | `"warning" \| "critical" \| "info" \| "success"` | `"warning"` | Visual severity level |
| `variant` | `"dark" \| "light"` | `"dark"` | Theme variant — use `"light"` on light backgrounds (e.g. Methodology page), `"dark"` on dark backgrounds (e.g. Checker Manual) |
| `icon` | `React.ElementType` | per severity | Override default icon |
| `title` | `string` | optional | Bold title above content |

## Severity × Variant Colors

### Light variant (for light backgrounds)

| Severity | Background | Border | Text | Default Icon |
|----------|-----------|--------|------|-------------|
| `warning` | `bg-amber-50` | `border-amber-200` | `text-amber-800` | `AlertTriangle` |
| `critical` | `bg-red-50` | `border-red-200` | `text-red-800` | `ShieldAlert` |
| `info` | `bg-blue-50` | `border-blue-200` | `text-blue-800` | `Info` |
| `success` | `bg-green-50` | `border-green-200` | `text-green-800` | `CheckCircle` |

### Dark variant (for dark backgrounds — default)

| Severity | Background | Border | Text | Default Icon |
|----------|-----------|--------|------|-------------|
| `warning` | `bg-amber-500/10` | `border-amber-500/20` | `text-amber-200/90` | `AlertTriangle` |
| `critical` | `bg-red-500/10` | `border-red-500/20` | `text-red-200/90` | `ShieldAlert` |
| `info` | `bg-blue-500/10` | `border-blue-500/20` | `text-blue-200/90` | `Info` |
| `success` | `bg-green-500/10` | `border-green-500/20` | `text-green-200/90` | `CheckCircle` |

## Usage Examples

```tsx
import { Callout } from "@/components/ui/callout";

// Business rule on light background (Methodology page)
<Callout severity="critical" variant="light" title="No Negative Cash">
  Cash balances must never go negative.
</Callout>

// Warning on dark background (Checker Manual — default variant)
<Callout>
  Always export to Excel before verifying calculations.
</Callout>

// Configurable parameter notice on light background
<Callout severity="success" variant="light" title="Now Configurable">
  <ul className="list-disc pl-5 mt-1 space-y-1">
    <li>Exit Cap Rate</li>
    <li>Tax Rate</li>
  </ul>
</Callout>
```

## Notes
- Content wraps in `text-sm font-medium`
- String children are auto-wrapped in `<p>` tags
- Non-string children (JSX) are rendered as-is
- Icon is always 20×20 with `flex-shrink-0` to prevent squishing
- **Always match variant to page background**: `variant="light"` for Methodology (light cards), default `"dark"` for Checker Manual (dark glass)

## Related Skills
- **section-card.md** — Collapsible section containing callouts
- **manual-table.md** — Data table component often used alongside callouts
