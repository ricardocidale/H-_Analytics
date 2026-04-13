---
name: export-system
description: Shared formatting, styling, and generation patterns for all document exports (PDF, PPTX, Excel, CSV, PNG). Covers brand palette, row data model, number formatting, and export orchestrators. Use when working on any document export feature.
---

Shared formatting, styling, and generation patterns for all document exports (PDF, PPTX, Excel, CSV, PNG) used across the hospitality business portal. Covers brand palette, row data model, number formatting, PDF/PPTX/Excel/CSV/PNG helpers, and dashboard export orchestrators. Use this skill when working on any document export feature.

## Three Cardinal Export Rules

1. **Full-scope export**: Clicking Export from ANY tab exports ALL financial statements and analysis for the entity — never just the current tab. Applies to both premium and non-premium exports equally.
2. **Dual save destination**: Both premium and non-premium exports offer Local Drive and Google Drive as save targets.
3. **File naming at save step**: The user renames the file when selecting the save folder/location — not in the export dialog. The export dialog does NOT include a filename input field.

## Quick Start

```tsx
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";

<ExportMenu
  actions={[
    pdfAction(() => handlePdf()),
    excelAction(() => handleExcel()),
    csvAction(() => handleCsv()),
    pptxAction(() => handlePptx()),
    chartAction(() => handleChart()),
    pngAction(() => handleTablePng()),
  ]}
/>
```

**Placement rules:**
- Tabbed pages -> `CurrentThemeTab` `rightContent` slot
- Non-tabbed pages -> `PageHeader` `actions` slot

## ExportMenu Component

**File**: `client/src/components/ui/export-toolbar.tsx`

### Action Helpers

| Helper | Label | Test ID |
|--------|-------|---------|
| `pdfAction(fn)` | PDF | `button-export-pdf` |
| `excelAction(fn)` | Excel | `button-export-excel` |
| `csvAction(fn)` | CSV | `button-export-csv` |
| `pptxAction(fn)` | PowerPoint | `button-export-pptx` |
| `chartAction(fn)` | Chart as Image | `button-export-chart` |
| `pngAction(fn)` | Table as PNG | `button-export-table-png` |

### Variants
- `"glass"` (default) — Dark-themed pages (Dashboard, PropertyDetail, Company)
- `"light"` — Light-themed pages (assumptions, research)

## Export Formats

### 1. Excel (XLSX)
**File:** `client/src/lib/exports/excelExport.ts` | **Library:** `xlsx` (SheetJS)

Formatted workbooks with currency/percentage formatting, bold section headers, configurable column widths.

### 2. PowerPoint (PPTX)
**File:** `client/src/lib/exports/pptxExport.ts` | **Library:** `pptxgenjs`

Branded presentations with HBG colors. Three scopes: `exportPortfolioPPTX`, `exportPropertyPPTX`, `exportCompanyPPTX`. Auto-paginates when years > 5.

### 3. PDF (Charts + Tables)
**File:** `client/src/lib/exports/pdfChartDrawer.ts` | **Library:** `jspdf` + `jspdf-autotable`

Renders line charts directly into jsPDF with colored series and data points.

### 4. PNG (DOM Capture)
**File:** `client/src/lib/exports/pngExport.ts` | **Library:** `dom-to-image-more`

Captures table or chart DOM elements at 2x resolution. Auto-collapses accordion rows.

### 5. CSV
**File:** `client/src/lib/exports/csvExport.ts`

Lightweight `downloadCSV(content, filename)` Blob-based download.

## Per-Category Export Configuration

Admins configure which sections appear in each report category via Admin → Exports tab. Three categories mirror the three export types: Overview, Financial Statements, and Financial Analysis.

### Architecture

| Layer | File | Purpose |
|-------|------|---------|
| TypeScript interface | `client/src/lib/exportConfig.ts` | `ExportConfig` type + `DEFAULT_EXPORT_CONFIG` + localStorage load/save |
| Server validation | `server/routes/admin/exports.ts` | Zod schema, `GET/PUT /api/admin/export-config`, DB persistence via `global_assumptions.exportConfig` |
| Admin UI | `client/src/components/admin/ExportsTab.tsx` | Three-tab config panel with `SectionToggle`, `SettingSwitch`, `GroupHeader`, `ContentCard`, `SettingsCard` |
| Consumer | `client/src/components/dashboard/exportRenderers.ts` | `loadExportConfig()` gates each section at render time |

### ExportConfig Interface

Each category has format settings (orientation, length, quality) plus section-specific boolean toggles:

- **overview** — `kpiMetrics`, `revenueChart`, `projectionTable`, `compositionTables`, `compositionCharts`, `waterfallTable`, `propertyInsights`, `aiInsights`
- **statements** — `incomeStatement`, `incomeChart`, `cashFlow`, `cashFlowChart`, `balanceSheet`, `balanceSheetChart`, `detailedLineItems`
- **analysis** — `kpiSummaryCards`, `returnChart`, `freeCashFlowTable`, `propertyIrrTable`, `dcfAnalysis`, `performanceTrend`

Shared format fields per category: `allowLandscape`, `allowPortrait`, `allowShort`, `allowExtended`, `allowPremium`, `densePagination`.

### Adding a New Export Section Toggle

1. **`client/src/lib/exportConfig.ts`** — Add the boolean field to the relevant category in `ExportConfig` and `DEFAULT_EXPORT_CONFIG`
2. **`server/routes/admin/exports.ts`** — Add the field to the matching Zod schema category and to `DEFAULT_EXPORT_CONFIG`
3. **`client/src/components/admin/ExportsTab.tsx`** — Add a `SectionToggle` in the relevant tab
4. **`client/src/components/dashboard/exportRenderers.ts`** — Gate the section render with `cfg.{category}.{field}`

### Admin UI Components

| Component | Purpose |
|-----------|---------|
| `SectionToggle` | Checkbox + label + description — for toggling report sections on/off |
| `SettingSwitch` | Switch + label + description — for format settings (orientation, quality) |
| `GroupHeader` | Uppercase label with rule line — groups related toggles |
| `ContentCard` | Two-column split card — houses section toggles |
| `SettingsCard` | Single-column card — houses format switches |
| `SubHeader` | Lighter uppercase label — sub-groups within a settings card |

## Premium Export Pipeline (Server-Side)

Server-side LLM-enhanced PDF/PPTX/DOCX/PNG generation. Split into focused modules:

| File | Purpose |
|------|---------|
| `server/routes/premium-exports.ts` | Route dispatcher — format selection, theme resolution, SSE streaming |
| `server/routes/premium-pdf-pipeline.ts` | PDF section builder, LLM design integration, `buildPdfSectionsFromData()`, `generatePdfBuffer()` |
| `server/routes/premium-export-prompts.ts` | LLM prompt templates, `BRAND` constants |
| `server/routes/format-generators/excel-generator.ts` | Premium Excel workbook generation |
| `server/routes/format-generators/pptx-generator.ts` | Premium PowerPoint generation |
| `server/routes/format-generators/docx-generator.ts` | Premium Word document generation |
| `server/routes/format-generators/png-generator.ts` | Premium PNG snapshot generation |
| `server/routes/pdf-html-templates.ts` | HTML template builder for PDF rendering, `PdfSection` interface |
| `server/pdf/pdf-styles.ts` | CSS stylesheet for PDF rendering |
| `server/pdf/browser-renderer.ts` | Playwright-based HTML→PDF renderer |
| `server/pdf/theme-resolver.ts` | Theme color resolution, `PdfTemplateData` interface |
| `server/pdf/svg-charts.ts` | SVG chart generators for PDF embeds |
| `server/pdf/table-renderer.ts` | HTML table renderer for PDF |

## Branding & Theming

Brand palette is dynamic — resolved from user group theme colors at export time via `buildBrandPalette(themeColors)` from `exportStyles.ts`. Defaults (when no theme colors are set):

| Token | Hex | Usage |
|-------|-----|-------|
| PRIMARY | `#18181B` (near-black) | Headings, buttons, active nav |
| SECONDARY | `#3F3F46` (zinc-700) | Badges, contrast elements |
| ACCENT | `#10B981` (emerald) | KPI highlights, success indicators |
| FG | `#3D3D3D` | Table body text |
| BG | `#FFFFFF` | Page backgrounds |

## Portfolio Data Generators

**File:** `client/src/components/dashboard/dashboardExports.ts`

| Function | Returns |
|----------|---------|
| `generatePortfolioIncomeData` | Revenue, expenses, GOP, fees, NOI, Net Income |
| `generatePortfolioCashFlowData` | CFO, CFI, CFF, Net Change in Cash |
| `generatePortfolioInvestmentData` | Equity, exit value, IRR, multiple |

Portfolio wrappers: `exportPortfolioExcel`, `exportPortfolioCSV`, `exportPortfolioPDF`

## Page Coverage Matrix

| Page | PDF | Excel | CSV | PPTX | Chart PNG | Table PNG |
|------|-----|-------|-----|------|-----------|-----------|
| Dashboard | Per-tab | Multi-sheet | Per-tab | Portfolio slides | Tab capture | Tab capture |
| PropertyDetail | Income + CF | Per-statement | Cash Flow | Property slides | Chart | Table |
| Company | Per-statement | Per-statement | Per-statement | Company slides | Chart | Table |
| Sensitivity | Tornado + table | Scenario data | Scenario data | Scenario slides | — | — |

## Row-Builder Helpers

**File**: `client/src/lib/exports/row-builders.ts` (re-exported from `@/lib/exports`)

Use these type-safe helpers instead of raw `{ category, values, ... }` object literals:

| Helper | Creates |
|--------|---------|
| `headerRow(label, values)` | Section header with `isHeader: true` |
| `lineItem(label, values, { indent, format })` | Indented line item |
| `subtotalRow(label, values)` | Bold subtotal row |
| `spacerRow(yearCount)` | Empty separator |
| `formulaRow(text, values)` | Italic formula/note row |
| `yearValues(years, cache, accessor)` | Extract values from yearly cache array |
| `consolidate(years, allProps, accessor)` | Sum across all properties per year |
| `toExportShape(data)` | Convert `ExportData` to PPTX-compatible shape |

## Wiring Exports into a New Page

### Step 1 — Generate structured data using row-builder helpers
```ts
import { headerRow, lineItem, subtotalRow, yearValues, type ExportData } from "@/lib/exports";

function generateData(cache, years): ExportData {
  return {
    years,
    rows: [
      headerRow("REVENUE", yearValues(years, cache, c => c.revenueTotal)),
      lineItem("Room Revenue", yearValues(years, cache, c => c.revenueRooms), { indent: 1 }),
      subtotalRow("Total Revenue", yearValues(years, cache, c => c.revenueTotal)),
    ],
  };
}
```

### Step 2 — Create format handlers (handleExcel, handlePptx, handleCsv, handlePdf, handleTablePng, handleChartPng)

### Step 3 — Wire into ExportMenu via action helpers in `CurrentThemeTab` `rightContent` or `PageHeader` `actions`

### Step 4 — Add ExportDialog for orientation-dependent formats (PDF, chart)

## Export Audit Script

Run `npx tsx script/export-audit.ts` to validate the full export wiring:
- All core export files exist
- All data generators present and referenced
- All pages × formats are wired
- Brand palette centralized in `exportStyles.ts`
- No stray/orphan modules

## Financial Helpers for Exports

**File**: `client/src/lib/financial/portfolio-helpers.ts`

Shared helpers used by both `dashboardExports.ts` and `portfolio-sheet.ts`:

| Helper | Purpose |
|--------|---------|
| `sumMonthlyField(months, field)` | Sum a single field across monthly financials |
| `yearEndSlice(financials, yearIdx)` | Get months 0..(yearIdx+1)*12 |
| `lastMonthOfYear(financials, yearIdx)` | Get the last month of a year |
| `propertyPPE(purchasePrice, improvements)` | Property plant & equipment total |

Always use `acquisitionYearIndex()` from `equityCalculations.ts` instead of inline acquisition year derivation.

## Script Helpers

**File**: `script/lib/runners.ts`

| Helper | Purpose |
|--------|---------|
| `shell(cmd, timeout)` | Safe `execSync` wrapper with error capture |
| `runTsc()` | Run TypeScript check, return `{ passed, errorCount, firstError }` |
| `countTestsFromFiles()` | Fast test count via `rg` (no vitest needed) |
| `countFiles(dir, exts)` | Walk directory for file/line counts |

Used by `stats.ts`, `lint-summary.ts`, and available for any new scripts.

## Dependencies

| Package | Purpose |
|---------|---------|
| `xlsx` | Excel workbook generation |
| `pptxgenjs` | PowerPoint slide generation |
| `jspdf` + `jspdf-autotable` | PDF document + table rendering |
| `dom-to-image-more` | DOM-to-PNG capture |
