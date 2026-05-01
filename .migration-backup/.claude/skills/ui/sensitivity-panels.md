---
name: Sensitivity Analysis Panel Components
description: Extracted panel components for the SensitivityAnalysis page — sliders, tornado chart, comparison table
---

# Sensitivity Analysis Panel Components

## Purpose
Documents the extracted panel components under `client/src/components/sensitivity/`. The `SensitivityAnalysis` page (~310 lines) owns all `useMemo`/`useCallback` computations and state; panels receive pre-computed data as props.

## File Map

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `SensitivityVariable`, `ScenarioResult`, `TornadoItem` | Shared interfaces for all 3 panels |
| `VariableSlidersPanel.tsx` | `VariableSlidersPanel` | 6 range sliders for adjusting assumptions |
| `TornadoChartPanel.tsx` | `TornadoChartPanel` | Horizontal bar chart (Recharts) with NOI/IRR toggle |
| `SensitivityComparisonTable.tsx` | `SensitivityComparisonTable` | Base vs adjusted side-by-side table with delta |
| `index.ts` | barrel | Re-exports all 3 components + 3 types |

## Import Pattern

```ts
import {
  VariableSlidersPanel,
  TornadoChartPanel,
  SensitivityComparisonTable,
  type SensitivityVariable,
  type ScenarioResult,
  type TornadoItem,
} from "@/components/sensitivity";
```

## Types Reference

```ts
interface SensitivityVariable {
  id: string;
  label: string;
  unit: string;
  step: number;
  range: [number, number];
  defaultValue: number;
  description: string;
}

interface ScenarioResult {
  totalRevenue: number;
  totalNOI: number;
  totalCashFlow: number;
  avgNOIMargin: number;  // already multiplied by 100 (percentage)
  exitValue: number;
  irr: number;           // decimal (e.g. 0.18 for 18%)
}

interface TornadoItem {
  name: string;
  positive: number;   // upside delta (pp or %)
  negative: number;   // downside delta (always negative)
  spread: number;     // Math.abs(positive - negative)
  upLabel: string;    // e.g. "+10pp"
  downLabel: string;  // e.g. "-10pp"
}
```

## Props Reference

### VariableSlidersPanel
```ts
interface Props {
  variables: SensitivityVariable[];
  adjustments: Record<string, number>;   // keyed by variable id, value is delta
  onAdjustmentChange: (id: string, value: number) => void;
}
```

### TornadoChartPanel
```ts
interface Props {
  tornadoData: TornadoItem[];
  tornadoMetric: "noi" | "irr";
  onMetricChange: (metric: "noi" | "irr") => void;
}
```

### SensitivityComparisonTable
```ts
interface Props {
  baseResult: ScenarioResult;
  adjustedResult: ScenarioResult;
}
// Only rendered when hasAdjustments is true (page-level guard)
```

## Architecture Notes

- **All computation stays in the page** — `runScenario()`, `baseResult`, `adjustedResult`, and `tornadoData` are all `useMemo`/`useCallback` values in `SensitivityAnalysis.tsx`. They are tightly interdependent (same `runScenario` callback feeds base, adjusted, and all tornado swings).
- **`embedded` prop** — `SensitivityAnalysis` accepts `embedded?: boolean`. When true, it skips the `Layout` wrapper and `PageHeader` (used when embedded inside `Analysis.tsx`). The panels are unaffected.
- **Tornado chart uses stacked bars** — `positive` and `negative` dataKeys on a single `stackId="tornado"` with `ReferenceLine x={0}`.
- **Refs for export** — The page wraps `<TornadoChartPanel>` in a `ref={chartRef}` div and `<SensitivityComparisonTable>` in a `ref={tableRef}` div for ExportMenu capture.

## ExportMenu
`SensitivityAnalysis.tsx` includes all 6 export formats (export parity rule):
- PDF: jsPDF + autoTable (comparison table + tornado table)
- Excel: 2 sheets via xlsx
- CSV: downloadCSV
- PPTX: pptxgenjs (3 slides)
- Chart: captureChartAsImage on chartRef
- PNG: exportTablePNG on tableRef

## Related Files
- `client/src/pages/SensitivityAnalysis.tsx` — ~310-line shell with all computation and ExportMenu
- `client/src/pages/Analysis.tsx` — embeds SensitivityAnalysis with `embedded={true}`
