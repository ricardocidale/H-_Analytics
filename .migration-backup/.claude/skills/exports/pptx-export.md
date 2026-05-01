# PowerPoint Export Sub-Skill

**File**: `client/src/lib/exports/pptxExport.ts`
**Library**: `pptxgenjs`
**Parent**: [SKILL.md](./SKILL.md)

## Overview

Generates branded `.pptx` presentations from financial data. Supports portfolio-level, property-level, and management company reports with enterprise title slides, metric cards, and financial tables.

## Comprehensive Behavior

All PPTX exports are **comprehensive** — clicking "PowerPoint" on any tab of any financial page produces a single deck containing all sections from that page, not just the active tab. Enterprise cover slide included on every deck.

| Page | Sections | Skill Doc |
|------|----------|-----------|
| Dashboard | KPIs + IS + CF + BS + Investment Analysis | [premium-export-spec.md](./premium-export-spec.md) |
| Property Detail | IS + CF + BS | [premium-export-spec.md](./premium-export-spec.md) |
| Company | IS + CF + BS | [premium-export-spec.md](./premium-export-spec.md) |

## Enterprise Title Slide

All PPTX exports include an enterprise-quality title slide matching the PDF cover page design:

- Full-bleed navy (`#1A2332`) background with subtle grid overlay (0.5" intervals)
- Sage (`#9FBCA4`) top and bottom border bars
- Sage vertical accent bar (0.08" wide) beside company name
- Company name in 32pt white bold text
- White horizontal divider rule
- Report title in 20pt sage green
- Subtitle in 13pt muted sage
- **Metadata card** (rounded rectangle, `#283241` fill, sage border):
  - REPORT type, DATE, CLASSIFICATION (CONFIDENTIAL)
- Confidential disclaimer in 7pt italic muted text at bottom
- Footer/page-numbering skipped on title slide via `addAllFooters(ctx, skipFirst=true)`

## Branding

| Token | Hex | Usage |
|-------|-----|-------|
| Navy | `#1A2332` | Title slide background |
| Sage Green | `#9FBCA4` | Accent bars, dividers, header backgrounds, metric labels |
| Dark Green | `#257D41` | Metric values, section titles |
| Dark Text | `#3D3D3D` | Table body text |
| White | `#FFFFFF` | Company name, title slide text |
| Light Gray | `#BBBBBB` | Footer text |

## Slide Types

| Type | Function | Description |
|------|----------|-------------|
| Title Slide | `addTitleSlide()` | Enterprise cover with grid, metadata card, disclaimer |
| Metrics Slide | `addMetricsSlide()` | 3-column grid of rounded cards with green values and gray labels (up to 9) |
| Table Slide | `addTableSlide()` | Full-width table with sage header row, bold totals, section highlighting |

## Exported Functions

### `exportPortfolioPPTX(data: PortfolioExportData)`
Full portfolio report: enterprise title slide, KPI metrics, four financial table sections (Income Statement, Cash Flow, Balance Sheet, Investment Analysis). Tables auto-paginate when projection years exceed 5.

### `exportPropertyPPTX(data: PropertyExportData)`
Single property report: title slide + three financial tables.

### `exportCompanyPPTX(data: CompanyExportData)`
Management company report: title slide + three financial tables.

## Data Interface

```ts
interface SlideTableRow {
  category: string;
  values: (string | number)[];
  indent?: number;
  isBold?: boolean;
}
```

All export functions expect table data in the shape:
```ts
{ years: string[], rows: SlideTableRow[] }
```

## Auto-Pagination

When projection years exceed 5, tables split across multiple slides with year ranges in the title (e.g., "Income Statement (2025–2029)" and "Income Statement (2030–2034)").

## Internal Helpers

| Function | Purpose |
|----------|---------|
| `addTitleSlide(ctx, title, subtitle, sourceTag)` | Enterprise cover slide with grid overlay and metadata card |
| `addMetricsSlide(ctx, title, metrics)` | KPI metric cards in 3-column grid |
| `addTableSlide(ctx, title, years, rows)` | Financial data table with auto-pagination |
| `addAllFooters(ctx, skipFirst?)` | "[Company] — Confidential" + page numbers on all slides (skips title slide by default) |

## Usage

```ts
import { exportPortfolioPPTX } from "@/lib/exports";

exportPortfolioPPTX({
  projectionYears,
  getFiscalYear,
  totalInitialEquity, totalExitValue, equityMultiple, portfolioIRR, cashOnCash,
  totalProperties, totalRooms,
  totalProjectionRevenue, totalProjectionNOI, totalProjectionCashFlow,
  incomeData: { years: years.map(String), rows: incomeRows },
  cashFlowData: { years: years.map(String), rows: cashFlowRows },
  balanceSheetData: { years: years.map(String), rows: balanceRows },
  investmentData: { years: years.map(String), rows: investmentRows },
});
```

## Integration with ExportMenu

```tsx
pptxAction(() => handlePptxExport())
```
