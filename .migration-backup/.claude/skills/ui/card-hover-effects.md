---
name: card-hover-effects
description: Standard hover effect pattern for dashboard metric cards. Covers lift, scale, themed glow shadow, border color shift, and inner radial gradient overlay. Use when adding hover interactivity to any card element.
---

# Card Hover Effects

## Core Pattern

Every interactive card uses a consistent 5-layer hover effect:

1. **Container class:** `group` for child targeting
2. **Transition:** `transition-all duration-500`
3. **Lift + Scale:** `hover:scale-[1.05] hover:-translate-y-1`
4. **Glow shadow:** `hover:shadow-[0_16px_48px_rgba(R,G,B,0.2)]` (color-matched)
5. **Border shift:** `hover:border-{color}/50`

## Template

```tsx
<div className="group relative bg-white/90 backdrop-blur-xl rounded-2xl p-5 border border-white/40 shadow-lg shadow-black/10 transition-all duration-500 hover:shadow-[0_16px_48px_rgba(R,G,B,0.2)] hover:border-{color}/50 hover:scale-[1.05] hover:-translate-y-1 cursor-pointer">
  {/* Radial glow overlay — see radial-glow-overlay.md */}
  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-600 pointer-events-none"
    style={{ background: "radial-gradient(circle at 30% 30%, rgba(R,G,B,0.06), transparent 60%)" }}
  />
  {/* Card content with relative positioning */}
  <div className="relative">
    {/* value text scales on hover */}
    <p className="text-2xl font-bold font-mono transition-transform duration-300 group-hover:scale-105">
      {value}
    </p>
  </div>
</div>
```

## Color Theme Map

| Card Type | Shadow RGBA | Border Color | Gradient Origin | Example |
|-----------|-------------|-------------|-----------------|---------|
| Equity / Multiple | `37,99,235` (blue) | `blue-300/60` | `30% 30%` | Equity Multiple card |
| Cash-on-Cash | `217,119,6` (amber) | `amber-300/60` | `30% 30%` | CoC Return card |
| Total Equity | `45,74,94` (slate) | `primary/50` | `50% 80%` | Total Equity card |
| Exit Value | `5,150,105` (emerald) | `emerald-300/60` | `70% 30%` | Exit Value card |
| Portfolio | `159,188,164` (sage) | `primary/50` | `20% 20%` | Portfolio Composition |
| Capital Structure | `45,74,94` (dark slate) | `[#2d4a5e]/30` | `80% 20%` | Capital Structure card |
| IRR Gauge | `244,121,91` (secondary) | `secondary/60` | `50% 50%` | Portfolio IRR gauge |

## Scale Variants

| Context | Scale | Lift | Shadow Spread |
|---------|-------|------|---------------|
| Small metric cards | `1.05` | `-translate-y-1` | `48px` |
| Chart containers | `1.02` | none | `50px` |
| Featured/hero cards | `1.03` | none | `60px` |
| KPI grid items | `1.04` (framer-motion) | `y: -4` | `40px` |

## Child Element Animations

Elements inside the card respond to the parent `group` hover:

```tsx
{/* Icon scales up */}
<Icon className="transition-transform duration-300 group-hover:scale-110" />

{/* Value text scales */}
<span className="transition-transform duration-300 group-hover:scale-105">{value}</span>

{/* SVG gauge thickens stroke */}
<circle className="transition-all duration-500 group-hover:stroke-[8]" />

{/* Arrow icon lifts */}
<svg className="transition-transform duration-500 group-hover:scale-125 group-hover:-translate-y-0.5" />

{/* Progress bar glows */}
<div className="transition-all duration-700 group-hover:shadow-[0_0_12px_rgba(159,188,164,0.6)]" />
```

## Key Files

- `client/src/pages/Dashboard.tsx` — Primary implementation of all card hover patterns
- `client/src/components/graphics/KPIGrid.tsx` — KPI grid with framer-motion hover

## Performance Notes

- Use `will-change: transform` sparingly (only on framer-motion animated elements)
- `transition-all` covers transform, shadow, border, and opacity in one declaration
- `pointer-events-none` on overlay divs prevents hover interference
- `cursor-pointer` signals interactivity to users

## Related Skills

- **radial-glow-overlay.md** — Inner glow overlay pattern
- **gauge-hover-effects.md** — SVG gauge hover animations
- **chart-container-hover.md** — Chart wrapper hover pattern
- **kpi-grid-hover.md** — KPIGrid framer-motion hover
- **animation-patterns.md** — General animation wrappers
