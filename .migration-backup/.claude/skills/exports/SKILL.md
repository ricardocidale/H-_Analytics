---
name: Export System
description: Premium multi-format export system using @react-pdf/renderer (PDF), Puppeteer (PNG only), and direct generators (PPTX/XLSX/DOCX). Single ExportMenu per page, statement→chart interleaving, theme-aware, formula filtering. No KPI sections, no cover pages.
---

# Export System

## Architecture

Two pipelines, unified by a single `ExportMenu` per page:

```
ExportMenu (dropdown) → ExportDialog (options + premium toggle)
  ├─ Premium ON → POST /api/exports/premium → Server pipeline
  │    compileReport() → ReportDefinition IR
  │    PDF:  @react-pdf/renderer → Buffer (no AI)
  │    PPTX: pptxgenjs → Buffer (no AI)
  │    XLSX: xlsx → Buffer (no AI)
  │    DOCX: docx → Buffer (no AI)
  │    PNG:  Puppeteer screenshots → ZIP buffer
  └─ Premium OFF → Client-side fallback (jsPDF, xlsx, pptxgenjs)

CSV: Always client-side (no dialog needed)
PNG: Always client-side (dom-to-image capture)
```

## Report Compiler

`server/report/compiler.ts` — single `compileReport()` produces `ReportDefinition` IR (types in `server/report/types.ts`).

Section types: `TableSection`, `ChartSection`, `ImageSection`. KPI sections are NEVER generated. Cover pages are NEVER included.

Chart screenshots from the client (captured via `dom-to-image-more`) are embedded as `ImageSection` entries in the report definition.

## Chart Screenshots

Client captures Overview charts before sending export payload:
- **File**: `client/src/lib/exports/captureOverviewCharts.ts`
- **Targets**: DOM elements with `data-export-section="investment-chart"`, `"revenue-chart"`, `"distribution-chart"`
- **Capture**: `dom-to-image-more` → base64 PNG
- **Cleanup**: CSS override sheet injected before capture (transparent borders, no box-shadow), removed after
- **Payload**: `chartScreenshots: Array<{dataUri, label}>` sent in premium export request
- **Server**: Embedded via `@react-pdf/renderer` `Image` component

CORS warning for Google Fonts cssRules is benign — does not affect capture quality.

## Quick Start

```tsx
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, docxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";

<ExportMenu
  actions={[
    pdfAction(() => { setExportType("pdf"); setExportDialogOpen(true); }),
    excelAction(() => { setExportType("xlsx"); setExportDialogOpen(true); }),
    pptxAction(() => { setExportType("pptx"); setExportDialogOpen(true); }),
    docxAction(() => { setExportType("docx"); setExportDialogOpen(true); }),
    csvAction(handleCSV),
    chartAction(handleChartPNG),
    pngAction(handleTablePNG),
  ]}
/>
```

**Placement**: One ExportMenu per page in `CurrentThemeTab` `rightContent` slot.

## ExportDialog Props

```typescript
interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (orientation, version, filename?) => void;
  title: string;
  premiumFormat?: "pdf" | "xlsx" | "pptx" | "docx";
  showVersionOption?: boolean;
  getPremiumExportData?: (version) => Promise<PremiumExportPayload | null> | PremiumExportPayload | null;
}
```

## Report Structure

See [premium-export-spec.md](./premium-export-spec.md) for full SDD.

Each export produces:
1. Chart screenshots (Overview tab only — embedded as images)
2. Income Statement → Income charts
3. Cash Flow → Cash Flow charts
4. Balance Sheet → Balance Sheet charts
5. Investment Analysis → Investment charts (not Company)

**No cover pages. No KPI sections. Ever.**

## Server-Recompute (Export Reproducibility Lock)

**File**: `server/report/server-export-data.ts`

When `computeRef` is in the export payload, the server ignores client-supplied financial data and recomputes:

```typescript
POST /api/exports/premium
Body: {
  format: "xlsx",
  entityName: "...",
  computeRef: {                    // Triggers server-recompute
    propertyIds?: number[],        // Optional filter (positive ints)
    projectionYears?: number,      // 1-30, optional
  }
}
Response Headers:
  X-Finance-Output-Hash: <64-char SHA-256>
  X-Finance-Engine-Version: 1.0.0
```

Lock enforcement: if `computeRef` present but user unauthenticated → 401 (never falls through to legacy path).

DB mapping gotchas:
- `globalAssumptions.debtAssumptions` is JSONB — cast to `Record<string, unknown>` before accessing fields
- Export row `format` must use the Zod enum union, not `string`

## Key Rules

1. **Full-scope**: Export from ANY tab exports ALL statements — never just the active tab
2. **Statement→Chart**: Each table is followed by a chart page
3. **Formula filtering**: Rows with `isItalic=true` are NEVER exported
4. **Short/Extended**: Short = header/total rows only; Extended = all line items
5. **Theme colors**: Passed via `themeColors` in payload, resolved by `resolveThemeColors()`
6. **File save**: `saveFile()` tries native `showSaveFilePicker`, falls back to download
7. **No KPI/cover**: Compiler never generates KPI sections; cover pages permanently removed

## Row-Builder Helpers

**File**: `client/src/lib/exports/row-builders.ts`

```typescript
import { headerRow, lineItem, subtotalRow, spacerRow, formulaRow, yearValues, consolidate } from "@/lib/exports";

headerRow("REVENUE", values)
lineItem("Room Revenue", values, { indent: 1 })
subtotalRow("Gross Operating Profit", values)
spacerRow(yearCount)
formulaRow("= Revenue − Expenses", values)
yearValues(years, cache, item => item.revenueTotal)
consolidate(years, allProps, item => item.cfo)
```

## Format Matrix

| Format | AI? | Library | Content |
|--------|-----|---------|---------|
| PDF | No | @react-pdf/renderer | Full report with chart screenshots + tables |
| PPTX | No | pptxgenjs | 16:9 slides |
| Excel | No | xlsx | One worksheet per statement |
| DOCX | No | docx | Tables/charts as images |
| CSV | No | — | Tables only, client-side |
| PNG | No | Puppeteer / dom-to-image | DOM capture |

## Data Generators

| Function | File | What |
|----------|------|------|
| `generatePortfolioIncomeData` | `dashboardExports.ts` | Consolidated income |
| `generatePortfolioCashFlowData` | `dashboardExports.ts` | CFO/CFI/CFF |
| `generatePortfolioBalanceSheetData` | `dashboardExports.ts` | Assets/Liabilities/Equity |
| `generatePortfolioInvestmentData` | `dashboardExports.ts` | IRR/EM/CoC + breakdowns |
| `generateCompanyIncomeData` | `company-data.ts` | Management co income |
| `generateCompanyCashFlowData` | `company-data.ts` | Management co cash flow |
| `generateCompanyBalanceData` | `company-data.ts` | Management co balance sheet |

All accept `summaryOnly` parameter for short/extended.

## Key Files

| File | Purpose |
|------|---------|
| `server/report/compiler.ts` | Unified report compiler (ReportDefinition IR) |
| `server/report/types.ts` | IR types: TableSection, ChartSection, ImageSection |
| `server/pdf/render.tsx` | @react-pdf/renderer PDF generation |
| `server/routes/premium-exports.ts` | Server export pipeline, all format generators |
| `server/browser-renderer.ts` | Puppeteer abstraction (PNG only) |
| `client/src/components/ExportDialog.tsx` | Export dialog UI, premium toggle |
| `client/src/components/ui/export-toolbar.tsx` | ExportMenu dropdown + action helpers |
| `client/src/lib/exports/captureOverviewCharts.ts` | DOM chart capture with CSS cleanup |
| `client/src/lib/exports/saveFile.ts` | Native file picker + download fallback |

## Sub-Skills

| Skill | What |
|-------|------|
| [premium-export-spec.md](./premium-export-spec.md) | Full SDD: sections, themes, format rules |
| [pdf-rendering.md](./pdf-rendering.md) | @react-pdf/renderer + Puppeteer PNG pipeline |
| [excel-export.md](./excel-export.md) | Client-side xlsx generation |
| [pptx-export.md](./pptx-export.md) | Client-side pptxgenjs generation |
| [csv-export.md](./csv-export.md) | CSV download utility |
| [png-export.md](./png-export.md) | DOM capture utility |
