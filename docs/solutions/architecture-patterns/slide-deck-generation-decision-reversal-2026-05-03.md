---
title: "Slide deck generation: dual-format PPTX superseded by Playwright HTML→PDF"
date: 2026-05-03
last_updated: 2026-05-07
category: architecture-patterns
module: slides
problem_type: decision_record
component: service_object
severity: high
status: superseded
applies_when:
  - "Deciding whether to add a PPTX or image-PPTX slide variant"
  - "Evaluating whether to reinstate the satori/sharp/python-pptx pipeline"
  - "Understanding why the property_slide_deck_variants table still has 'pptx' and 'image' in its DB CHECK"
tags:
  - slides
  - playwright
  - pptx
  - decision-reversal
  - institutional-memory
---

# Slide deck generation: dual-format PPTX superseded by Playwright HTML→PDF

## Supersession (2026-05-12)

**This document is superseded.** Factory v2 reinstated the PPTX-as-truth pipeline it describes as abandoned. The catalyst was the v7 reconstruction package (`lb_property_reconstruction_package_v7_cleaned_instructed.zip`), which supplies a canonical source PPTX + per-slide bbox/object manifest as structural truth — eliminating the satori/sharp fidelity gap that motivated the 2026-05-03 reversal.

The authoritative pipeline is now PPTX template substitution (`pptx-automizer`) → LibreOffice headless export → dual-format PPTX + PDF. See `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md` for the full rationale and implementation record.

The Playwright HTML→PDF path described below still exists as `lb-deck-pdf.ts` (legacy Franco/React path) but is no longer the V2 factory's render path.

---

## What this doc is

A decision-reversal record. It explains why an earlier two-format PPTX approach was
built, then abandoned, and what the authoritative pipeline is today. This replaces two
stale docs that described the old architecture as if it were current:

- ~~`two-format-slide-deck-generation-2026-05-02.md`~~ (deleted 2026-05-07)
- ~~`slide-decks-tab-dual-format-migration-2026-05-02.md`~~ (deleted 2026-05-07)

## Authoritative pipeline (current)

The only slide deck generation path is **Playwright HTML→PDF**:

```
React internal-deck pages  →  GET /api/properties/:id/deck.pdf
                           →  property-deck-pdf.ts
                           →  Playwright headless Chromium
                           →  R2 (format='pdf')
```

- Route file: `artifacts/api-server/src/routes/property-deck-pdf.ts`
- Singleton browser: `artifacts/api-server/src/slides/playwright-browser.ts`
- Token auth: `artifacts/api-server/src/slides/internal-token.ts`
- DB: `property_slide_deck_variants` table, `format='pdf'` rows only
- Schema: `lib/db/src/schema/property-slide-decks.ts` — format CHECK is `IN ('pdf')`

**Do not add Puppeteer.** Playwright is the single supported renderer; Chromium is
installed at build time into `.cache/ms-playwright/`.

**Do not add PPTX or image-PPTX variants** without a full decision review. The
constraints that ruled them out are documented below.

## What existed before (2026-05-02 — superseded)

An earlier pipeline built two PPTX variants per property:

| Track | Generator | Format |
|-------|-----------|--------|
| Track 1 | `python-pptx` template-filling via a Python subprocess | Editable PPTX |
| Track 2 | `satori` (JSX→SVG) → `sharp` (SVG→JPEG) → `pptxgenjs` (JPEG→PPTX) | Image-locked PPTX |

There was also a standalone browser viewer artifact (`artifacts/property-slides/`) —
a Vite SPA for designers to verify slide output — and a dual-format admin UI
(`SlideDecksTab.tsx`) with separate status rows and download buttons for each format.

**None of this code exists today.** The `artifacts/property-slides/` artifact was
never shipped. Tracks 1 and 2 were removed in the 2026-05-03 Playwright migration.
Migration 0042 narrowed `property_slide_deck_variants.format` to `'pdf'`-only in the
application. (Note: the DB CHECK on the live Neon instance retains `'pptx'` and
`'image'` in the allowed set for backward compatibility with historical rows, per
migration 0033's SQL comment — but no new rows with those formats are ever written.)

## Why the reversal happened

The two-format pipeline was built under the assumption that Playwright/Puppeteer was
too heavy for Railway (~300MB Chromium binary, browser lifecycle complexity). The
rationale was sound at the time but proved wrong in practice once Playwright was
benchmarked against the actual Railway container budget.

Key constraints that drove the original design — and why they were re-evaluated:

**Python-pptx (Track 1):** Produced acceptable editable output but could not generate
a pixel-perfect image-locked format without a browser. It also required maintaining a
Python subprocess environment alongside the Node.js server — added operational
complexity.

**AI image generation (DALL-E / gpt-image-1):** Evaluated and rejected categorically.
LLMs hallucinate digits in financial figures. An investor deck with a wrong number is
worse than no deck.

**satori + sharp + pptxgenjs (Track 2):** Zero native dependencies, pure TS pipeline.
But it required dedicated server-side JSX components (separate from the browser-
optimised Tailwind components) and a restricted CSS subset (no grid, no CSS variables,
no Tailwind). Maintenance cost of two component trees was high.

**Playwright re-evaluation:** Once Playwright was benchmarked on Railway it fit within
the container budget. A single render path, no dual component trees, no Python
subprocess, and faithful rendering of the full design system including Tailwind and
CSS variables. The 300MB concern did not materialise in practice.

## Why the old DB CHECK still has 'pptx' and 'image'

Migration 0033 (`0033_property_slide_deck_variants_pdf_format.sql`) added `'pdf'` to
the DB-level CHECK constraint while keeping `'pptx'` and `'image'` in the allowed
set. The SQL comment explains: backward compatibility with historical rows migrated
from the old `property_slide_decks` table (migration 0029). No writer in the current
codebase inserts those formats. The Drizzle schema (`property-slide-decks.ts`) already
enforces `IN ('pdf')` at the application layer.

This is intentional belt-and-suspenders. Do not add writers for `'pptx'` or `'image'`
without a deliberate decision to reinstate those variants.

## Related

- `artifacts/api-server/migrations/0033_property_slide_deck_variants_pdf_format.sql` — DB CHECK history
- `artifacts/api-server/src/routes/property-deck-pdf.ts` — authoritative PDF generator
- `artifacts/api-server/src/slides/playwright-browser.ts` — singleton Playwright browser
- `lib/db/src/schema/property-slide-decks.ts` — authoritative schema (format='pdf' only)
- `CLAUDE.md` § "LB Slides — investor PDF decks (Playwright HTML→PDF)" — canonical architecture description
