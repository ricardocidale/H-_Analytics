---
name: charts
description: Reusable chart library built on Recharts and shadcn ChartContainer. Covers component catalog, usage patterns, and chart styling. Use when adding or modifying data visualizations.
---

# Reusable Chart Library

**Path:** `client/src/lib/charts/`
**Import:** `import { ComponentName } from "@/lib/charts"`
**Peer deps:** `recharts`, `@/components/ui/chart` (shadcn ChartContainer/ChartTooltip)

## Components (12)

### BarChartCard
Horizontal or vertical bar chart with optional labels.
```tsx
<BarChartCard data={data} config={config} layout="vertical" showLabel />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `BarChartItem[]` (`name`, `value`, `fill?`) | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `nameKey` | `string` | `"name"` |
| `layout` | `"vertical" \| "horizontal"` | `"vertical"` |
| `showLabel` | `boolean` | `true` |
| `barRadius` | `number` | `8` |

### BarChartHorizontal
Horizontal bar chart with clean axis labels, no grid lines.
```tsx
<BarChartHorizontal data={data} config={config} tickFormatter={(v) => v.slice(0, 3)} />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `Record<string, unknown>[]` | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `nameKey` | `string` | `"name"` |
| `barRadius` | `number` | `5` |
| `tickFormatter` | `(value: string) => string` | — |

### BarChartMixed
Horizontal bar chart where each bar has its own color via `fill`. Labels resolve from config.
```tsx
<BarChartMixed data={data} config={config} dataKey="visitors" nameKey="browser" />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `BarChartMixedItem[]` (`name`, `value`, `fill`) | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `nameKey` | `string` | `"name"` |
| `barRadius` | `number` | `5` |
| `tickFormatter` | `(value: string) => string` | resolves from config labels |

### BarChartInteractive
Multi-series bar chart with toggle buttons showing totals per series.
```tsx
<BarChartInteractive
  data={data}
  config={config}
  series={[
    { dataKey: "desktop", label: "Desktop" },
    { dataKey: "mobile", label: "Mobile" },
  ]}
  xAxisKey="date"
  xAxisFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
/>
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `Record<string, unknown>[]` | required |
| `config` | `ChartConfig` | required |
| `series` | `BarChartInteractiveSeries[]` (`dataKey`, `label`) | required |
| `xAxisKey` | `string` | `"date"` |
| `xAxisFormatter` | `(value: string) => string` | — |
| `tooltipLabelFormatter` | `(value: string) => string` | — |
| `tooltipNameKey` | `string` | — |
| `height` | `number` | `250` |
| `defaultActiveKey` | `string` | first series key |

### LineChartDotsColors
Single-series line with per-point colored dots.
```tsx
<LineChartDotsColors data={data} config={config} />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `LineChartDotsColorItem[]` (`name`, `value`, `fill`) | required |
| `config` | `ChartConfig` | required |
| `valueKey` | `string` | `"value"` |
| `nameKey` | `string` | `"name"` |
| `strokeColor` | `string` | `"var(--chart-1)"` |

### LineChartMulti
Multi-series line chart with per-series colors.
```tsx
<LineChartMulti data={data} config={config} series={series} />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `Record<string, unknown>[]` | required |
| `config` | `ChartConfig` | required |
| `series` | `LineChartMultiSeries[]` (`dataKey`, `color`, `label?`) | required |
| `xAxisKey` | `string` | `"name"` |
| `xAxisFormatter` | `(value: string) => string` | — |

### DonutChart
Donut with center value label.
```tsx
<DonutChart data={data} config={config} centerValue="$1.2M" centerLabel="Total" />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `DonutChartItem[]` (`name`, `value`, `fill`) | required |
| `config` | `ChartConfig` | required |
| `centerValue` | `string \| number` | — |
| `centerLabel` | `string` | — |
| `innerRadius` | `number` | — |

### DonutChartInteractive
Donut with dropdown selector + active segment highlight.
```tsx
<DonutChartInteractive data={data} config={config} centerLabel="Visitors" />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `DonutChartItem[]` | required |
| `config` | `ChartConfig` | required |
| `centerLabel` | `string` | — |
| `innerRadius` | `number` | — |
| `id` | `string` | — |

### RadarChartDots
Single or multi-series radar with polygon or circle grid. Optional legend.
```tsx
// Single series
<RadarChartDots data={data} config={config} />

// Circle grid
<RadarChartDots data={data} config={config} gridType="circle" />

// Multi-series with legend
<RadarChartDots data={data} config={config} axisKey="month"
  series={[
    { dataKey: "desktop", color: "var(--color-desktop)", fillOpacity: 0.6 },
    { dataKey: "mobile", color: "var(--color-mobile)" },
  ]}
  showLegend
/>
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `RadarChartItem[]` (`axis`, `value`, `[key: string]`) | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `axisKey` | `string` | `"axis"` |
| `color` | `string` | `var(--color-{dataKey})` |
| `fillOpacity` | `number` | `0.6` |
| `gridType` | `"polygon" \| "circle"` | `"polygon"` |
| `series` | `RadarSeries[]` | — |
| `showLegend` | `boolean` | `false` |

### RadialChart
Concentric arcs with labels (radial bar chart).
```tsx
<RadialChart data={data} config={config} nameKey="browser" dataKey="visitors" />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `RadialChartItem[]` (`name`, `value`, `fill`) | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `nameKey` | `string` | `"name"` |
| `startAngle` | `number` | `-90` |
| `endAngle` | `number` | `380` |
| `innerRadius` | `number` | `30` |
| `outerRadius` | `number` | `110` |
| `showLabels` | `boolean` | `true` |
| `showBackground` | `boolean` | `true` |

### RadialGauge
Gauge-style radial with center value and shaped background ring.
```tsx
<RadialGauge data={data} config={config} centerLabel="Revenue" />
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `RadialChartItem[]` | required |
| `config` | `ChartConfig` | required |
| `dataKey` | `string` | `"value"` |
| `centerValue` | `string \| number` | auto (first item value) |
| `centerLabel` | `string` | — |
| `endAngle` | `number` | `100` |
| `innerRadius` | `number` | `80` |
| `outerRadius` | `number` | `140` |

### RadialStacked
Stacked half-circle radial with center total.
```tsx
<RadialStacked data={data} config={config}
  series={[
    { dataKey: "desktop", color: "var(--color-desktop)" },
    { dataKey: "mobile", color: "var(--color-mobile)" },
  ]}
  centerLabel="Total"
/>
```
| Prop | Type | Default |
|------|------|---------|
| `data` | `Record<string, unknown>[]` | required |
| `config` | `ChartConfig` | required |
| `series` | `RadialStackedSeries[]` (`dataKey`, `color`) | required |
| `centerValue` | `string \| number` | auto (sum of series) |
| `centerLabel` | `string` | — |
| `endAngle` | `number` | `180` |
| `innerRadius` | `number` | `80` |
| `outerRadius` | `number` | `130` |
| `cornerRadius` | `number` | `5` |

## Tooltip Patterns

All components use shadcn `ChartTooltip` / `ChartTooltipContent`. Key options:

| Pattern | How |
|---------|-----|
| Line indicator | `<ChartTooltipContent indicator="line" />` |
| Hide label | `<ChartTooltipContent hideLabel />` |
| Icons in tooltip | Add `icon: LucideIcon` to each `ChartConfig` entry |
| Custom formatter with totals | Pass `formatter` prop to `ChartTooltipContent` — render color dot, label, value+unit, and conditional total row at last index |
| Default visible tooltip | `<ChartTooltip defaultIndex={1} />` |

## ChartConfig Pattern
```tsx
const config = {
  series1: { label: "Label", color: "var(--chart-1)" },
  series2: { label: "Label", color: "var(--chart-2)", icon: SomeLucideIcon },
} satisfies ChartConfig;
```
Uses CSS variables `var(--chart-1)` through `var(--chart-5)` from the theme engine.

## Data Shape Rules
- `DonutChartItem` uses fixed fields: `name`, `value`, `fill` — no custom key props
- `RadarChartItem` uses `axis` + `value` (single-series) or `axis` + arbitrary keys (multi-series)
- `RadialChartItem` uses `name`, `value`, `fill`
- All chart containers default to `"mx-auto aspect-square max-h-[250px]"` — override via `className`
