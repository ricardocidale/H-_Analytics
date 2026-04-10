# Audit #323 — Server Exports & Report Generation

**Auditor**: Opus (automated deep review)  
**Date**: 2026-04-10  
**Scope**: `server/pdf/` (8 files, 900 lines), `server/report/` (4 files, 1,050 lines), `server/exports/` (1 file, 30 lines), `client/src/lib/exports/` (24 files, 5,905 lines)  
**Total**: 37 files, ~7,885 lines

---

## Verdict: **PASS** — 0 Critical, 1 High, 4 Medium, 5 Low

### Overall Resilience Score: **7.8 / 10**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Fault Isolation | 8/10 | PDF design-pass gracefully degrades on AI failure; client export errors caught and logged; server/report/ has zero catch blocks (see M-3) |
| Error Recovery | 7/10 | design-pass 4s timeout with fallback to defaults; chart capture retries; but IRR silently returns 0 on error |
| Data Integrity | 9/10 | Deterministic number formatting, brand palette resolution well-typed, fiscal year aggregation tested |
| Observability | 7/10 | 7 catch blocks use untyped `(e)` / `(err)` instead of `(error: unknown)` (see L-2); server/report/ has no error logging at all |
| Type Safety | 7/10 | 32 `as any` in client exports (see M-1), but zero in server/pdf/ and server/report/ — server side is exemplary |

Scoring methodology: Each dimension rated 1-10 based on adherence to production best practices. Overall = weighted average (fault isolation 25%, error recovery 20%, data integrity 25%, observability 15%, type safety 15%).

---

## Architecture Summary

### Server PDF Pipeline (`server/pdf/`)
- **React-to-PDF renderer** (`render.tsx`): Imports React components, applies AI design pass for layout hints, renders via `@react-pdf/renderer`. Design-pass failure gracefully falls back to `DEFAULT_HINTS`.
- **AI design pass** (`design-pass.ts`): LLM-driven layout optimization with 4-second timeout, Zod-validated response schema, proper `catch (err: unknown)` with `instanceof Error` check. Well-engineered resilience.
- **Chart rendering** (`chart-render.tsx`): SVG chart generation with `fmtCompact` and `monotoneCubicPath` helpers for bar+line combo charts. Theme-aware with grid lines and axis labels.
- **Table rendering** (`table-render.tsx`): Financial statement tables with section headers, alternating rows, indent levels, and USALI-compliant formatting.
- **Pagination** (`pagination.ts`): Dense section splitting for large financial tables with configurable row limits per page.
- **Theme system** (`theme.ts`, `theme-mappers.tsx`): Maps DB theme colors to PDF render tokens. Clean separation of concerns.

### Server Report Pipeline (`server/report/`)
- **Compiler** (`compiler.ts`): Orchestrates multi-section report generation. Accepts section config, iterates renderers, concatenates output.
- **Server export data** (`server-export-data.ts`): Prepares financial data for export — aggregates monthly data into yearly buckets, builds row metadata with proper USALI categorization.
- **SVG charts** (`svg-charts.ts`): Server-side SVG string generation for embedding in reports. Contains its own `fmtCompact` and `monotoneCubicPath` (duplicate — see H-1).
- **Section renderers** (`section-renderers.tsx`): Individual report section components for income statement, cash flow, balance sheet, return metrics.

### Server CSV Export (`server/exports/`)
- **CSV generator** (`csv-generator.ts`): Minimal 30-line file for server-side CSV generation. Clean and focused.

### Client Export Library (`client/src/lib/exports/`)
- **Shared foundation** (`exportStyles.ts`): Centralised `BrandPalette` type with semantic field names (never color-named), `buildBrandPalette()` for DB theme resolution, formatting helpers (`formatFull`, `formatShort`, `formatPct`, `formatByType`), row classification (`classifyRow`), Title Case normalization with financial abbreviation preservation.
- **PDF helpers** (`pdfHelpers.ts`): jsPDF branded layout — header bars, title/subtitle, dashboard summary cards with page-break awareness, financial table config with `didParseCell` styling callback, footer pagination.
- **PPTX slides** (`pptx/slide-helpers.ts`, `pptxExport.ts`): pptxgenjs-based deck generation with title slide (grid overlay pattern), metrics cards, financial table slides with auto-pagination and header repeat. Clean `SlideContext` pattern.
- **Excel workbooks** (`excel/helpers.ts`, `excel/property-sheets.ts`, `excel/portfolio-sheet.ts`): SheetJS-based workbook generation with currency formatting, section header detection, fiscal year aggregation.
- **PNG capture** (`pngExport.ts`, `domCapture.ts`, `captureOverviewCharts.ts`): DOM-to-canvas capture for chart/table screenshots.
- **CSV export** (`csvExport.ts`): Client-side CSV with proper escaping.
- **File save** (`saveFile.ts`): Modern File System Access API with fallback to `<a>` download. Handles `AbortError` correctly.
- **Research PDF** (`researchPdfExport.ts`): Property research report with branding fetch, logo embedding, auto-table sections, and confidentiality footer.
- **Company exports** (`companyExports.ts`): Management company financial statements (income statement, cash flow, balance sheet) in Excel and PPTX.
- **Checker manual** (`checkerManualExport.ts`): Verification/audit workpaper PDF export.

---

## Findings

### H-1: Duplicate `fmtCompact` + `monotoneCubicPath` across 4 locations (HIGH — DRY violation)

| Location | `fmtCompact` | `monotoneCubicPath` |
|----------|:---:|:---:|
| `server/pdf/chart-render.tsx` | ✅ exported | ✅ exported |
| `server/report/svg-charts.ts` | ✅ private | ✅ private |
| `server/theme-resolver.ts` | ✅ exported | — |
| `server/svg-charts.ts` | imported from theme-resolver | ✅ own copy |
| `client/…/exportRenderersPdfComprehensive.ts` | ✅ inline const | — |

**4 copies of `fmtCompact`** and **3 copies of `monotoneCubicPath`** exist. The implementations are semantically identical (compact dollar formatting: $500, $1.5K, $2.3M, $1.2B; and monotone cubic interpolation for SVG paths).

**Risk**: Bug fix applied to one copy won't propagate. The server/theme-resolver.ts version is already the canonical export — `server/svg-charts.ts` imports from it, but `server/pdf/chart-render.tsx` and `server/report/svg-charts.ts` maintain their own copies.

**Recommendation**: Extract both functions to a shared utility (e.g., `shared/format-utils.ts` or `server/utils/chart-math.ts`). Have all locations import from the single source. The test in `pdf-render.snapshot.test.ts` already covers these functions — just redirect imports.

---

### M-1: 32 `as any` casts in client export files (MEDIUM — type safety gap)

**Breakdown by cause:**

| Pattern | Count | Files | Necessary? |
|---------|-------|-------|------------|
| `(property as any).field` | 15 | property-sheets.ts (10), portfolio-sheet.ts (5) | **No** — `PropertyExportContext.property` should be typed |
| `(ctx.property as any)` / `(ctx.global as any)` | 5 | propertyExportShared.ts | **No** — same root cause as above |
| `new (pptxgen as any)()` | 3 | pptxExport.ts | **Yes** — pptxgenjs typing gap (default export mismatch) |
| `(doc as any).lastAutoTable` / `.internal` | 4 | checkerManualExport.ts (2), researchPdfExport.ts (2) | **Partial** — jspdf-autotable augments but doesn't type `lastAutoTable` |
| `(window as any).showSaveFilePicker` | 1 | saveFile.ts | **Yes** — File System Access API not in lib.dom.d.ts |
| `ctx.pres.slides as any[]` | 1 | slide-helpers.ts | **Partial** — pptxgenjs types incomplete |
| `Object.entries(...) as any` | 1 | companyExports.ts | **No** — unnecessary, Object.entries returns `[string, unknown][]` |
| `docAny as any` | 1 | pdfChartDrawer.ts | **Partial** — jsPDF parameter typing |
| `pres.slides as any[]` | 1 | slide-helpers.ts | **Partial** — see above |

**20 of 32 casts are avoidable** by typing `PropertyExportContext.property` and `PropertyExportContext.global` with proper interfaces instead of `any`.

**Root cause**: `propertyExportShared.ts` line 6 defines:
```typescript
export function getDepreciationYears(ctx: { property: any; global: any }): number
```
This `any` typing cascades to every consumer in property-sheets.ts and portfolio-sheet.ts.

**Recommendation**: Define a `PropertyExportData` interface with the fields actually accessed (`purchasePrice`, `buildingImprovements`, `preOpeningCosts`, `operatingReserve`, `depreciationYears`, `acquisitionDate`, `operationsStartDate`). This eliminates 20 `as any` casts in one change.

---

### M-2: `companyExports.ts` uses `as any` on Object.entries unnecessarily (MEDIUM — false cast)

**Line 222:**
```typescript
for (const [catName, cat] of Object.entries(m.costOfCentralizedServices.byCategory) as any) {
```

`Object.entries()` returns `[string, unknown][]`. The `as any` suppresses type checking on `cat.serviceModel` and `cat.vendorCost` access. The correct fix is to type the category object:
```typescript
for (const [catName, cat] of Object.entries(m.costOfCentralizedServices.byCategory) as [string, { serviceModel: string; vendorCost: number }][]) {
```

This is a subset of the broader pattern where monthly data (`m: any`) flows through company export aggregation without typing.

---

### M-3: Zero catch blocks in `server/report/` — 1,050 lines with no error handling (MEDIUM — fault isolation)

All 4 files in `server/report/` (compiler.ts, server-export-data.ts, svg-charts.ts, section-renderers.tsx) contain zero try/catch blocks. If any section renderer throws during report compilation, the entire report generation fails with an unhandled error.

**Contrast**: `server/pdf/design-pass.ts` demonstrates the correct pattern — 4-second timeout, Zod validation, `catch (err: unknown)` with graceful fallback.

**Recommendation**: Wrap individual section renderers in the compiler with try/catch, allowing partial report generation (skip failed sections with a placeholder message rather than failing the entire report).

---

### M-4: Excel bold/fill styling silently ignored without SheetJS Pro (MEDIUM — silent degradation)

`excel/helpers.ts` → `applyHeaderStyle()` sets `cell.s.font = { bold: true }` on section headers and total rows. However, the community edition of SheetJS (`xlsx` npm package) does not support cell styling — the `cell.s` property is only processed by SheetJS Pro.

**Impact**: All exported Excel workbooks appear as plain, unstyled sheets. Section headers, totals, and subtotals are indistinguishable from regular data rows. The code runs without error — it simply has no effect.

**Recommendation**: Either:
1. Document this as a known limitation and remove the dead styling code, or
2. Switch to `xlsx-js-style` (MIT-licensed fork that supports `cell.s`), or
3. Accept the limitation and add a code comment noting the Pro requirement.

---

### L-1: 7 catch blocks use untyped `(e)` / `(err)` instead of `(error: unknown)` (LOW — catch-any rule)

| File | Line | Pattern |
|------|------|---------|
| csvExport.ts | 9 | `catch (e)` |
| checkerManualExport.ts | 219, 450, 481, 544 | `catch (err)` / `catch (e)` |
| captureOverviewCharts.ts | 70 | `catch (err)` |
| property-sheets.ts | 380 | `catch (e)` |

Project convention requires `catch (error: unknown)` with `error instanceof Error ? error.message : String(error)`. These 7 blocks use implicit `any` typing on the caught error.

**Note**: `pngExport.ts`, `propertyDetailExports.ts`, `researchPdfExport.ts`, and `companyExports.ts` all use `catch (error)` which is acceptable (TypeScript infers `unknown` in strict mode), but adding the explicit `: unknown` annotation is preferred for consistency.

---

### L-2: IRR calculation in `exportFullPropertyWorkbook` swallows errors and returns 0 (LOW — silent failure)

`excel/property-sheets.ts` line 380:
```typescript
} catch (e) {
  // IRR calculation failed — use 0
}
```

When the IRR Newton-Raphson solver fails to converge, the error is silently swallowed and IRR displays as 0% in the exported workbook. A value of 0% IRR could be mistaken for a break-even investment rather than a calculation failure.

**Recommendation**: Return `"N/A"` or `"ERR"` string instead of 0, and log the failure. This matches how financial software distinguishes between "zero return" and "cannot compute."

---

### L-3: `pdfHelpers.ts` uses `doc: any` parameter type on all functions (LOW — typing gap)

All 10+ exported functions in `pdfHelpers.ts` accept `doc: any` as the first parameter. This is the jsPDF instance, which has proper types available via `import { jsPDF } from 'jspdf'`.

**Mitigation**: The `any` typing is partially justified by jspdf-autotable augmenting the jsPDF prototype at runtime with `.lastAutoTable`, `.internal`, etc. However, `jsPDF` could be used as the base type with specific casts only where autotable extensions are needed.

---

### L-4: Client-side `fmtCompact` in `exportRenderersPdfComprehensive.ts` is a 5th inline copy (LOW — DRY)

Line 45 defines:
```typescript
const fmtCompact = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
```

This uses `Intl.NumberFormat` (browser API) rather than the manual implementation in `server/pdf/chart-render.tsx` and `server/theme-resolver.ts`. The outputs differ for edge cases (e.g., the server version uses `$2K` while Intl produces `$2K` — similar but not identical formatting for values like $1,500 → `$2K` vs `$1.5K`).

**Risk**: Low — client-side only, used for PDF dashboard summary metrics. But having 5 copies of "format a dollar value compactly" is a maintenance smell.

---

### L-5: `pptxExport.ts` creates 3 `new (pptxgen as any)()` instances (LOW — necessary library workaround)

Lines 63, 126, 177 all use `new (pptxgen as any)()`. This is a known pptxgenjs typing issue — the library's default export doesn't match its constructor signature in TypeScript. The `as any` is necessary and well-documented across the pptxgenjs community.

**Recommendation**: Add a single factory function to centralize this cast:
```typescript
function createPresentation(): PptxGenJS { return new (pptxgen as any)(); }
```
This reduces 3 `as any` to 1.

---

## Positive Observations

1. **Zero `as any` in server/pdf/ and server/report/**: Exemplary type discipline on the server side. All 1,950 lines of server export code use proper types.
2. **`design-pass.ts` is a model of resilient AI integration**: 4-second AbortController timeout, Zod schema validation of AI response, `catch (err: unknown)` with `instanceof Error`, graceful fallback to `DEFAULT_HINTS`. Other AI call sites in the codebase should follow this pattern.
3. **`buildBrandPalette()` theme resolution is well-designed**: Semantic field naming (never color-named), description-based lookup with keyword matching, derived colors (lighten/darken), fallback to Studio Noir defaults. Single change propagates to all export formats.
4. **`exportStyles.ts` is a true single source of truth**: BrandPalette, formatting functions, row classification, PPTX sizing helpers — all export formats import from this one file. Changes here automatically propagate to PDF, PPTX, Excel, and CSV.
5. **`normalizeCaps()` preserves financial abbreviations**: The `KNOWN_ABBREVS` set correctly handles GOP, NOI, ANOI, GAAP, FF&E, DSCR, IRR, EBITDA, etc. Title Case conversion skips these. Well-tested edge case handling.
6. **PPTX `autoPage` with `autoPageRepeatHeader`**: Financial table slides correctly repeat the header row when tables overflow to subsequent slides. This is the correct pptxgenjs pattern.
7. **Dense pagination with section splitting** (`pagination.ts`): Large financial tables are split at section boundaries (not mid-section), producing clean page breaks.
8. **`saveFile.ts` modern File System Access API**: Uses `showSaveFilePicker` when available with proper `AbortError` re-throw, falls back to `<a>` download. Handles `DOMException` correctly.

---

## `as any` Tally

| Area | Count | Budget | Status |
|------|-------|--------|--------|
| server/pdf/ + server/report/ + server/exports/ | 0 | — | ✅ Exemplary |
| client/src/lib/exports/ | 32 | ≤100 (client total) | ✅ Within budget |

**Avoidable `as any`**: 20 of 32 (all from untyped `PropertyExportContext`).  
**Necessary `as any`**: 4 (pptxgen constructor × 3, window.showSaveFilePicker × 1).  
**Partially justified**: 8 (jspdf-autotable augmentations, pptxgenjs slides, jsPDF doc param).

---

## Recommendations Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | H-1: Deduplicate `fmtCompact` + `monotoneCubicPath` | 1 hour | Eliminates 4 copies of formatting logic |
| 2 | M-1: Type `PropertyExportContext` | 2 hours | Eliminates 20 `as any` casts |
| 3 | M-3: Add try/catch in report compiler | 30 min | Prevents full report failure on section error |
| 4 | L-1: Fix 7 catch blocks to use `(error: unknown)` | 15 min | Convention compliance |
| 5 | L-2: IRR error → "N/A" instead of 0 | 10 min | Prevents misleading financial data |
| 6 | L-5: pptxgen factory function | 10 min | Reduces 3 `as any` to 1 |
| 7 | M-4: Document or fix Excel styling limitation | 30 min | User expectation management |
