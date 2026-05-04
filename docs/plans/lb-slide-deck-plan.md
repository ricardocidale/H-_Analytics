---
title: LB Slide Deck — One Portfolio Investor Deck (6 Slides)
status: active
created: 2026-05-04
origin: docs/handoffs/lb-slides-replit-handoff.md
architect_decision: Option B — single-pass composite payload, parallel LB pipeline
---

# LB Slide Deck

## Problem Frame

Replace the per-property "Slide Decks" section with a single **LB Slide Deck** — one investor presentation of exactly 6 slides. Each slide can reference a different property (admin-selectable for slides 1/2/3/5); slides 4 and 6 are always auto-generated. This deck is the canonical L+B investor presentation for external pitch materials.

The existing per-property deck pipeline (`/internal/deck/:propertyId`, `property-deck-pdf.ts`) must remain untouched.

## Scope Boundary

- **In**: LB Slide Deck admin page, composite payload builder, new LB render route, new LB PDF route, Slide 6 10-year USALI changes, DB config table, nav/route wiring
- **Out**: Rewriting slides.tsx at 960×540 (deferred T_RENDER_REWRITE), modifying the existing per-property pipeline, LLM-authored copy slots

## Architectural Decision — Option B (Architect-Validated)

**Single Playwright pass** with a new composite payload. One HTML document renders all 6 slides with per-slide property payloads. One `page.pdf()` call produces the combined deck.

```
LbInternalDeck.tsx
  <Slide1 p={lb.slides[0]} />   ← assigned property payload
  <Slide2 p={lb.slides[1]} />   ← assigned property payload
  <Slide3 p={lb.slides[2]} />   ← assigned property payload
  <Slide4 p={lb.slides[3]} />   ← auto portfolio siblings payload
  <Slide5 p={lb.slides[4]} />   ← assigned property payload
  <Slide6 p={lb.slides[5]} />   ← auto 10-year aggregated payload
```

Rationale: avoids 6 Playwright launches + PDF merge complexity; each slide component already accepts a `SlidePayload` prop so per-slide payloads compose cleanly. Existing per-property pipeline untouched.

## Key Technical Decisions

1. **Slide 6 changes are backwards-safe** — PROFORMA_YEARS stays 5 by default; Slide 6 reads an optional override from payload (`projYears?: number`). The LB payload passes 10; per-property payloads pass nothing (falls back to 5).
2. **Separate token namespace** — LB deck tokens use `kind: "lb"` claim; per-property tokens use `kind: "property"`. Verifiers reject cross-namespace tokens.
3. **One combined PDF from one render** — no pdf-lib merge needed for the primary download. Per-slide PNG downloads still require individual renders (future).
4. **Portfolio financial aggregation for Slide 6** — `aggregateUnifiedByYear` from `@engine/aggregation/yearlyAggregator` across all user properties, 10 projection years. Same function used by `routes/finance.ts:376`.
5. **Slide 4 siblings** — built by loading all properties and their hero photos (same logic as existing `buildSlidePayload` siblings block, but all properties not excluding one).

## Implementation Units

### U1 — DB Schema + Storage
**Files:**
- `lib/db/src/schema/lb-slides-config.ts` (new)
- `lib/db/src/schema/index.ts` (add export)
- `artifacts/api-server/src/storage/lb-slides.ts` (new domain class)
- `artifacts/api-server/src/storage/index.ts` (register in buildDomainFactories + IStorage)

**Acceptance:** `getLbSlidesConfig()` returns the config row (or null), `upsertLbSlidesConfig()` upserts. DB push completes without error.

**Test scenarios:**
- upsert with all 4 property IDs → row persisted
- getLbSlidesConfig on empty DB → returns null
- getLbSlidesConfig after upsert → returns upserted values

---

### U2 — LB Payload Builder
**Files:**
- `artifacts/api-server/src/slides/build-lb-payload.ts` (new)

**Shape:**
```ts
interface LbSlidePayload {
  slides: [SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload];
  config: { slide1PropertyId, slide2PropertyId, slide3PropertyId, slide5PropertyId };
}
```

- Slides 1/2/3/5: call `buildSlidePayload(assignedPropertyId, userId, 5)`
- Slide 4: call `buildSlidePayload` for any property, override `siblings` with all properties (portfolio grid)
- Slide 6: run `aggregateUnifiedByYear` across all properties at 10 years; construct `SlidePayload` with `property.name = "Portfolio — Combined Properties"`, `financials.yearlyIS` and `yearlyCF` from aggregation, empty `photos`, empty `siblings`; set a `projYears: 10` field on the payload

**Acceptance:** Builder returns 6 populated payloads without throwing when all 4 property IDs are valid.

**Test scenarios:**
- Missing assigned property ID → throw with descriptive message
- No properties in DB → Slide 4 siblings array is empty, Slide 6 has zero'd financials
- 10-year projection → `yearlyIS.length === 10`

---

### U3 — LB Token + Internal Route
**Files:**
- `artifacts/api-server/src/slides/internal-token.ts` (add `signLbDeckToken` / `verifyLbDeckToken`)
- `artifacts/api-server/src/routes/internal-lb-deck-payload.ts` (new router)
- `artifacts/api-server/src/index.ts` (mount router)

`GET /api/internal/lb-deck-payload?token=…` → verifies LB token, returns `LbSlidePayload` JSON.

**Acceptance:** Token with wrong `kind` rejected 401. Valid token returns 200 with 6 slides.

---

### U4 — LbInternalDeck.tsx (portal render route)
**Files:**
- `artifacts/hospitality-business-portal/src/pages/LbInternalDeck.tsx` (new)
- `artifacts/hospitality-business-portal/src/App.tsx` (add `/internal/lb-deck` route, ungated)

Fetches `LbSlidePayload` from `/api/internal/lb-deck-payload?token=…`, renders 6 slides in sequence. Sets `window.__deckReady = true` after render (same pattern as existing `InternalDeck.tsx`).

**Slide 6 change in slides.tsx** — backwards-safe:
```ts
// In Slide6 component
const projYears = (p as any).projYears ?? PROFORMA_YEARS;  // 10 for LB, 5 for per-property
const years = financials.yearlyIS.slice(0, projYears);
```
Title: reads from payload or defaults to "5-YEAR" / "10-YEAR" based on `projYears`.
USALI rows: use variant-driven rendering when payload carries `usaliMode: true`.

**Acceptance:** Navigating `/internal/lb-deck?token=…` renders 6 slides with correct per-slide data; `window.__deckReady` is set.

---

### U5 — LB Deck PDF Route
**Files:**
- `artifacts/api-server/src/routes/lb-deck-pdf.ts` (new)
- `artifacts/api-server/src/index.ts` (mount)

```
POST /api/lb-slides/render        → enqueue render, return 202 {queued: true}
GET  /api/lb-slides/render-status → check R2 + in-memory manifest
GET  /api/lb-slides/download/combined.pdf → stream from R2
GET  /api/lb-slides/download/slides.zip   → future (zip per-slide PNGs)
```

R2 key: `lb-slides/pdf/{DECK_LOGIC_VERSION}/lb-deck.pdf`

Reuses `renderLimiter` — extract it from `property-deck-pdf.ts` into `artifacts/api-server/src/slides/render-limiter.ts` (shared singleton).

**Acceptance:** POST /render returns 202; GET /render-status cycles idle→rendering→ready; GET /download/combined.pdf streams bytes with correct Content-Type.

---

### U6 — LbSlides.tsx Admin Page
**Files:**
- `artifacts/hospitality-business-portal/src/pages/LbSlides.tsx` (new)
- `artifacts/hospitality-business-portal/src/components/Layout.tsx` (update nav link)
- `artifacts/hospitality-business-portal/src/App.tsx` (add `/lb-slides` route)

Two-column layout: left = Slide Composition config (selects for slides 1/2/3/5, Auto badges for 4/6, Save + Render buttons); right = 6-slide thumbnail grid with status badges + per-slide PDF/PNG download buttons. Bottom = Download Full Deck section when all ready.

All UI components from `@/components/ui/` only (Card, Select, Badge, Button, Skeleton). No inline `style={{}}` on admin page.

**Acceptance:** Nav shows "LB Slides"; admin can save composition, trigger render, see status update, download combined PDF.

---

### U7 — Slide 6 USALI 10-year layout
**Files:**
- `artifacts/hospitality-business-portal/src/features/internal-deck/slides.tsx` (modify Slide6 only)

Changes (all backwards-safe):
- `projYears` read from payload, default 5
- `isRows` uses USALI variant when `p.usaliMode === true`
- Title: `"${projYears}-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT"`
- Subtitle: reads `p.property.name` (LB payload sets it to `"Portfolio — Combined Properties"`)
- Font sizes: col header `fontSize: 9`, data cells `fontSize: 10` when `projYears > 5`
- Label column: `width: 200px` fixed; value columns: `flex: 1`
- IRR label: `"IRR (${projYears}yr)"`, Exit Value label: `"Exit Value (Yr ${projYears})"`
- Default disclaimer: reads from payload or computes from `projYears`

**Acceptance:** Per-property Slide 6 unchanged (projYears=5, non-USALI). LB Slide 6 shows 10 columns, USALI rows, correct title.

---

### U8 — Cleanup (after LB Slides confirmed working)
- Remove `/slide-decks` route from App.tsx
- Delete `artifacts/hospitality-business-portal/src/pages/SlideDecks.tsx`
- Delete `artifacts/hospitality-business-portal/src/pages/PropertySlides.tsx`
- Remove `LbSlidesRedirect` stubs from App.tsx

---

## Sequencing

```
U1 (DB/storage) → U2 (payload builder) → U3 (token/route) → U4 (portal render) → U7 (Slide 6)
                                       ↘                  ↗
                                        U5 (PDF route)
U4 + U5 done → U6 (admin page) → U8 (cleanup)
```

U1 and U7 can start in parallel. U2 depends on U1. U3, U4, U5 depend on U2. U6 depends on U3+U5. U8 is last.

## Canonical Design Contract (non-negotiable for slide canvas)

- 1920×1080 canvas (2× of canonical 960×540) — do NOT change scale
- Colors: `#257D41`, `#15331F`, `#9FBCAD`, `#FFF9F5`, `#FFFBF7`, `#9FB0A4`, `#FFFFFF`, `rgba(21,39,28,0.70)` only
- Fonts: EB Garamond BoldItalic (titles), Poppins ExtraLight (body), tabular-nums for financials
- Slides 1–4 background: `#FFF9F5`; Slides 5–6 background: `#9FBCAD`
- position: absolute on every slide element; no flexbox/grid for slide layout
- No Tailwind/shadcn on slide canvas; UI components only on admin page

## Risks

| Risk | Guard |
|------|-------|
| Slide 6 PROFORMA_YEARS global change breaks per-property renders | Read from payload, default to 5 — never change the const |
| Token reuse across pipeline types | Separate `kind` claim in JWT; verifiers reject mismatched kind |
| renderLimiter duplication | Extract to shared `render-limiter.ts`, both routes import from it |
| SlidePayload type pollution | Add LB fields as optional — `projYears?: number`, `usaliMode?: boolean` |
