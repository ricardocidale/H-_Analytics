---
name: kpi-grid-hover
description: KPIGrid framer-motion hover pattern — combines whileHover scale/lift with Tailwind group hover for glow, border, and radial overlay. Use when extending or creating new KPI grid variants.
---

# KPIGrid Hover Effects

## Overview

KPIGrid cards use a dual-layer hover system: framer-motion `whileHover` for scale/lift (spring physics) combined with Tailwind `group-hover` for glow, border, and overlay effects. This creates a premium, responsive feel.

## Implementation

```tsx
import { motion } from "framer-motion";

<motion.div
  whileHover={{
    scale: 1.04,
    y: -4,
    transition: { duration: 0.25, ease: "easeOut" },
  }}
  className="group relative overflow-hidden rounded-2xl p-5 cursor-pointer transition-all duration-500 hover:shadow-[0_12px_40px_rgba(159,188,164,0.25)] hover:border-primary/40 hover:-translate-y-1"
  style={{ willChange: "transform" }}
>
  {/* Radial glow overlay */}
  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
    style={{
      background: variant === "dark"
        ? "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.06), transparent 70%)"
        : "radial-gradient(circle at 50% 0%, rgba(159,188,164,0.12), transparent 70%)"
    }}
  />

  <div className="relative">
    {/* Icon scales on hover */}
    <div className="transition-transform duration-300 group-hover:scale-110">
      {item.icon}
    </div>

    {/* Value with AnimatedCounter */}
    <span className="text-2xl font-bold font-mono">
      <AnimatedCounter value={item.value} format={item.format} />
    </span>
  </div>
</motion.div>
```

## Dual-Layer System

| Layer | Technology | Effects | Timing |
|-------|-----------|---------|--------|
| Transform | framer-motion `whileHover` | `scale: 1.04`, `y: -4` | `0.25s easeOut` |
| Visual | Tailwind `group-hover` | Shadow, border, overlay, icon scale | `500ms` CSS transition |

## Why Dual Layers?

- **framer-motion** provides spring-based physics for scale/lift — feels more natural than CSS transitions
- **Tailwind group-hover** handles visual effects (shadow, border, overlay) — simpler to maintain and theme
- The two systems don't conflict because they target different CSS properties

## Variant-Specific Overlays

| Variant | Gradient Color | Opacity |
|---------|---------------|---------|
| `light` | `rgba(159,188,164,0.12)` (sage) | `0.12` |
| `dark` | `rgba(255,255,255,0.06)` (white) | `0.06` |
| `glass` | `rgba(159,188,164,0.12)` (sage) | `0.12` |

## Stagger Animation

KPIGrid wraps items in a staggered container for enter animation:

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
```

Hover effects layer on top of the stagger — items animate in, then become individually hoverable.

## Key Files

- `client/src/components/graphics/KPIGrid.tsx` — Full implementation
- `client/src/components/graphics/index.ts` — Barrel export

## Related Skills

- **card-hover-effects.md** — General card hover pattern
- **radial-glow-overlay.md** — Overlay technique
- **animation-patterns.md** — Motion wrappers and AnimatedCounter
- **graphics-component-catalog.md** — KPIGrid props reference
