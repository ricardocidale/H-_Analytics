---
name: radial-glow-overlay
description: Radial gradient inner glow overlay pattern — appears on group hover to add subtle luminous depth. Use on any card or container that needs an inner glow effect.
---

# Radial Glow Overlay

## Overview

A transparent overlay div with a radial gradient that fades in on parent `group` hover. Creates a subtle inner glow that adds depth and warmth to cards without changing content readability.

## Template

```tsx
<div className="group relative overflow-hidden rounded-2xl ...">
  {/* Glow overlay — absolutely positioned, no pointer events */}
  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
    style={{
      background: "radial-gradient(circle at {originX}% {originY}%, rgba(R,G,B,{alpha}), transparent {spread}%)"
    }}
  />
  {/* Content must be relative to sit above overlay */}
  <div className="relative">
    {children}
  </div>
</div>
```

## Required Classes

| Class | Purpose |
|-------|---------|
| `group` | On parent container — enables `group-hover` targeting |
| `relative overflow-hidden` | On parent — overlay boundary |
| `absolute inset-0` | Full coverage |
| `rounded-2xl` | Match parent border radius |
| `opacity-0 group-hover:opacity-100` | Hidden by default, visible on hover |
| `transition-opacity duration-500` | Smooth fade-in (500ms standard, 600-700ms for larger cards) |
| `pointer-events-none` | Prevents overlay from blocking clicks |

## Gradient Presets

| Card Type | Origin | Color RGBA | Alpha | Spread | Duration |
|-----------|--------|-----------|-------|--------|----------|
| KPI (light) | `50% 0%` | `159,188,164` (sage) | `0.12` | `70%` | `500ms` |
| KPI (dark) | `50% 0%` | `255,255,255` (white) | `0.06` | `70%` | `500ms` |
| IRR Gauge | `50% 50%` | `244,121,91` (secondary) | `0.08` | `70%` | `700ms` |
| Equity Multiple | `30% 30%` | `37,99,235` (blue) | `0.06` | `60%` | `600ms` |
| Cash-on-Cash | `30% 30%` | `217,119,6` (amber) | `0.06` | `60%` | `600ms` |
| Total Equity | `50% 80%` | `159,188,164` (sage) | `0.10` | `60%` | `600ms` |
| Exit Value | `70% 30%` | `5,150,105` (emerald) | `0.06` | `60%` | `600ms` |
| Portfolio | `20% 20%` | `159,188,164` (sage) | `0.10` | `60%` | `600ms` |
| Capital | `80% 20%` | `45,74,94` (dark slate) | `0.06` | `60%` | `600ms` |

## Gradient Origin Strategy

The gradient origin should direct the viewer's eye:

- **Top-center (`50% 0%`):** Standard for KPI cards — light comes from above
- **Center (`50% 50%`):** Hero elements like the IRR gauge — balanced glow
- **Upper-left (`30% 30%`):** Metric cards with left-aligned content
- **Lower-center (`50% 80%`):** Cards with bottom progress bars
- **Upper-right (`70% 30%`):** Cards with right-aligned icons
- **Corner (`20% 20%` / `80% 20%`):** Composition cards — directional accent

## Alpha Guidelines

| Surface | Alpha | Reason |
|---------|-------|--------|
| Light backgrounds | `0.06–0.12` | Visible but subtle on white |
| Dark backgrounds | `0.04–0.06` | Less needed on dark surfaces |
| Hero elements | `0.08–0.10` | Slightly more prominent |

## Do NOT Use Overlay On

- **Chart containers** — interferes with tooltip readability
- **Form elements** — confusing interaction signal
- **Navigation items** — too heavy for menu items
- **Buttons** — use border/shadow effects instead

## Key Files

- `client/src/pages/Dashboard.tsx` — 8+ overlay instances
- `client/src/components/graphics/KPIGrid.tsx` — KPI overlay with variant logic

## Related Skills

- **card-hover-effects.md** — Full card hover pattern using this overlay
- **kpi-grid-hover.md** — KPIGrid dual-layer hover
- **gauge-hover-effects.md** — Gauge cards with overlay
