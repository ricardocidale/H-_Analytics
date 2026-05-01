# Premium Export Specification (SDD)

## Pipeline

```
Client (data + theme + chartScreenshots) → POST /api/exports/premium → Server
  compileReport(payload) → ReportDefinition IR
  PDF:  @react-pdf/renderer → Buffer (no AI)
  PPTX: pptxgenjs → Buffer (no AI)
  XLSX: xlsx → Buffer (no AI)
  DOCX: docx → Buffer (no AI)
  PNG:  Puppeteer screenshots → ZIP (no AI)
  CSV:  Client-side only (no server)
```

## Section Ordering

| # | Section | Dashboard | Property | Company |
|---|---------|-----------|----------|---------|
| 1 | Chart Screenshots (images) | Yes (Overview) | No | No |
| 2 | Income Statement | Yes | Yes | Yes |
| 3 | Income charts | Yes | Yes | Yes |
| 4 | Cash Flow | Yes | Yes | Yes |
| 5 | Cash Flow charts | Yes | Yes | Yes |
| 6 | Balance Sheet | Yes | Yes | Yes |
| 7 | Balance Sheet charts | Yes | Yes | Yes |
| 8 | Investment Analysis | Yes | Yes | No |
| 9 | Investment charts | Yes | Yes | No |

**No cover pages. No KPI sections. Ever.**

## Chart Screenshots

Client captures 3 Overview charts before export:
- `data-export-section="investment-chart"` — Investment Performance
- `data-export-section="revenue-chart"` — Revenue Breakdown
- `data-export-section="distribution-chart"` — Distribution

Captured via `dom-to-image-more` with CSS cleanup (transparent borders, no shadows).
Sent as `chartScreenshots: Array<{dataUri: string, label: string}>`.
Server embeds as `ImageSection` entries via `@react-pdf/renderer` `Image` component.

## Short vs Extended

| Statement | Short | Extended |
|-----------|-------|----------|
| Income | Headers + totals only | All line items |
| Cash Flow | CFO/CFI/CFF totals | All items |
| Balance Sheet | Total Assets, Total L+E | All components |
| Investment | Summary metrics | Full breakdowns |

**Formula rows (isItalic=true) NEVER exported.**

## Per-Statement Charts

- **Income**: Revenue, GOP, NOI, ANOI (multi-series line chart, colors: #18181b, #3B82F6, #F59E0B, #6B7280)
- **Cash Flow**: NOI, ANOI, Cash Flow, FCFE (multi-series line chart, colors: #F59E0B, #6B7280, #8B5CF6, #6B7280)
- **Balance Sheet**: Total Assets, Total Liabilities (multi-series line chart, colors: #257D41, #F4795B)
- **Investment**: NOI, ANOI, FCFE (multi-series line chart, colors: #10B981, #257D41, #8B5CF6)

## Theme Color Mapping

Client sends `themeColors: Array<{name, hexCode, rank}>`. Server resolves:

| Rank | Role | Fallback |
|------|------|----------|
| 0 (Primary) | navy — headers | #1A2332 |
| 1 | sage — accents, bars | #9FBCA4 |
| 2 | darkGreen — titles | #257D41 |
| 3 | darkText — body | #3D3D3D |
| 4 | gray — secondary | #666666 |

Function: `resolveThemeColors()` in `server/report/compiler.ts`.

## Section Types (IR)

```typescript
type SectionKind = "kpi" | "table" | "chart" | "image";

interface TableSection { kind: "table"; title: string; years: string[]; rows: TableRow[]; }
interface ChartSection { kind: "chart"; title: string; series: ChartSeries[]; years: string[]; }
interface ImageSection { kind: "image"; title: string; dataUri: string; aspectRatio?: number; }
```

Note: KPI type exists in IR definition but compiler NEVER generates it.

## Format Rules

| Format | Content | AI? | Notes |
|--------|---------|-----|-------|
| PDF | Full report via @react-pdf/renderer | No | Chart screenshots + statement→chart pages |
| PPTX | 16:9 slides, landscape only | No | Table slides |
| Excel | One worksheet per statement | No | No charts |
| DOCX | Pages with tables | No | Portrait |
| CSV | Statement tables only | No | Client-side |
| PNG | Each page as PNG in ZIP | No | Puppeteer screenshots |

## Schema Fields

```typescript
premiumExportSchema = {
  format: "xlsx" | "pptx" | "pdf" | "docx",
  orientation: "landscape" | "portrait",
  version: "short" | "extended",
  themeColors: Array<{name, hexCode, rank?}>,
  entityName: string,
  companyName: string,
  statements: Array<{title, years, rows}>,
  chartScreenshots?: Array<{dataUri, label}>,
}
```

## API Reference

```
POST /api/exports/premium
  Auth: Required (session cookie)
  Body: premiumExportSchema (see Schema Fields above)
  Success: 200 → Buffer
    Content-Type: varies by format
    Content-Disposition: attachment; filename="Company - Report.ext"
  Error 400: Invalid schema → { error, details }
  Error 503: Service unavailable → { error, format }
  Error 504: Generation timeout → { error, format }
  Error 500: Other → { error, format }

GET /api/exports/premium/status
  Auth: Required
  Response: { available: boolean, formats: ["xlsx","pptx","pdf","docx","png"] }
```

## Key Files

| File | Purpose |
|------|---------|
| `server/report/compiler.ts` | Unified report compiler (ReportDefinition IR) |
| `server/report/types.ts` | IR types (TableSection, ChartSection, ImageSection) |
| `server/pdf/render.tsx` | @react-pdf/renderer PDF generation |
| `server/routes/premium-exports.ts` | Route handler, format generators |
| `server/browser-renderer.ts` | Puppeteer abstraction (PNG only) |
| `client/src/lib/exports/captureOverviewCharts.ts` | DOM chart capture with CSS cleanup |
| `client/src/components/ExportDialog.tsx` | Export dialog UI |
| `client/src/components/ui/export-toolbar.tsx` | ExportMenu dropdown |
