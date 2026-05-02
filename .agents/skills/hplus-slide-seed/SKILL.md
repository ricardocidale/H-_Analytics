---
name: hplus-slide-seed
description: Slide decks are seed files — auto-generated at server boot for every property, stored in cloud storage, immediately downloadable in Admin without any manual trigger. Use this skill whenever working on slide generation, the Admin Slide Decks tab, or any boot-time job that touches property_slide_deck_variants.
---

# H+ Analytics — Slide Deck Seeding

## Core Rule

**Slide PPTX files are seed data, not on-demand artifacts.**

Exactly like property renders (hero photos, thumbnails) are seeded at boot, slide decks for every property are generated at server startup and stored in cloud storage. Admin users must be able to open the Slide Decks tab and immediately download any deck — no "Generate" click required.

The **Analyst button** exists only for *manual regeneration* after data changes.

---

## How It Works

### Boot sequence (index.ts)

```
Phase 2b: runSeedsSafely()  →  seeds slide-recipe + other data
Phase 2c: setImmediate(() => preGenerateAllSlides())  →  generates missing slide files
```

`preGenerateAllSlides()` lives in `artifacts/api-server/src/routes/property-slides.ts`.

It runs AFTER migrations (guarantees `property_slide_deck_variants` table exists), and is fully backgrounded — never blocks the server from serving requests.

### What preGenerateAllSlides does

1. Loads all properties from storage
2. Loads existing `property_slide_deck_variants` rows
3. Builds a `readySet` of `"propertyId:format"` strings where status = "ready"
4. For each property missing either format, claims the slot with `tryMarkGenerating` (idempotent upsert — prevents duplicate generation on concurrent boot)
5. Runs `generateTrack1` (Python editable PPTX) and `generateTrack2` (image-locked PPTX) in batches of 2
6. On success: status → "ready", file stored in cloud storage
7. On failure: status → "error", retried on next boot

### Formats

| Format | Key | Generator | Description |
|--------|-----|-----------|-------------|
| `pptx` | `slides/pptx/property-{id}.pptx` | Python `generate_property_slides.py` | Editable PPTX matching L+B _02_ template |
| `image` | `slides/image/property-{id}.pptx` | `renderImagePptx` (TypeScript) | Image-locked: 6 JPEGs in a PPTX container |

### Admin UI (SlideDecksTab)

- Polls `GET /api/slides/status` every 5s while any property is in "generating" state
- Shows "Generating…" badge during boot pre-generation
- Shows "Ready" + file size + date when complete
- **Download PPTX** and **Download Images** buttons become active immediately when ready
- **Analyst** button = manual regeneration (POST `/api/properties/:id/slides/generate`)

---

## What Triggers Regeneration

| Trigger | Mechanism |
|---------|-----------|
| Server boot (missing or error status) | `preGenerateAllSlides()` — automatic |
| Admin clicks Analyst button | POST `/api/properties/:id/slides/generate` |
| Property financial data changes | Not yet wired — manual regeneration needed |

---

## Claim Contract (concurrency safety)

`tryMarkGenerating(propertyId, format, triggeredBy)` uses a database-level upsert with:
```sql
ON CONFLICT (property_id, format) DO UPDATE SET status = 'generating'
WHERE property_slide_deck_variants.status != 'generating'
RETURNING property_id
```

Returns `true` only if this process claimed the slot. Generation only runs for claimed slots. This prevents duplicate generation when the server restarts mid-generation.

---

## Sister Skills

- `hplus-slide-recipe` — slot recipe JSON, hybrid compositing architecture
- `hplus-slide-mapping` — field → shape name mapping
- `hplus-canonical-slide-1` / `hplus-canonical-slide-2` — per-slide content specs

---

## Never Do This

- Do NOT require the user to click "Generate" before slides are available
- Do NOT skip `preGenerateAllSlides()` in the boot sequence
- Do NOT remove the `setImmediate` wrapper (it must run after migrations)
- Do NOT mark a format as "generating" without immediately running the generator
