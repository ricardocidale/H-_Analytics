---
name: gauge-hover-effects
description: SVG gauge hover effects — stroke thickening, scale-up, rotation hint, and value text zoom. Use when building or modifying semicircular gauge displays.
---

# Gauge Hover Effects

## Overview

SVG gauges respond to parent `group` hover with 3 effects: scale + rotation, stroke thickening, and value text zoom. Used for Equity Multiple, Cash-on-Cash, and IRR gauges on the Dashboard.

## Small Gauge Pattern (Equity Multiple, Cash-on-Cash)

```tsx
<div className="group ... transition-all duration-500 hover:shadow-[...] hover:scale-[1.05] hover:-translate-y-1 cursor-pointer">
  <div className="flex items-center gap-4">
    {/* Gauge SVG — scales and rotates on hover */}
    <svg className="w-14 h-14 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[5deg]"
      viewBox="0 0 100 100">
      {/* Background arc */}
      <circle cx="50" cy="50" r="40"
        fill="none" stroke="#e5e7eb" strokeWidth="6"
        strokeDasharray="188.5" strokeDashoffset="62.8"
        strokeLinecap="round"
        transform="rotate(150, 50, 50)"
      />
      {/* Value arc — thickens on hover */}
      <circle cx="50" cy="50" r="40"
        fill="none" stroke={color} strokeWidth="6"
        strokeDasharray="188.5"
        strokeDashoffset={188.5 - (188.5 - 62.8) * fillFraction}
        strokeLinecap="round"
        transform="rotate(150, 50, 50)"
        className="transition-all duration-500 group-hover:stroke-[8]"
      />
    </svg>
    <div>
      {/* Value text scales */}
      <p className="text-2xl font-bold text-[{color}] font-mono transition-transform duration-300 group-hover:scale-105">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </div>
</div>
```

## Large Gauge Pattern (Portfolio IRR)

```tsx
<div className="group ... transition-all duration-500 hover:shadow-[0_20px_60px_rgba(244,121,91,0.25)] hover:border-secondary/60 hover:scale-[1.03] cursor-pointer">
  {/* Radial overlay */}
  <div className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
    style={{ background: "radial-gradient(circle at 50% 50%, rgba(244,121,91,0.08), transparent 70%)" }}
  />
  <svg className="w-48 h-48 transition-transform duration-700 group-hover:scale-105" viewBox="0 0 200 200">
    {/* Background arc */}
    <circle cx="100" cy="100" r="80" fill="none" stroke="#e5e7eb" strokeWidth="10"
      strokeDasharray="377" strokeDashoffset="126"
      strokeLinecap="round" transform="rotate(150, 100, 100)"
    />
    {/* Value arc — thickens to 14 on hover */}
    <circle cx="100" cy="100" r="80" fill="none" stroke="#F4795B" strokeWidth="10"
      strokeDasharray="377"
      strokeDashoffset={377 - (377 - 126) * fillFraction}
      strokeLinecap="round" transform="rotate(150, 100, 100)"
      className="transition-all duration-700 group-hover:stroke-[14]"
    />
  </svg>
  {/* Centered value scales up */}
  <span className="text-5xl font-bold font-mono transition-transform duration-500 group-hover:scale-110">
    {value}%
  </span>
</div>
```

## Gauge Geometry

| Property | Small (w-14) | Large (w-48) |
|----------|-------------|-------------|
| viewBox | `0 0 100 100` | `0 0 200 200` |
| Radius | `40` | `80` |
| Default stroke | `6` | `10` |
| Hover stroke | `8` | `14` |
| dasharray | `188.5` | `377` |
| dashoffset (gap) | `62.8` | `126` |
| rotate | `150deg` | `150deg` |
| Scale on hover | `1.10` | `1.05` |
| Rotation hint | `rotate-[5deg]` | none |

## Fill Fraction Calculation

```tsx
const fillFraction = Math.min(Math.max(value / maxValue, 0), 1);
const arcLength = dasharray - dashoffsetGap;
const strokeDashoffset = dasharray - arcLength * fillFraction;
```

## Color Map

| Gauge | Stroke Color | Shadow RGBA |
|-------|-------------|-------------|
| Portfolio IRR | `#F4795B` (secondary) | `244,121,91` |
| Equity Multiple | `#2563EB` (blue) | `37,99,235` |
| Cash-on-Cash | `#D97706` (amber) | `217,119,6` |

## Key Files

- `client/src/pages/Dashboard.tsx` — All three gauge implementations (lines ~1646–1820)

## Related Skills

- **card-hover-effects.md** — Parent card hover pattern
- **radial-glow-overlay.md** — Inner glow overlay
- **graphics-component-catalog.md** — Gauge component (reusable version)
