# Export Rules

Every financial data page **must** offer all six export formats via a single `ExportMenu` in the tab bar.

## Six Required Formats

PDF, Excel (xlsx), CSV, PowerPoint (pptx), PNG (zipped), DOCX

## Placement

One Export button per page in the tab bar `rightContent` slot. No per-tab export buttons.

## Cardinal Export Rules

1. **Full-scope export**: Clicking Export produces ALL financial statements for the entity — never just the current tab. Statements: Income Statement, Cash Flow, Balance Sheet, Investment Analysis (except Company which has no Investment Analysis).
2. **Statement → Chart interleaving**: Each statement table is followed by a chart page showing that statement's key metrics.
3. **Short/Extended**: "Short" exports header/total rows only (accordion closed). "Extended" exports all line items (accordion open). Formula rows (isItalic) are NEVER exported.
4. **No cover pages**: Cover pages are NEVER included in any export format. No KPI sections either.
5. **File save**: After generation, `saveFile()` is called directly — tries native `showSaveFilePicker` (Chrome) or falls back to download (webview). No intermediate save dialog.
6. **Theme colors**: Export colors come from the user's active theme, resolved via `resolveThemeColors()`. Falls back to brand defaults.

## PDF Layout Rules

1. **Tables never split**: A table or spreadsheet must NEVER be split across pages unless it is larger than a single page. Use `wrap={false}` on all section `View` containers in `@react-pdf/renderer`.
2. **Oversized tables**: Only tables that exceed a full page height are chunked via `splitOversizedSections()` with "(cont'd)" suffix on subsequent chunks.
3. **Image margins**: Chart screenshot images use `width: "96%"` with `paddingHorizontal: 4` to prevent border clipping at page edges.
4. **Vertical positioning**: On the last page(s), all table lines must fit. Prefer pushing a table to the next page rather than splitting it.
5. **Section grouping**: The dense pagination path groups sections onto pages, but respects `wrap={false}` — if a section doesn't fit, it moves to the next page intact.

## Format-Specific Rules

| Format | Content | Notes |
|--------|---------|-------|
| **PDF** | Full report (chart screenshots, statements, charts) | @react-pdf/renderer, landscape or portrait |
| **PPTX** | Each page = one 16:9 slide | Landscape only |
| **Excel** | Each statement = one worksheet tab | No charts |
| **CSV** | Statement tables concatenated | No charts |
| **PNG** | Each page = separate PNG, bundled in ZIP | Sequenced filenames |
| **DOCX** | Pages in sequence, tables/charts as PNG images | Portrait |

## ExportData Shape

```ts
interface ExportData {
  years: string[] | number[];
  rows: { category: string; values: (string | number)[]; indent?: number; isBold?: boolean; isHeader?: boolean; isItalic?: boolean; format?: string; }[];
}
```

## Per-Statement Charts

- **Income Statement**: Revenue, GOP, NOI, ANOI (multi-series line chart)
- **Cash Flow**: NOI, ANOI, Cash Flow, FCFE (multi-series line chart)
- **Balance Sheet**: Total Assets, Total Liabilities (multi-series line chart)
- **Investment Analysis**: NOI, ANOI, FCFE (multi-series line chart) + KPI metric cards

Reference: `.claude/skills/exports/SKILL.md` for full implementation guide.
