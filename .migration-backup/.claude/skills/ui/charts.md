# Chart Styling Patterns

## Framework

- **Library:** Recharts
- **Wrapper:** `<ResponsiveContainer>` for responsive sizing
- **Height:** Typically `h-[300px]` on the ResponsiveContainer

## Container Styling

```tsx
<div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
  <h3 className="text-lg font-display text-gray-900 mb-4">Chart Title</h3>
  <div className="h-[300px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        {/* ... */}
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
```

## Color Gradients

Define gradients inside `<defs>` within the chart SVG using CSS variable tokens:

```tsx
<defs>
  {/* Revenue / Chart 1 */}
  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
  </linearGradient>

  {/* GOP / Chart 2 */}
  <linearGradient id="gopGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
  </linearGradient>
</defs>
```

### Gradient ID Naming
- Revenue/NOI lines: ID pattern `*RevenueGradient` (e.g., `revenueGradient`, `noiRevenueGradient`)
- Gauges: `irrTube3D`, `smallTube3D_eq`, `smallTube3D_coc` (all using chart tokens)

## Area & Line Chart Toggle

Dashboards support switching between Area and Line views via the `ChartModeToggle` component.

```tsx
<ChartModeToggle mode={chartMode} onChange={setChartMode} />
```

- **Area Mode**: Uses `<Area>` with `stroke="none"` and `fill="url(#gradient)"` for a clean, fill-only look.
- **Line Mode**: Uses `<Line>` with `stroke="hsl(var(--chart-n))"` and `strokeWidth={2}`.

## Line & Area Styling

### Area Chart (Dashboard Pattern)
```tsx
<Area
  type="monotone"
  dataKey="revenue"
  stroke="none"
  fill="url(#revenueGradient)"
  fillOpacity={1}
/>
```

### Line Chart
```tsx
<Line
  type="monotone"
  dataKey="revenue"
  stroke="hsl(var(--chart-1))"
  strokeWidth={2}
  dot={false}
/>
```

## Axis Styling

### XAxis
```tsx
<XAxis
  dataKey="year"
  stroke="hsl(var(--muted-foreground))"
  fontSize={12}
  tickLine={false}
  axisLine={false}
/>
```

### YAxis
```tsx
<YAxis
  stroke="hsl(var(--muted-foreground))"
  fontSize={12}
  tickLine={false}
  axisLine={false}
  tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
/>
```

## Grid

```tsx
<CartesianGrid
  strokeDasharray="3 3"
  stroke="rgba(45,74,94,0.08)"
  vertical={false}
/>
```

## Tooltip

```tsx
<Tooltip
  contentStyle={{
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
    boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  }}
  formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
/>
```

## Legend

```tsx
<Legend
  verticalAlign="bottom"
  iconType="line"
/>
```

## Complete Example

```tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

<div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
  <h3 className="text-lg font-display text-gray-900 mb-4">
    Portfolio Performance
  </h3>
  <div className="h-[300px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#257D41" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
          <linearGradient id="gopGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#60A5FA" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis
          dataKey="year"
          stroke="#6B7280"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          stroke="#6B7280"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
          tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          }}
          formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`, undefined]}
        />
        <Legend verticalAlign="bottom" iconType="line" />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="url(#revenueGradient)"
          strokeWidth={3}
          dot={{ fill: '#257D41', stroke: '#fff', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="gop"
          name="GOP"
          stroke="url(#gopGradient)"
          strokeWidth={3}
          dot={{ fill: '#3B82F6', stroke: '#fff', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
```

## PDF Chart Export

For PDF exports, use `drawLineChart()` from `@/lib/pdfChartDrawer` which renders charts into jsPDF documents with matching styling. The `chartExport.ts` utility handles DOM-to-image conversion for PNG exports using `dom-to-image-more`.

---

## Waterfall Chart

Shows step-by-step breakdown from one financial total to another (e.g., Revenue → GOP → NOI → FCF).

- **File**: `client/src/components/charts/WaterfallChart.tsx`
- **Uses**: Recharts BarChart with stacked invisible + visible bars
- **Colors**: Positive steps = `accent`, Negative steps = `destructive`, Totals = `secondary`
- **Props**: `steps: { label, value, isTotal? }[]`, `title: string`, `formatValue: (v) => string`

---

## Heat Map

Color-coded grid showing property KPIs across months or years.

- **File**: `client/src/components/charts/HeatMap.tsx`
- **Color Scale**: Low = `destructive/20-60`, Mid = `muted/30`, High = `accent/20-80`
- **Props**: `data: { label, periods[] }[]`, `periodLabels`, `metric`, `formatValue`
- **Interaction**: Hover tooltip with exact value; click navigates to property detail

---

## Spider / Radar Chart

Compare multiple properties across 5-8 KPI dimensions simultaneously.

- **File**: `client/src/components/charts/RadarChart.tsx`
- **Uses**: Recharts RadarChart
- **Axes**: Revenue, NOI, Occupancy, ADR, DSCR, IRR, Cap Rate, GOP Margin
- **Colors**: Each property uses `chart-1` through `chart-5` tokens; fill 20%, stroke 80%
- **Props**: `properties: { name, metrics }[]`, `dimensions: string[]`

---

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
