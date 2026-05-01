---
name: magic-ui
description: Magic UI special effects components installed in components/ui/. Use when adding particle effects, animated text, meteor backgrounds, number counters, ripple loaders, or beam connectors.
---

# Magic UI Special Effects

All 9 components live in `client/src/components/ui/` and are installed via shadcn registry.

**Related rules**: `design-standards.md`

## Component Reference

| File | Export | Effect | Use For |
|------|--------|--------|---------|
| `particles.tsx` | `Particles` | Mouse-interactive floating dots | Dashboard/hero section backgrounds |
| `number-ticker.tsx` | `NumberTicker` | Spring-physics counting animation | Financial KPIs, metric display |
| `blur-fade.tsx` | `BlurFade` | Blur-in reveal on mount/scroll | Section reveals, card entrances |
| `shimmer-button.tsx` | `ShimmerButton` | Animated light-sweep CTA button | Primary actions, CTAs |
| `animated-gradient-text.tsx` | `AnimatedGradientText` | Gradient-shifting text animation | Section headings, hero text |
| `ripple.tsx` | `Ripple` | Expanding concentric rings | Loading/idle/waiting states |
| `aurora-text.tsx` | `AuroraText` | Aurora color-shift on text | Hero titles, display headings |
| `animated-beam.tsx` | `AnimatedBeam` | SVG beam between two elements | Data flow diagrams, connections |
| `meteors.tsx` | `Meteors` | Falling streak effect on a card | Section/card background accents |

## Import Pattern

```tsx
import { Particles } from "@/components/ui/particles"
import { NumberTicker } from "@/components/ui/number-ticker"
import { BlurFade } from "@/components/ui/blur-fade"
import { ShimmerButton } from "@/components/ui/shimmer-button"
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text"
import { Ripple } from "@/components/ui/ripple"
import { AuroraText } from "@/components/ui/aurora-text"
import { AnimatedBeam } from "@/components/ui/animated-beam"
import { Meteors } from "@/components/ui/meteors"
```

## Usage Examples

### Particles — Section Background
```tsx
<div className="relative h-64 overflow-hidden rounded-xl">
  <Particles className="absolute inset-0" quantity={80} color="#3B82F6" />
  <div className="relative z-10 p-8">{/* content */}</div>
</div>
```

### NumberTicker — Financial KPI
```tsx
// Preferred over AnimatedCounter for new financial displays
<NumberTicker value={14200000} decimalPlaces={0} className="text-3xl font-bold" />
// With prefix/suffix (wrap in a span):
<span>$<NumberTicker value={14.2} decimalPlaces={1} />M</span>
```

### BlurFade — Content Reveal
```tsx
// inView = triggers when scrolled into viewport
<BlurFade delay={0.1} inView>
  <Card>...</Card>
</BlurFade>
// Stagger multiple items:
{items.map((item, i) => (
  <BlurFade key={item.id} delay={i * 0.05} inView>
    <Card>{item.name}</Card>
  </BlurFade>
))}
```

### ShimmerButton — CTA
```tsx
<ShimmerButton shimmerColor="#ffffff" background="hsl(var(--primary))">
  Generate Report
</ShimmerButton>
```

### AnimatedGradientText — Section Title
```tsx
<AnimatedGradientText>
  Portfolio Performance
</AnimatedGradientText>
```

### AuroraText — Hero Heading
```tsx
<AuroraText>H+ Analytics by Norfolk AI</AuroraText>
```

### Ripple — Loading / Idle State
```tsx
// Full-area ripple (position parent relative + overflow-hidden)
<div className="relative h-48 overflow-hidden rounded-xl bg-primary/5">
  <Ripple />
  <div className="relative z-10 flex items-center justify-center h-full">
    <span className="text-sm text-muted-foreground">Waiting for input…</span>
  </div>
</div>
```

### Meteors — Card Background Accent
```tsx
<Card className="relative overflow-hidden">
  <Meteors number={20} />
  <CardContent className="relative z-10">
    {/* content sits above meteors */}
  </CardContent>
</Card>
```

### AnimatedBeam — Data Flow
```tsx
// Requires refs on both source and target + parent container
const containerRef = useRef<HTMLDivElement>(null)
const sourceRef = useRef<HTMLDivElement>(null)
const targetRef = useRef<HTMLDivElement>(null)

<div ref={containerRef} className="relative">
  <div ref={sourceRef}>Property SPV</div>
  <div ref={targetRef}>Management Co.</div>
  <AnimatedBeam containerRef={containerRef} fromRef={sourceRef} toRef={targetRef} />
</div>
```

## Coexistence with Existing Animation System

These Magic UI components **add to**, not replace, the existing animation system:

| Task | Use |
|------|-----|
| Page-level enter transition | `AnimatedPage` from `@/components/graphics` (unchanged) |
| Section fade-up | `AnimatedSection` from `@/components/graphics` OR `BlurFade` (either) |
| Staggered grid | `AnimatedGrid` / `AnimatedGridItem` from `@/components/graphics` (unchanged) |
| Counting numbers | `NumberTicker` (new — preferred for financial displays) |
| Background effects | `Particles`, `Meteors` (new) |
| Hero/display text | `AuroraText`, `AnimatedGradientText` (new) |
| Loading states | `Ripple` (new — complements existing skeleton loaders) |
| Data connections | `AnimatedBeam` (new — no prior equivalent) |

## Performance Notes

- `Particles` — canvas-based, lightweight; safe on dashboard
- `NumberTicker` — spring physics via `motion/react`; triggers once on viewport entry
- `BlurFade` — Framer Motion opacity+blur; `inView` prop triggers on scroll
- `Meteors` — CSS animation, very low overhead
- `AnimatedBeam` — SVG path animation, low overhead
- `Ripple` — CSS keyframe animation, no JS overhead
- `AuroraText` / `AnimatedGradientText` — CSS gradient animation, no JS overhead
