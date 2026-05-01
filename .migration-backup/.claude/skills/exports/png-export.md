# PNG Export Sub-Skill

**File**: `client/src/lib/exports/pngExport.ts`
**Library**: `dom-to-image-more`
**Parent**: [SKILL.md](./SKILL.md)

## Overview

Captures DOM elements (tables and charts) as high-resolution PNG images. Supports accordion collapse for clean table captures and includes SVG serialization fallback.

## Comprehensive Behavior

PNG exports capture the **full tab content** of the active view via DOM screenshot. No cover page. PNG is the one format that is inherently per-tab (it captures what's visible on screen). All other formats produce comprehensive all-tabs reports.

## Exported Functions

### `exportTablePNG(options: TablePNGOptions)`

Captures an HTML table element as a PNG with clean formatting.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `element` | `HTMLElement` | required | The table DOM element |
| `filename` | `string` | required | Download filename |
| `scale` | `number` | `2` | Resolution multiplier |
| `collapseAccordions` | `boolean` | `true` | Hide expandable rows |

**Accordion behavior**: Rows with `data-expandable-row="true"` are hidden during capture. Cell borders are removed and replaced with subtle bottom lines. All DOM modifications are restored after capture.

### `exportChartPNG(options: ChartPNGOptions)`

Captures a chart container element as a PNG.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `element` | `HTMLElement` | required | The chart DOM element |
| `filename` | `string` | required | Download filename |
| `width` | `number` | auto | Override width |
| `height` | `number` | auto | Override height |
| `scale` | `number` | `2` | Resolution multiplier |

### `captureChartAsImage(containerRef: HTMLDivElement): Promise<string | null>`

Captures a chart container and returns a base64 data URL for embedding in PDFs. Includes SVG serialization fallback if dom-to-image fails.

## Usage

```ts
import { exportTablePNG, captureChartAsImage } from "@/lib/exports";

// Direct table download
await exportTablePNG({ element: tableEl, filename: "income-statement.png" });

// Capture for PDF embedding
const dataUrl = await captureChartAsImage(chartRef.current);
if (dataUrl) doc.addImage(dataUrl, "PNG", 10, 10, 270, 120);
```

## Integration with ExportMenu

```tsx
pngAction(() => exportTablePNG({ element: tableRef.current, filename: "my-table.png" }))
chartAction(() => { setExportType('chart'); setExportDialogOpen(true); })
```
