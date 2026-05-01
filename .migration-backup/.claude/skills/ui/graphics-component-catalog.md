# Graphics Component Catalog

All reusable graphics components live in `client/src/components/graphics/` with a barrel export from `client/src/components/graphics/index.ts`.

## Import Pattern

```tsx
import { KPIGrid, DonutChart, CashFlowRiver, Gauge, PropertyTimeline, InsightPanel, AnimatedPage, ScrollReveal } from "@/components/graphics";
```

## Available Components

### Cards
| Component | Purpose | Props |
|-----------|---------|-------|
| `KPIGrid` | Animated grid of KPI metric cards | `items: KPIItem[]`, `columns: 2-5`, `variant: glass/light/dark` |

### Charts
| Component | Purpose | Props |
|-----------|---------|-------|
| `DonutChart` | Pie/donut for composition breakdowns | `data: DonutSlice[]`, `centerLabel`, `centerValue`, `height` |
| `CashFlowRiver` | Stacked area chart for multi-series time data | `data[]`, `series: RiverSeries[]`, `stacked`, `xAxisKey` |
| `Gauge` | Semicircular gauge for rates/percentages | `value`, `min`, `max`, `label`, `thresholds`, `size: sm/md/lg` |

### Composites
| Component | Purpose | Props |
|-----------|---------|-------|
| `PropertyTimeline` | Visual milestone timeline | `milestones: TimelineMilestone[]` (acquisition/ramp/stabilization/refinance/exit) |
| `InsightPanel` | AI-style insight bullets | `insights: Insight[]`, `variant: glass/compact/inline` |

### Motion Wrappers
| Component | Purpose | Usage |
|-----------|---------|-------|
| `AnimatedPage` | Wrap entire page content for enter/exit transitions | `<AnimatedPage>{children}</AnimatedPage>` |
| `AnimatedSection` | Fade-up individual sections | `<AnimatedSection delay={0.2}>{children}</AnimatedSection>` |
| `AnimatedGrid` | Staggered grid container | `<AnimatedGrid className="grid grid-cols-3 gap-4">{children}</AnimatedGrid>` |
| `AnimatedGridItem` | Individual grid item with stagger | `<AnimatedGridItem>{card}</AnimatedGridItem>` |
| `ScrollReveal` | Reveal on scroll into viewport | `<ScrollReveal>{section}</ScrollReveal>` |

### Primitives
| Export | Purpose |
|--------|---------|
| `CHART_COLORS` | Standard color palette for all charts |
| `formatCompact` | `$1.2M`, `$45K` format |
| `formatPercent` | Decimal to `12.5%` |
| `trendDirection` | Returns `"up"/"down"/"neutral"` from two values |

## Existing Charts (in `client/src/components/charts/`)
| Component | Purpose |
|-----------|---------|
| `WaterfallChart` | Revenue-to-NOI waterfall bridges |
| `RadarChart` | Multi-property comparison radar |
| `HeatMap` | Period × metric color grid |
| `FinancialChart` | Multi-series line chart with presets (in `ui/financial-chart.tsx`) |

### Special Effects (Magic UI)
All in `client/src/components/ui/` — full reference in `.claude/skills/ui/magic-ui.md`

| Component | Import | Effect |
|-----------|--------|--------|
| `Particles` | `@/components/ui/particles` | Mouse-interactive particle background |
| `NumberTicker` | `@/components/ui/number-ticker` | Spring-physics counting number |
| `BlurFade` | `@/components/ui/blur-fade` | Blur-in reveal on mount/scroll |
| `ShimmerButton` | `@/components/ui/shimmer-button` | Shimmer-sweep CTA button |
| `AnimatedGradientText` | `@/components/ui/animated-gradient-text` | Gradient-shift text animation |
| `Ripple` | `@/components/ui/ripple` | Concentric expanding rings |
| `AuroraText` | `@/components/ui/aurora-text` | Aurora color-shift heading |
| `AnimatedBeam` | `@/components/ui/animated-beam` | SVG beam connecting two elements |
| `Meteors` | `@/components/ui/meteors` | Falling-streak card background |

## Usage Examples

### KPI Row on Dashboard
```tsx
<KPIGrid items={[
  { label: "Portfolio IRR", value: 0.142, format: formatPercent, trend: "up", icon: <TrendingUp /> },
  { label: "Total Revenue", value: 4500000, format: formatCompact, sublabel: "Year 1" },
  { label: "Properties", value: 5, trend: "neutral" },
  { label: "NOI Margin", value: 0.38, format: formatPercent, trend: "up", trendLabel: "+2.1%" },
]} />
```

### Revenue Composition Donut
```tsx
<DonutChart
  data={[
    { name: "Rooms", value: 2100000 },
    { name: "F&B", value: 800000 },
    { name: "Events", value: 400000 },
    { name: "Other", value: 200000 },
  ]}
  title="Revenue Mix"
  centerValue="$3.5M"
  centerLabel="Total Revenue"
/>
```

### Cash Flow River
```tsx
<CashFlowRiver
  data={yearlyData}
  series={[
    { dataKey: "revenue", name: "Revenue", color: "#257D41" },
    { dataKey: "expenses", name: "Expenses", color: "#EF4444" },
    { dataKey: "noi", name: "NOI", color: "#3B82F6" },
  ]}
  title="Cash Flow Performance"
/>
```

### IRR Gauge
```tsx
<Gauge value={14.2} max={30} label="Portfolio IRR" format={v => `${v.toFixed(1)}%`} thresholds={{ good: 12, warn: 8 }} />
```

### Property Timeline
```tsx
<PropertyTimeline milestones={[
  { date: "Jun 2026", label: "Acquisition", type: "acquisition", value: "$2.5M" },
  { date: "Jul-Dec 2026", label: "Ramp-Up", type: "ramp", description: "6-month occupancy ramp" },
  { date: "Jan 2027", label: "Stabilization", type: "stabilization", value: "85% occupancy" },
  { date: "Jun 2028", label: "Refinance", type: "refinance", value: "$1.8M cash-out" },
  { date: "Jun 2036", label: "Exit", type: "exit", value: "$4.2M" },
]} />
```

### Insight Panel
```tsx
<InsightPanel
  title="Portfolio Insights"
  insights={[
    { text: "Revenue grew", metric: "12.3% YoY", type: "positive" },
    { text: "NOI margin declining", metric: "-1.5pp", type: "warning" },
    { text: "All properties above DSCR threshold", type: "positive" },
  ]}
/>
```
