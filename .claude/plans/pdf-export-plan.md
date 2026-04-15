# PDF & Export Plan — Definitive

## The Two Export Problems

This app has TWO fundamentally different export challenges that require TWO different solutions:

### Problem 1: Financial Statement Exports (Tables + Line Charts)
**Pages:** Dashboard statements (Income, Cash Flow, Balance Sheet, Investment), Company statements, Property statements
**Content:** Dense numeric tables with 10+ year columns, line charts showing trends
**Quality bar:** "Looks like it was printed from Excel" — gridlines, monospace numbers, section headers, negative values in red parentheses
**Best tool:** HTML templates → WeasyPrint. Already 90% built.

### Problem 2: Visual/Executive Exports (KPIs, Infographics, Donut Charts, Dashboard Overview)
**Pages:** Dashboard overview tab, portfolio composition, investment performance cards
**Content:** KPI cards, donut charts, waterfall charts, infographic-style layouts
**Quality bar:** "Looks exactly like the screen" — pixel-perfect capture of the React/Tailwind/Recharts UI
**Best tool:** DOM capture at high resolution. Cannot be rebuilt in HTML templates.

### Why past attempts failed
Every attempt tried to solve BOTH problems with ONE tool:
- `@react-pdf/renderer` → great for structured layouts, terrible for reproducing complex UI
- `jsPDF` → great for simple tables, terrible for everything else
- HTML templates → great for financial tables, can't reproduce KPI cards/donut charts

## The Solution: Hybrid Approach

### For Financial Statements (PDF, PPTX)
1. Server receives export request with financial data
2. `buildPdfSectionsFromData()` creates section IR (exists)
3. `buildPdfHtml()` renders HTML with CSS (exists, 1,269 lines)
4. WeasyPrint converts HTML → PDF (installed, need to wire)
5. AI design pass stays but becomes deterministic (no API call)

Files involved: `premium-pdf-pipeline.ts`, `pdf-html-templates.ts`, `table-renderer.ts`, `svg-charts.ts`, `pdf-styles.ts`

### For Visual/Dashboard Reports (PDF, PNG)
1. Client captures each visual section via `dom-to-image-more` at 3x scale (300 DPI)
2. Captured PNGs are sent to server as part of the export payload
3. Server embeds them as `<img>` tags in the HTML document
4. WeasyPrint renders the combined document (tables + embedded chart images)

For standalone PNG export: client captures the section directly, no server round-trip needed.

Files involved: `captureOverviewCharts.ts` (expand to capture all exportable sections), `ExportDialog.tsx`

### For Excel/CSV
Already works. No changes needed.

### For PPTX
Same data as PDF but formatted as slides via `pptxgenjs`. Already works but could use the captured chart PNGs instead of rebuilding charts.

## Tasks

### Phase 1: Wire WeasyPrint for Financial Statements (Claude)
| # | What | Time |
|---|---|---|
| 1.1 | Create `server/pdf/weasyprint-renderer.ts` — Python subprocess wrapper | 30 min |
| 1.2 | Wire into `premium-exports.ts` PDF case — WeasyPrint primary, React-PDF fallback | 15 min |
| 1.3 | Make design pass deterministic (no LLM API call, same logic as rules) | 15 min |
| 1.4 | Test: export Income Statement, Cash Flow, Balance Sheet from dashboard | 15 min |

### Phase 2: Expand DOM Capture for Visual Sections (Claude + Replit)
| # | What | Time |
|---|---|---|
| 2.1 | Add `data-export-section` markers to ALL exportable UI sections (statements, charts, KPIs) | 30 min (Replit) |
| 2.2 | Expand `captureOverviewCharts.ts` to capture any marked section | 20 min (Claude) |
| 2.3 | Add chart PNG capture to export payload — client captures before sending | 20 min (Claude) |
| 2.4 | Server embeds captured PNGs as `<img>` in the HTML template | 15 min (Claude) |

### Phase 3: PNG Export (Replit)
| # | What | Time |
|---|---|---|
| 3.1 | Add "Export as PNG" option for each statement tab and chart | 15 min |
| 3.2 | Capture at 3x scale (300 DPI) with white background | 10 min |
| 3.3 | Clean download with proper filename | 5 min |

### Phase 4: PPTX Enhancement (Claude)
| # | What | Time |
|---|---|---|
| 4.1 | Use captured chart PNGs in slides instead of rebuilding charts | 20 min |

## PDF Layout Rules

- **One statement per landscape page** — each statement starts on a new page
- **Chart follows its statement** — on the next page (or below if it fits)
- **Short vs Extended** — user chooses at export time
  - Short: accordion-collapsed rows only (summary level)
  - Extended: all rows with proper indentation hierarchy
- **Formula rows always excluded** — not investor-facing
- **Landscape orientation** — always, for 10-year projection tables

## AI Design Pass — Offline, Not Real-Time

The AI designer does NOT run at export time. It runs **once** when:
- Admin configures export settings
- A new design theme is saved
- An admin explicitly triggers "Optimize export layout"

It produces a `DesignProfile` stored in the DB:
```typescript
interface DesignProfile {
  fontSizeScale: number;        // 0.85 for wide tables, 1.0 for normal
  tableDensity: "cramped" | "comfortable" | "spacious";
  chartHeight: number;          // mm
  chartAreaOpacity: number;
  headerStyle: "bar" | "line" | "minimal";
  numberFont: string;           // "Courier New" or similar monospace
  labelFont: string;            // "Helvetica Neue" or similar
  rowPadding: number;           // mm
  sectionSpacing: number;       // mm
  colorAccent: string;          // from theme
  colorHeader: string;          // from theme
  colorAltRow: string;          // from theme
}
```

At export time: look up the stored profile, apply it to the HTML template, render via WeasyPrint. Instant.

The AI brings real design skill — it considers the number of columns, the data density, the theme colors, and makes typographic decisions that a rule-based system would get subtly wrong. But it does this work ONCE, not per-export.

## What NOT To Do
- Don't rebuild KPI cards in HTML templates — capture them from the DOM
- Don't add Puppeteer — WeasyPrint handles HTML→PDF, dom-to-image handles screenshots
- Don't add a cover page or table of contents — these are financial statement printouts
- Don't run AI at export time — AI designs the template offline, export applies it instantly

## Verification
After each phase:
- Export from Dashboard → PDF has all 4 statements with charts, numbers match on-screen
- Export from Company → PDF has company P&L, cash flow, balance sheet
- Export from Property → PDF has property-level statements
- PNG export → 300 DPI, pixel-perfect, white background, tight crop
- PPTX → one slide per statement, charts embedded as images
