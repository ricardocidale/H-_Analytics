# LB Slides — Replit Implementation Handoff

**Date:** 2026-05-04  
**Author:** Claude Code (architect pass)  
**Status:** Ready to implement — full spec below

---

## What this is

Replace the current "Slide Decks" section in the admin nav with a new **LB Slides** page. Instead of per-property decks (6 properties × 6 slides), there is ONE portfolio investor deck of exactly **6 slides**. Each slide can reference a different property (admin-selectable for slides 1/2/3/5); slides 4 and 6 are always auto-generated from the full portfolio.

This deck is the canonical L+B investor presentation intended for inclusion in external pitch materials.

---

## Stack and file locations

| What | Path |
|---|---|
| Slide React components | `artifacts/hospitality-business-portal/src/features/internal-deck/slides.tsx` |
| Slide types (portal copy) | `artifacts/hospitality-business-portal/src/features/internal-deck/types.ts` |
| Slide palette + fonts | `artifacts/hospitality-business-portal/src/features/internal-deck/theme.ts` |
| App nav | `artifacts/hospitality-business-portal/src/components/Layout.tsx` |
| App router | `artifacts/hospitality-business-portal/src/App.tsx` |
| Existing slide payload builder | `artifacts/api-server/src/slides/build-payload.ts` |
| Existing per-slide PDF route | `artifacts/api-server/src/routes/property-deck-pdf.ts` |
| Finance aggregation (portfolio) | `artifacts/api-server/src/routes/finance.ts` — uses `aggregateUnifiedByYear` from `@engine/aggregation/yearlyAggregator` |
| Internal deck token route | `artifacts/api-server/src/routes/internal-deck-payload.ts` |
| Existing slide page (to delete after) | `artifacts/hospitality-business-portal/src/pages/PropertySlides.tsx` |
| Existing deck list page (to delete after) | `artifacts/hospitality-business-portal/src/pages/SlideDecks.tsx` |
| UI component library | `artifacts/hospitality-business-portal/src/components/ui/` — shadcn/ui components |
| Accordion row components | `artifacts/hospitality-business-portal/src/components/financial-table/expandable-rows.tsx` |
| USALI income statement | `artifacts/hospitality-business-portal/src/components/statements/YearlyIncomeStatement.tsx` |

---

## Part 1 — DB Migration (api-server)

Create a new Drizzle migration that adds table `lb_slides_config`. This is a **single-row config table** (upserted by id=1 always):

```sql
CREATE TABLE lb_slides_config (
  id                   INTEGER PRIMARY KEY DEFAULT 1,
  slide1_property_id   INTEGER REFERENCES properties(id),
  slide2_property_id   INTEGER REFERENCES properties(id),
  slide3_property_id   INTEGER REFERENCES properties(id),
  slide5_property_id   INTEGER REFERENCES properties(id),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- Slides 4 and 6 are automatic — no FK needed.
- On first save, default each of slides 1/2/3/5 to the first available property ID in the DB.
- Add `getLbSlidesConfig()` and `upsertLbSlidesConfig()` to the storage layer.

---

## Part 2 — Slide 6 changes in `slides.tsx`

### 2a. 10-year income statement

In `slides.tsx` change:
```ts
const PROFORMA_YEARS = 5;
```
to:
```ts
const PROFORMA_YEARS = 10;
```

This constant controls how many year-columns the Slide 6 table renders. It is used only in Slide 6.

### 2b. New `isRows` structure — accordion-closed USALI layout

Replace the current flat 6-row `isRows` array in `Slide6` with the USALI summary rows that match the **accordion-closed** view from the app's exported reports. Each section row that has sub-details gets a `▶` triangle prefix (decorative/static — this is a PDF render, not interactive):

```ts
// Accordion-closed USALI structure — matches exported report top-level rows
const isRows: Array<{ label: string; vals: string[]; variant: "section" | "subtotal" | "normal" | "footer"; indent?: boolean }> = [
  { label: "▶  Revenue",                  vals: years.map(y => fmtCurrency(y.revenueTotal)),                         variant: "section" },
  { label: "▶  Departmental Expenses",    vals: years.map(y => fmtCurrency(y.totalExpenses * 0.42)),                 variant: "normal", indent: true },
  { label: "▶  Undistributed Expenses",   vals: years.map(y => fmtCurrency(y.totalExpenses * 0.38)),                 variant: "normal", indent: true },
  { label:    "Gross Operating Profit",   vals: years.map(y => fmtCurrency(y.gop)),                                  variant: "subtotal" },
  { label: "▶  Management Fees",          vals: years.map(y => fmtCurrency(y.totalExpenses * 0.06)),                 variant: "normal", indent: true },
  { label:    "Fixed Charges",            vals: years.map(y => fmtCurrency(y.totalExpenses * 0.08)),                 variant: "normal", indent: true },
  { label:    "NOI",                      vals: years.map(y => fmtCurrency(y.noi)),                                  variant: "subtotal" },
  { label: "▶  FF&E Reserve",             vals: years.map(y => fmtCurrency(y.totalExpenses * 0.04)),                 variant: "normal", indent: true },
  { label:    "ANOI",                     vals: years.map(y => fmtCurrency(y.noi * 0.94)),                           variant: "subtotal" },
  { label:    "Debt Service",             vals: financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.debtService)), variant: "normal" },
  { label:    "Net Cash Flow",            vals: financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.netCashFlowToInvestors)), variant: "subtotal" },
  { label:    "Cumulative CF",            vals: financials.yearlyCF.slice(0, PROFORMA_YEARS).map(y => fmtCurrency(y.cumulativeCashFlow)), variant: "footer" },
];
```

> **NOTE on expense splits:** The departmental / undistributed / mgmt fee / fixed charges / FF&E percentages above are approximations. Ideally `SlideFinancials` is extended (see Part 3) to carry these broken-out values from the engine. If that extension is not done yet, the percentage splits above are reasonable USALI defaults. Replace with real values once the payload carries them.

Render the rows using variant-driven inline styles:

| variant | background | text color | font weight |
|---|---|---|---|
| `section` | `C.canvasHeader` (`rgba(37,125,65,0.20)`) | `C.darkBg` | 700 |
| `subtotal` | `rgba(37,125,65,0.08)` | `C.accent` | 700 |
| `normal` | alternating `C.canvasZebra` / transparent | `C.darkBg` | 400 |
| `footer` | `C.darkBg` | `C.cream` | 600 |

Indented rows: `paddingLeft: 24` on the label cell.

### 2c. Font sizing for 10 columns

With 10 year-columns, reduce cell font size:
- Column header (`Yr 1` … `Yr 10`): `fontSize: 9`
- Data cells: `fontSize: 10`, `FONT_NUMERIC`, `fontVariantNumeric: "tabular-nums"`
- Label column: fixed `width: 200px`; each of the 10 value columns: `flex: 1`

### 2d. Title and subtitle updates

Change the section label from:
```
"5-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT"
```
to:
```
"10-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT"
```

Change the property name subtitle from:
```tsx
<span ...>{property.name}</span>
```
to:
```tsx
<span ...>Portfolio — Combined Properties</span>
```

### 2e. Right-panel investor metrics updates

- `"IRR (5yr)"` → `"IRR (10yr)"`
- `"Exit Value (Yr 5)"` → `"Exit Value (Yr 10)"`

Change `exitVal` to read from `financials.yearlyCF[financials.yearlyCF.length - 1]?.exitValue` (already correct — just the label changes).

Default disclaimer text:
```
"10-year pro forma based on H+ Analytics projection engine. Combined portfolio. Projections are estimates; actual results may vary."
```

---

## Part 3 — Slide 6 portfolio payload mode (api-server)

### 3a. `buildSlidePayload` extension

In `artifacts/api-server/src/slides/build-payload.ts`, add an optional `portfolioMode?: boolean` flag to the function signature.

When `portfolioMode === true`:
1. Load **all** properties from the DB (not just the one passed in).
2. Run `aggregateUnifiedByYear` from `@engine/aggregation/yearlyAggregator` across all properties to get combined 10-year IS/CF data. This is the same function used by `routes/finance.ts:376` for the main dashboard Analytics tab.
3. Construct `SlideFinancials` from the aggregated results.
4. Set `property.name` to `"Portfolio"` and populate other `SlideProperty` fields with portfolio-level totals.
5. `siblings` can be empty `[]` for portfolio mode.
6. `photos` can be empty `[]` — Slide 6 has no photos.

### 3b. Internal token route

In `artifacts/api-server/src/routes/internal-deck-payload.ts`, add support for `?portfolio=true` query param, which routes to `buildSlidePayload(undefined, userId, undefined, { portfolioMode: true })`.

---

## Part 4 — Backend routes (api-server)

Add a new router file `artifacts/api-server/src/routes/lb-slides.ts` and mount it at `/api/lb-slides`.

### Route table

| Method | Path | Handler summary |
|---|---|---|
| `GET` | `/api/lb-slides/config` | Read `lb_slides_config` row, return `{ slide1PropertyId, slide2PropertyId, slide3PropertyId, slide5PropertyId }` |
| `PUT` | `/api/lb-slides/config` | Upsert `lb_slides_config`, return updated row |
| `GET` | `/api/lb-slides/render-status` | For each of the 6 slides, check R2 key freshness + in-memory manifest queue; return `{ slides: [{ n, status, r2Url? }] }` where status is `"idle"` / `"queued"` / `"rendering"` / `"ready"` / `"error"` |
| `POST` | `/api/lb-slides/render` | Enqueue render for all 6 slides using `renderLimiter`. Slides 1–5: call existing per-property slide render (reuse `property-deck-pdf.ts` logic) with the assigned property ID. Slide 6: call portfolio-mode render. Returns `{ queued: true }` immediately. |
| `GET` | `/api/lb-slides/download/combined.pdf` | Stream a merged 6-page PDF. Use `pdf-lib` to concatenate the 6 per-slide R2 PDFs in order. All 6 must be ready — return 409 if any is missing. |
| `GET` | `/api/lb-slides/download/slides.zip` | ZIP the 6 per-slide PDFs using `archiver` (already a dep). |
| `GET` | `/api/lb-slides/download/pngs.zip` | ZIP the 6 per-slide PNGs using `archiver`. |

**R2 key convention for LB Slides:**

Per-slide renders keyed by:
```
lb-slides/pdf/{DECK_LOGIC_VERSION}/slide-{n}-property-{propertyId}.pdf
lb-slides/pdf/{DECK_LOGIC_VERSION}/slide-6-portfolio.pdf
lb-slides/png/{DECK_LOGIC_VERSION}/slide-{n}-property-{propertyId}.png
lb-slides/png/{DECK_LOGIC_VERSION}/slide-6-portfolio.png
```

Reuse `DECK_LOGIC_VERSION` from the existing render pipeline.

**Cache invalidation:** Invalidate when the `lb_slides_config` `updated_at` changes OR when any assigned property's `updatedAt`/`financialsComputedAt` changes.

---

## Part 5 — Frontend: `/lb-slides` page (portal)

### 5a. Navigation update

In `artifacts/hospitality-business-portal/src/components/Layout.tsx`, find the `"Investor Materials"` nav section and update:
- `href: "/slide-decks"` → `href: "/lb-slides"`
- `label: "Slide Decks"` → `label: "LB Slides"`

### 5b. App.tsx route

In `artifacts/hospitality-business-portal/src/App.tsx`, add:
```tsx
<Route path="/lb-slides" component={() => <AdminRoute><LbSlides /></AdminRoute>} />
```

Remove or redirect the old `/slide-decks` and `/slide-decks/:propertyId` routes once the new page is confirmed working.

### 5c. New `LbSlides.tsx` page

Create `artifacts/hospitality-business-portal/src/pages/LbSlides.tsx`.

**CRITICAL: use only the existing UI components from `@/components/ui/`.** Do not create custom styled containers. Use `Card`, `CardHeader`, `CardContent`, `CardTitle`, `Button`, `Badge`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `Label`, `Separator`, `Skeleton` from the existing shadcn/ui library already installed.

#### Layout

Two-column layout using `grid grid-cols-[320px_1fr] gap-6 p-6`.

---

**Left column — Composition Config**

```
Card
  CardHeader
    CardTitle "Slide Composition"
  CardContent
    [for slides 1, 2, 3, 5]
    Label "Slide N Property"
    Select (fed from properties list)  ← useQuery to /api/properties

    [for slide 4]
    div className="flex items-center justify-between py-2"
      span "Slide 4" className="text-sm font-medium"
      Badge variant="secondary" "Auto — Full Portfolio Grid"

    [for slide 6]
    div className="flex items-center justify-between py-2"
      span "Slide 6" className="text-sm font-medium"
      Badge variant="secondary" "Auto — Combined P&L (10yr)"

    Separator className="my-4"

    Button variant="default" fullWidth onClick={handleSave}
      "Save Composition"

    Separator className="my-4"

    Button variant="outline" fullWidth onClick={handleRenderAll}
      disabled={isRendering}
      [spinner icon when rendering] "Render All Slides"
```

Load config on mount via `GET /api/lb-slides/config`. Save via `PUT /api/lb-slides/config`. Poll `GET /api/lb-slides/render-status` every 3 seconds when any slide is `queued` or `rendering`.

---

**Right column — Slide Thumbnail Grid**

```
Card
  CardHeader
    CardTitle "Investor Deck — 6 Slides"
    [Badge showing overall status: "Ready" green / "Rendering" amber / "Not rendered" gray]
  CardContent
    grid grid-cols-3 gap-4

    [for each slide n = 1..6]
    Card className="overflow-hidden"
      [thumbnail area: aspect-video bg-muted relative]
        [if ready] img src={r2Url} className="w-full h-full object-cover"
        [if rendering] Skeleton className="w-full h-full" + centered spinner
        [if idle/error] div className="flex items-center justify-center h-full text-muted-foreground text-sm" "Not rendered"
        [top-left] Badge variant="secondary" className="absolute top-2 left-2" "Slide {n}"
        [top-right] Badge className="absolute top-2 right-2" variant per status
      CardContent className="pt-2 pb-3 px-3"
        p className="text-xs font-medium truncate" [slide title from SLIDES registry]
        p className="text-xs text-muted-foreground truncate mt-0.5"
          [assigned property name, or "Portfolio" for slides 4/6]
        div className="flex gap-1.5 mt-2"
          Button size="sm" variant="ghost" className="h-7 text-xs px-2"
            disabled={status !== "ready"}
            onClick={() => window.open(pdfUrl)} "PDF"
          Button size="sm" variant="ghost" className="h-7 text-xs px-2"
            disabled={status !== "ready"}
            onClick={() => window.open(pngUrl)} "PNG"
```

Slide titles (from the existing SLIDES registry in `PropertySlides.tsx`):
1. Pipeline Spotlight
2. Photo Gallery
3. Investment Model
4. Portfolio Overview
5. Financial Snapshot
6. 10-Year Income Statement

---

**Bottom — Download Section** (render only when all 6 slides are ready)

```
Card className="mt-0"
  CardHeader
    CardTitle "Download Full Deck"
  CardContent
    div className="flex flex-wrap gap-3"
      Button variant="outline" onClick={() => window.open('/api/lb-slides/download/combined.pdf')}
        [Download icon] "Combined PDF (6 pages)"
      Button variant="outline" onClick={() => window.open('/api/lb-slides/download/slides.zip')}
        [Archive icon] "6 PDFs (ZIP)"
      Button variant="outline" onClick={() => window.open('/api/lb-slides/download/pngs.zip')}
        [Image icon] "6 PNGs (ZIP)"
```

Use icons from `@/components/icons/themed-icons` (already installed — `Download`, `Archive`, `Image` or equivalents from lucide-react).

---

## Part 6 — Cleanup (do last, once LB Slides is confirmed working)

1. Remove `/slide-decks` route from `App.tsx`
2. Delete `artifacts/hospitality-business-portal/src/pages/SlideDecks.tsx`
3. Delete `artifacts/hospitality-business-portal/src/pages/PropertySlides.tsx`
4. Remove redirect stubs `LbSlidesRedirect` from `App.tsx` if still present

---

## Design rules (non-negotiable)

- **Every UI component** in the admin page must come from `@/components/ui/`. No inline `style={{}}` on the admin page. No Tailwind color overrides that don't match the app's design tokens.
- **Slide canvas** uses `theme.ts` palette (`C.*`, `FONT_SANS`, `FONT_SERIF`, `FONT_NUMERIC`) and inline styles — this is intentional because the slides render via Playwright headless and require pixel-precise layout.
- **Thumbnail scale:** `THUMB_SCALE = 0.25` → renders at 480×270px. Use `width: 480 * THUMB_SCALE` in CSS, not hardcoded `px` values.
- **No new Playwright code.** Reuse the existing headless render pipeline entirely.
- **`pdf-lib`** is already a dependency — use it for PDF concatenation in `combined.pdf`.
- **`archiver`** is already a dependency — use it for ZIP packaging.

---

## Acceptance criteria

1. Nav shows "LB Slides" link; clicking opens the new page.
2. Admin can pick a property for each of slides 1, 2, 3, 5 via dropdown.
3. Slides 4 and 6 show "Auto" badges — no dropdown.
4. "Save Composition" persists the config across page refreshes.
5. "Render All Slides" triggers render for all 6; status badges update in real time.
6. When all 6 are ready, thumbnail images appear and per-slide PDF/PNG downloads work.
7. "Download Full Deck" section appears; Combined PDF contains 6 pages in correct slide order.
8. Slide 6 thumbnail/PDF shows a 10-year income statement with accordion-closed USALI rows (Revenue, Departmental Expenses, Undistributed Expenses, GOP, Management Fees, Fixed Charges, NOI, FF&E Reserve, ANOI, Debt Service, Net Cash Flow, Cumulative CF).
9. Slide 6 header reads "10-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT" and subtitle "Portfolio — Combined Properties".
10. TypeScript compiles clean. No ESLint errors.
