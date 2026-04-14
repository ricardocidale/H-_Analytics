# Animation Patterns

Standard animation patterns using existing components. Reference this when adding motion to any page.

## Available Animated Wrappers

### From `@/components/graphics`
- `AnimatedPage` — page-level enter/exit
- `AnimatedSection` — individual section fade-up with delay
- `AnimatedGrid` + `AnimatedGridItem` — staggered grid children
- `ScrollReveal` — animate on scroll into viewport

### From `@/components/ui/animated`
- `PageTransition` — simple page fade-in (legacy, prefer AnimatedPage)
- `FadeInUp` — fade + slide up
- `FadeIn` — opacity fade
- `ScaleIn` — scale + fade
- `SlideIn` — horizontal slide (direction: "left" | "right")
- `StaggerContainer` + `StaggerItem` — staggered list items
- `AnimatedCounter` — counting number animation
- `HoverScale` — interactive hover lift
- `PulseOnMount` — spring scale on mount
- `AnimatedProgressBar` — animated width bar

## Pattern: Page Wrapper

Every page should wrap its Layout children:

```tsx
import { AnimatedPage } from "@/components/graphics";

export default function MyPage() {
  return (
    <Layout>
      <AnimatedPage>
        {/* all content */}
      </AnimatedPage>
    </Layout>
  );
}
```

## Pattern: Staggered Card Grid

```tsx
import { AnimatedGrid, AnimatedGridItem } from "@/components/graphics";
import { HoverScale } from "@/components/ui/animated";

<AnimatedGrid className="grid gap-4 md:grid-cols-3">
  {items.map(item => (
    <AnimatedGridItem key={item.id}>
      <HoverScale>
        <Card>...</Card>
      </HoverScale>
    </AnimatedGridItem>
  ))}
</AnimatedGrid>
```

## Pattern: Progressive Section Reveal

```tsx
import { AnimatedSection, ScrollReveal } from "@/components/graphics";

{/* Above fold — immediate animation */}
<AnimatedSection delay={0}>
  <KPIGrid ... />
</AnimatedSection>

<AnimatedSection delay={0.15}>
  <CashFlowRiver ... />
</AnimatedSection>

{/* Below fold — reveal on scroll */}
<ScrollReveal>
  <DonutChart ... />
</ScrollReveal>
```

## Pattern: Animated Number Display

```tsx
import { AnimatedCounter } from "@/components/ui/animated";
import { formatCompact } from "@/components/graphics";

<AnimatedCounter value={totalRevenue} format={formatCompact} />
```

## Pattern: Hover Interactive Cards

```tsx
import { HoverScale } from "@/components/ui/animated";

<HoverScale scale={1.02}>
  <Card className="cursor-pointer">
    {/* card content */}
  </Card>
</HoverScale>
```

## Advanced Hover Effects (Detailed Skills)

For rich, multi-layered hover effects used on the Dashboard, see these dedicated skill files:

- **card-hover-effects.md** — Core 5-layer card hover pattern (group, transition, lift, glow, border)
- **gauge-hover-effects.md** — SVG gauge stroke thickening, scale, rotation on hover
- **chart-container-hover.md** — Subtle chart container hover (scale 1.02, no lift)
- **kpi-grid-hover.md** — KPIGrid dual-layer hover (framer-motion + Tailwind group)
- **radial-glow-overlay.md** — Inner radial gradient overlay with theme-specific presets

## Magic UI Effects (Supplemental Library)

Nine special-effects components from [Magic UI](https://magicui.design) are available in `client/src/components/ui/`. They **extend** the existing system — existing wrappers above are unchanged.

| Component | Import | Best For |
|-----------|--------|---------|
| `BlurFade` | `@/components/ui/blur-fade` | Blur-in section reveals (alternative to `AnimatedSection`) |
| `NumberTicker` | `@/components/ui/number-ticker` | Animated financial numbers (preferred over `AnimatedCounter` for new work) |
| `Particles` | `@/components/ui/particles` | Interactive particle backgrounds |
| `Meteors` | `@/components/ui/meteors` | Falling-streak card backgrounds |
| `Ripple` | `@/components/ui/ripple` | Idle/loading waiting states |
| `AuroraText` | `@/components/ui/aurora-text` | Hero/display headings |
| `AnimatedGradientText` | `@/components/ui/animated-gradient-text` | Section title gradients |
| `ShimmerButton` | `@/components/ui/shimmer-button` | Shimmer CTA buttons |
| `AnimatedBeam` | `@/components/ui/animated-beam` | SVG beams between two elements |

Full usage examples → `.claude/skills/ui/magic-ui.md`

## AI Processing Loaders (`@/components/ui/ai-loader`)

Six premium framer-motion components for AI/research processing states. Use these instead of `Loader2 animate-spin`.

| Component | Visual | Best For |
|-----------|--------|---------|
| `OrbitalDots` | 3 dots orbiting a center | General AI processing |
| `NeuralGlow` | Pulsing orb with neural network dots | Deep analysis, LLM thinking |
| `StreamPulse` | 3 bars with staggered wave animation | Data streaming, real-time processing |
| `BreathingDots` | 3 dots with blur/scale breathing | Chat typing indicators (Rebecca) |
| `ThinkingRing` | SVG arc spinning smoothly | Compact spinners (replaces `Loader2`) |
| `DataFlowDots` | Dots flowing left-to-right | Data pipeline visualization |

All accept `size?: "sm" | "md" | "lg"` (default "md") and `className?` props.

```tsx
import { ThinkingRing, BreathingDots } from "@/components/ui/ai-loader";

<ThinkingRing size="sm" />
<BreathingDots size="md" />
```

**Usage rules:**
- Replace `Loader2 animate-spin` → `ThinkingRing` for all new AI processing states
- Replace bouncing dots → `BreathingDots` for chat typing indicators
- Replace waveform bars → `StreamPulse` for data streaming indicators

## Skeleton Shimmer

The `Skeleton` component uses a CSS shimmer animation (gradient sweep) instead of `animate-pulse`. Class `skeleton-shimmer` is defined in `index.css` with `@keyframes shimmer`.

## Performance Notes

- `AnimatedPage` uses `will-change: auto` — safe for all pages
- `ScrollReveal` uses `viewport={{ once: true }}` — animates only once
- `AnimatedCounter` uses `requestAnimationFrame` via framer-motion `animate()`
- Keep 3D (Three.js) components lazy-loaded with Suspense
- Use `isAnimationActive={true}` on Recharts for chart enter animations
