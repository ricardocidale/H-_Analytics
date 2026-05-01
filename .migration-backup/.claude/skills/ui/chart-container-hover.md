---
name: chart-container-hover
description: Chart container hover effects — subtle scale, themed border/glow for Recharts wrappers. Use when wrapping any chart (bar, line, area) in an interactive container.
---

# Chart Container Hover Effects

## Overview

Chart containers use a lighter hover effect than metric cards — subtle scale (1.02) without vertical lift, with themed glow and border color shift. This prevents visual conflict with chart tooltips and interactions.

## Template

```tsx
<div className="group bg-white/95 backdrop-blur-xl rounded-[2rem] p-6 border border-primary/40 shadow-xl shadow-black/10 w-full lg:min-w-[340px] transition-all duration-500 hover:shadow-[0_16px_50px_rgba(R,G,B,0.2)] hover:border-{color}/50 hover:scale-[1.02] cursor-pointer"
  data-testid="chart-{name}">
  <h3 className="text-sm font-semibold text-[#2d4a5e] mb-4 font-display">{title}</h3>
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={data}>
      {/* chart content */}
    </BarChart>
  </ResponsiveContainer>
</div>
```

## Chart-Specific Themes

### Property IRR Comparison (Bar Chart)
```tsx
hover:shadow-[0_16px_50px_rgba(59,130,246,0.2)]
hover:border-blue-400/50
```

### Equity Investment (Bar Chart)
```tsx
hover:shadow-[0_16px_50px_rgba(245,158,11,0.2)]
hover:border-amber-400/50
```

## Key Differences from Card Hover

| Property | Card Hover | Chart Container Hover |
|----------|-----------|---------------------|
| Scale | `1.05` | `1.02` |
| Lift | `hover:-translate-y-1` | none |
| Border radius | `rounded-2xl` | `rounded-[2rem]` |
| Shadow spread | `48px` | `50px` |
| Radial overlay | yes | no (avoids chart interference) |
| `will-change` | sometimes | no |

## Why Lighter Effects

1. Charts have their own hover interactions (tooltips, crosshairs)
2. Excessive scale causes Recharts `ResponsiveContainer` to recalculate
3. Lift creates visual disconnect between chart and surrounding cards
4. No radial overlay to avoid interfering with chart readability

## Key Files

- `client/src/pages/Dashboard.tsx` — Chart containers (lines ~1675–1750)

## Related Skills

- **card-hover-effects.md** — Full card hover pattern
- **charts.md** — Chart component usage guide
- **graphics-component-catalog.md** — Recharts component catalog
