---
title: "Variant graduation: extend a shared component with a new variant prop, never mutate the default"
date: 2026-05-11
category: architecture-patterns
module: shared-graphics-components
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "Graduating an approved canvas mockup variant into a shared production component"
  - "A shared component (e.g. KPIGrid) is consumed by 2+ surfaces and the new design only applies to one of them"
  - "The mockup hardcodes brand colors that would break dark mode if copy-pasted"
  - "Per-instance theming (per-card accents, per-row colors) is needed without bloating the default API"
tags:
  - mockup-graduate
  - shared-components
  - variants
  - dark-mode
  - kpi-grid
related_components:
  - tooling
  - documentation
---

# Variant graduation: extend a shared component with a new variant prop, never mutate the default

## Context

When an approved canvas mockup graduates into production, the natural reflex is to "make the production component look like the mockup" by editing its default rendering path. In a multi-tenant component (`KPIGrid` is consumed by `CompanyHeader`, `CurrentPlanTab`, `RecommendedTab`, `ComparisonView`, and Scenarios), this silently rewrites four other surfaces that never asked for the new look.

The mockup also typically hardcodes brand colors lifted from a Figma palette (e.g., `#FAFAF7` background, `#6B7843` olive accent). Copying those literals into the production component breaks dark mode, because the production design system uses CSS-variable tokens (`--background`, `--primary`, `--border`) that already resolve `#6B7843`-equivalent in light mode and the correct dark-mode equivalent in dark mode.

This doc captures the discipline that survived a real graduation (Swiss Minimal KPI hero, Variant D → `CompanyHeader`) without breaking the four other call sites and without breaking dark mode.

## Guidance

**Rule 1 — Add a `variant` prop, branch internally, leave the default rendering path untouched.**

```tsx
// KPIGrid.tsx
type KPIGridVariant = "default" | "swiss";

export function KPIGrid({ items, variant = "default", ...rest }: KPIGridProps) {
  if (variant === "swiss") return <KPIGridSwiss items={items} {...rest} />;
  return <KPIGridDefault items={items} {...rest} />;
}
```

The four other call sites continue to receive `KPIGridDefault` with zero diff in their rendered output. Only the new caller opts in.

**Rule 2 — Extend `KPIItem` with optional fields. Never make a new field required.**

```tsx
type KPIItem = {
  label: string;
  value: number;
  // Existing required fields stay required.
  // New fields used only by the swiss variant:
  baselineValue?: number;
  positiveDirection?: "up" | "down";
  accentClassName?: string;
};
```

Existing call sites compile unchanged. The variant uses the new fields when present and falls back to a sensible default when absent.

**Rule 3 — Use design-system tokens, not raw hex from the mockup.**

| Mockup literal       | Production token       | Why                                                 |
| -------------------- | ---------------------- | --------------------------------------------------- |
| `bg-[#FAFAF7]`       | `bg-background`        | Auto-flips for dark mode                            |
| `text-[#6B7843]`     | `text-primary`         | `--primary` already resolves to olive in light mode |
| `border-[#E5E5E0]`   | `border-border`        | Hairline border token, theme-aware                  |
| Per-card hex accents | `bg-emerald-600` etc.  | Tailwind palette tokens, opt-in via prop            |

**Rule 4 — Hairline borders that survive responsive collapse.**

The mockup used a fixed grid with manual `border-r` / `border-b` on each cell. At small breakpoints those borders end up on the wrong edges (right border on the last visible cell, bottom border on cells that wrap). Use Tailwind's `divide-x divide-y divide-border` on a single bordered container — `divide-*` only renders interior lines and respects flex/grid wrapping automatically.

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-border border border-border">
  {items.map((item) => <KPICell key={item.label} item={item} />)}
</div>
```

**Rule 5 — Per-card accents are passed through, not hardcoded.**

The graduating caller decides the accent semantics (Revenue=emerald, NetIncome=primary, Expenses=amber, Properties=sky). The shared component just renders whatever `accentClassName` it receives. Future callers pick their own palette without editing the shared component.

## Why This Matters

- **No silent regressions on sibling surfaces.** The four other consumers of `KPIGrid` were never on the architect's screen during the graduation. Without the variant branch, they would have received the new look in production with no review.
- **Dark mode survives.** Hardcoded mockup hex breaks the moment a user toggles theme. Token-based styling stays correct in both modes for free.
- **Future variants are cheap.** The next mockup that graduates adds `variant="bauhaus"` next to `variant="swiss"` and reuses the same KPIItem fields.
- **Reviewability.** A reviewer scanning the diff sees a single new branch in the shared component plus one new caller — they can reason about blast radius without grep-walking every consumer.

## When to Apply

- Any component shared across 2+ call sites where one caller needs a different look.
- Any time you copy a literal hex color out of a Figma file or canvas mockup.
- Any time the mockup uses a fixed grid with per-cell borders.
- Any time per-instance theming (per-card, per-row) is requested.

## Examples

**Before (graduation that would have broken siblings + dark mode):**

```tsx
// KPIGrid.tsx — mutated default rendering
export function KPIGrid({ items }) {
  return (
    <div className="bg-[#FAFAF7] grid grid-cols-4">
      {items.map(item => (
        <div className="border-r border-b border-[#E5E5E0] text-[#6B7843]">
          {item.label}: {item.value}
        </div>
      ))}
    </div>
  );
}
```

Result: `CurrentPlanTab`, `RecommendedTab`, `ComparisonView`, `Scenarios` all suddenly look Swiss. Dark mode shows white-on-white because `#FAFAF7` doesn't flip.

**After (variant graduation, default untouched):**

```tsx
// CompanyHeader.tsx — only this caller opts in
<KPIGrid
  variant="swiss"
  items={[
    { label: "Revenue", value: revenue, baselineValue: yearlyChartData[0].revenue, accentClassName: "bg-emerald-600" },
    { label: "Net Income", value: netIncome, baselineValue: yearlyChartData[0].netIncome, accentClassName: "bg-primary" },
    { label: "Expenses", value: expenses, baselineValue: yearlyChartData[0].expenses, positiveDirection: "down", accentClassName: "bg-amber-600" },
    { label: "Properties", value: propertyCount, accentClassName: "bg-sky-600" },
  ]}
/>
```

The four sibling call sites continue to render the default layout, dark mode works, and the next graduation is one more `variant="…"` branch away.

## Related

- `mockup-graduate` skill — overall workflow for graduating canvas mockups
- `nai-design-system` skill — token taxonomy that replaces mockup hex
- `hbg-design-philosophy` skill — Tuscan Olive palette tokens
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — broader pattern of "extend, never mutate" in pipelines
