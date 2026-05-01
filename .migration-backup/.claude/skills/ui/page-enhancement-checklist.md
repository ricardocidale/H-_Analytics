# Page Enhancement Checklist

Use this checklist when building or enhancing any page to ensure it meets the graphics-rich design standard.

## Quick Steps

1. **Wrap with AnimatedPage**: Every page's content inside `<Layout>` should be wrapped with `<AnimatedPage>`.
2. **Add KPIGrid**: If the page shows summary metrics, use `<KPIGrid>` at the top.
3. **Add at least one chart**: Every page with financial data needs at least one Recharts visualization.
4. **Add InsightPanel**: Include AI-style insights or key takeaways derived from the data.
5. **Use ScrollReveal**: Wrap below-fold sections with `<ScrollReveal>` for scroll animation.
6. **Use AnimatedGrid**: Replace plain grids of cards with `<AnimatedGrid>` + `<AnimatedGridItem>`.

## Component Selection Guide

| Page Shows… | Use This Component |
|------------|-------------------|
| Summary KPI numbers | `KPIGrid` |
| Revenue/expense breakdown | `DonutChart` |
| Multi-year trends | `CashFlowRiver` or `FinancialChart` |
| Rate/percentage (IRR, DSCR, occupancy) | `Gauge` |
| Property lifecycle events | `PropertyTimeline` |
| Key findings or AI insights | `InsightPanel` |
| Comparison across properties | `RadarChart` |
| Period × metric grid | `HeatMap` |
| Revenue-to-NOI bridge | `WaterfallChart` |
| Grid of property/scenario cards | `AnimatedGrid` + `AnimatedGridItem` + `HoverScale` |
| Animated financial KPI number | `NumberTicker` (preferred over `AnimatedCounter` for new work) |
| Hero / display heading | `AuroraText` or `AnimatedGradientText` |
| Idle or loading waiting state | `Ripple` |
| Background particle effect | `Particles` |
| Card or section background accent | `Meteors` |
| Content reveal on scroll | `BlurFade` (alternative to `AnimatedSection`) |
| Primary CTA button with flair | `ShimmerButton` |
| Data flow / connection diagram | `AnimatedBeam` |

## Import

```tsx
import { KPIGrid, DonutChart, CashFlowRiver, Gauge, PropertyTimeline, InsightPanel, AnimatedPage, AnimatedSection, ScrollReveal, formatCompact, formatPercent, CHART_COLORS } from "@/components/graphics";
```

## Page Template

```tsx
export default function MyPage() {
  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          <PageHeader title="..." variant="dark" />
          
          {/* Hero KPIs */}
          <KPIGrid items={kpiItems} columns={4} />
          
          {/* Primary Visualization */}
          <CashFlowRiver data={chartData} series={series} title="..." />
          
          {/* Detail Section with scroll animation */}
          <ScrollReveal>
            <div className="grid gap-6 lg:grid-cols-2">
              <DonutChart data={composition} title="..." />
              <InsightPanel insights={insights} />
            </div>
          </ScrollReveal>
          
          {/* Data table or detail content */}
          <ScrollReveal>
            {/* ... */}
          </ScrollReveal>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
```

## Minimum Requirements Per Page Type

### Financial Summary Pages (Dashboard, Company, PropertyDetail)
- [ ] AnimatedPage wrapper
- [ ] KPIGrid with 3-5 key metrics
- [ ] At least 2 charts (one trend, one composition)
- [ ] InsightPanel with data-derived observations

### Configuration Pages (CompanyAssumptions, PropertyEdit, Settings)
- [ ] AnimatedPage wrapper
- [ ] At least 1 preview chart showing impact of settings
- [ ] Real-time chart updates when sliders/inputs change

### List/Portfolio Pages (Portfolio, Scenarios, PropertyFinder)
- [ ] AnimatedPage wrapper
- [ ] AnimatedGrid with staggered card entries
- [ ] HoverScale on interactive cards
- [ ] Summary KPIs or mini-charts

### Analysis Pages (SensitivityAnalysis, FinancingAnalysis, Compare)
- [ ] AnimatedPage wrapper
- [ ] Primary analysis chart (tornado, radar, waterfall)
- [ ] Supporting composition charts
- [ ] InsightPanel with analysis findings
