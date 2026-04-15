# PDF & Export Plan — Definitive

## What Happened

Pipeline A (HTML templates, 1,269 lines) was built and produces investor-grade HTML:
cover pages, themed financial tables, SVG charts, proper indentation, short/extended modes.
It was designed for WeasyPrint conversion but **the wrapper was never created**.

Pipeline B (@react-pdf/renderer, 417 lines) was built as a replacement. It works but
produces lower quality: Helvetica fonts, reimplemented charts, no cover pages, limited CSS.
Pipeline B is currently active. Pipeline A is orphaned.

## The Fix

Connect Pipeline A to WeasyPrint. One new file (80 lines), one route change.

## Architecture

```
Client clicks Export → PDF
  → POST /api/exports/premium { format: "pdf", statements, orientation, version }
  → Server: buildPdfSectionsFromData(data)     ← EXISTS (premium-pdf-pipeline.ts)
  → Server: buildPdfHtml(sections, templateData) ← EXISTS (pdf-html-templates.ts)
  → NEW: renderHtmlToPdf(html)                  ← WeasyPrint subprocess (80 lines)
  → Return PDF buffer to client
  → Fallback: if WeasyPrint unavailable → renderPremiumPdf(report) (Pipeline B)
```

## PDF Layout Rules

- **One statement per landscape page** — each financial statement starts a new page
- **Chart follows its statement** — on the next page
- **Short vs Extended** — user chooses at export time
  - Short: accordion-collapsed summary rows only
  - Extended: all rows with proper indentation hierarchy
- **Formula rows always excluded** — not investor-facing (isItalic = true)
- **Landscape orientation** — always, financial tables need the width
- **This is file export, not print** — produces downloadable PDF documents

## AI Design Pass — Offline, Not Per-Export

Currently: Anthropic API called on every PDF export (4-second timeout).
Should be: AI designs the template ONCE (admin triggers), stores DesignProfile in DB.
Export time: look up stored profile, apply instantly.

The AI design pass considers: column count, row density, theme colors, and makes
typographic decisions (font scale, row padding, chart height, density). These
decisions don't change between exports — only when the theme or projection years change.

## Existing Code — What's Built and Working

| File | Lines | Status |
|---|---|---|
| `server/routes/pdf-html-templates.ts` | 227 | Built, orphaned (not called) |
| `server/routes/premium-pdf-pipeline.ts` | 242 | Built, partially used |
| `server/table-renderer.ts` | 92 | Built, orphaned |
| `server/svg-charts.ts` | 163 | Built, orphaned |
| `server/pdf-styles.ts` | 422 | Built, orphaned |
| `server/theme-resolver.ts` | 123 | Built, used by both pipelines |
| `server/pdf/render.tsx` | 126 | Active (Pipeline B) |
| `server/pdf/design-pass.ts` | 138 | Active (LLM per-export) |
| `server/report/compiler.ts` | 325 | Active (creates ReportDefinition IR) |

## Tasks

### Phase 1: Wire WeasyPrint (Claude — ~1 hour)
| # | What | Time |
|---|---|---|
| 1.1 | Create `server/pdf/weasyprint-renderer.ts` — Python subprocess, temp files, timeout, error handling | 30 min |
| 1.2 | Change PDF case in `premium-exports.ts` — call buildPdfSectionsFromData → buildPdfHtml → renderHtmlToPdf, fallback to Pipeline B | 15 min |
| 1.3 | Make AI design pass deterministic for now (rules-based, no API call) — plan offline AI for later | 15 min |
| 1.4 | Test: export Income Statement from dashboard, verify it matches on-screen content | 10 min |

### Phase 2: Verify All Export Paths (Claude — ~30 min)
| # | What |
|---|---|
| 2.1 | Dashboard export → all 4 statements + charts in one PDF |
| 2.2 | Company export → company P&L + cash flow + balance sheet |
| 2.3 | Property export → property-level statements |
| 2.4 | Short vs Extended toggle works correctly |
| 2.5 | Landscape orientation correct |
| 2.6 | Formula rows excluded |

### Phase 3: PNG Export Enhancement (Replit — ~30 min)
| # | What |
|---|---|
| 3.1 | Add `data-export-section` markers to all statement tabs and charts |
| 3.2 | Capture at 3x scale (300 DPI) via dom-to-image-more |
| 3.3 | Clean filenames, white background, tight crop |

### Phase 4: Offline AI Design Pass (Claude — ~45 min)
| # | What |
|---|---|
| 4.1 | Create DesignProfile type and DB storage |
| 4.2 | Admin UI: "Optimize Export Layout" button triggers AI design pass |
| 4.3 | Export reads stored DesignProfile instead of calling LLM |

### Phase 5: PPTX Enhancement (Claude — ~20 min)
| # | What |
|---|---|
| 5.1 | Use same HTML-rendered content, convert pages to slides |
| 5.2 | Embed chart PNGs captured from DOM |

## Files NOT To Touch
- `server/report/compiler.ts` — the IR compiler works, don't change it
- `server/pdf/render.tsx` — keep as fallback, don't remove
- `client/src/lib/exports/` — client-side jsPDF fallback stays as-is
- `server/routes/format-generators/` — Excel/PPTX/DOCX generators are separate

## Verification
- [ ] PDF from Dashboard: 4 statements + 4 charts, landscape, themed, formula rows excluded
- [ ] PDF Short mode: only summary rows visible
- [ ] PDF Extended mode: all rows with proper indentation
- [ ] Numbers in PDF match numbers on screen exactly
- [ ] Charts in PDF match chart data on screen
- [ ] Company and Property exports produce correct statement subset
- [ ] Fallback to React-PDF works when WeasyPrint is unavailable
- [ ] No LLM API call during export (design pass is deterministic or pre-computed)
