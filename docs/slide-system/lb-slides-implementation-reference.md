# LB Slides — Implementation Reference

> Extracted from CLAUDE.md on 2026-05-07. See CLAUDE.md § "LB Slides" for the summary pointer.

## Overview

Generates a 6-slide investor deck per property as a single PDF. Slide 7 ("The Ask") is always excluded. Output must match the canonical L+B reference deck (`attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf`) — colors, fonts, layout, photo placement.

## Pipeline (HTML → PDF)

- React deck pages live in `artifacts/hospitality-business-portal/src/features/internal-deck/` (`slides.tsx`, `theme.ts`, `helpers.tsx`, `fonts.css`) and are mounted at `/internal/deck/:propertyId` via `pages/InternalDeck.tsx`.
- `artifacts/api-server/src/routes/property-deck-pdf.ts` opens that page in headless Chromium (Playwright) with an internal token, prints to PDF, uploads to R2, and serves it back. Source files: `internal-deck-payload.ts`, `pdf-html-templates.ts`, `premium-pdf-pipeline.ts`, `slides/playwright-browser.ts`, `slides/internal-token.ts`.
- The legacy Python + `python-pptx` track and the satori image-PPTX track are removed. Do **not** add Puppeteer; Playwright is the single supported renderer (Chromium installed at build time into `.cache/ms-playwright/`).

## DB Schema

`property_slide_deck_variants` table holds only `format='pdf'` rows (migration 0042 dropped `'pptx'` and `'image'`):

- Composite PK: `(property_id, format)` with `format = 'pdf'`
- Columns: `property_id` FK→properties.id (cascade delete), `format`, `status` ('idle'|'generating'|'ready'|'error'), `r2_key`, `file_size_bytes`, `generated_at`, `triggered_by`, `error_message`, `updated_at`

## Active API Routes

Source: `artifacts/api-server/src/routes/property-deck-pdf.ts`

- `GET /api/properties/:id/deck.pdf` — render or serve cached deck
- `GET /api/slides/status` — admin: PDF variant status rows (in `property-slides.ts`, the legacy file kept only for the status feed + hero-image ZIP)
- Auth: `requireAuth` guard; internal page load uses a short-lived signed token from `slides/internal-token.ts`
- Finance: uses `recomputeSinglePropertyAndStamp` → `aggregateUnifiedByYear` (same path as finance.ts)
- Loan data: `calculateLoanParams` returns `LoanCalculation` — use `equityInvested`, `monthlyPayment * 12` (not `.ltv` or `.annualDebtService` — those fields don't exist)
- IRR: `computeIRR([-equity, ...annualFlows])` — first element must be the negative initial outlay
- Slot drafting: `artifacts/api-server/src/routes/property-deck-payload.ts` — slot-specific LLM helpers (`draftHeaderSubtitle`, `draftVisionBullets`) with inline fallbacks; no separate vision module

## Visual Spec Source-of-Truth

- Canonical reference deck: `attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf`
- **Canonical PNGs (pixel-authoritative):** `attached_assets/canonical/png/L+B_Property_6-Slide_Cannonical_Page_{1..6}_*.png` — also uploaded to R2 at `canonical/lb-6-slide/slides/slide-{1..6}.png`. Every rendered slide must be compared against the corresponding PNG before delivery. Use the `lb-slides-canonical-pngs` skill for comparison checklist and re-upload workflow. PNG wins over JSON spec when they disagree.
- Machine-readable layout extract: `attached_assets/canonical/json/slide_analysis_agent_report.precise_1777824741855.json`
- Per-slide briefs: `attached_assets/canonical/briefs/Pasted-SLIDE-1-Sul-Monte-…txt`, `Pasted-SLIDE-2-Hazelnis-Retreat-…txt`, `Pasted-SLIDE-3-Cartagena-Duplex-…txt`
- Generation workflow + mandatory PNG comparison (§15): `docs/slide-system/canonical/coding-agent-instructions.md`
- Text-field char limits and source priority: `hplus-vision-templates` skill
- Budget realism for transformation copy: `hplus-renovation-benchmarks` skill

## Admin UI

`artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx` — card grid per property; one "Download PDF" action per ready card; Analyst-style regenerate button.

## LB Portfolio Deck

A separate pipeline produces a single portfolio-level deck (not per-property). Admin assigns properties to slides 1, 2, 3, 5 at `/lb-slides` (admin only); slides 4 (portfolio grid) and 6 (10-year USALI aggregate) are auto-generated. Playwright renders `/internal/lb-deck?token=<hmac-lb-token>` as a single 6-page PDF. DB: `lb_slides_config` table (single row, id = 1). Routes: `POST /api/lb-slides/render` (trigger), `GET /api/lb-slides/render-status`, `GET /api/lb-slides/download/combined.pdf` (serve), `GET /PUT /api/lb-slides/config` (admin assignment).

## Slide Factory V2 UI (SlideFactoryPanel)

Admin wizard mounted above the slide editor in `LbSlides.tsx`. Component: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`. Tab 1 (Brief): PDF/PPTX upload via presigned R2, accept flow. Tab 3 (Properties): 4-property selectors for slides 1/2/3/5. Tabs 2/4/5/6 are pipeline-stage placeholders. Tab navigation is status-driven (admin cannot freely jump tabs). Polls `GET /api/slide-factory/runs/:id` every 5 s only during transitional states (`ingesting`, `drafting`, `building`). Run storage: `artifacts/api-server/src/storage/slide-factory-runs.ts`; list limit constant: `SLIDE_FACTORY_RUNS_LIST_LIMIT`.
