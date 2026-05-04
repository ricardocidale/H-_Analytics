---
name: slide-deck-spec
description: Define and validate the canonical JSON schema for slide decks (semantic spec + render-IR). Use when designing, generating, validating, or storing slide deck content as structured data — across any project that needs durable, reusable, vendor-neutral deck representations. Pairs with slide-deck-vector (storage), pptx-to-deck-ir (extraction), deck-ir-render (HTML), and deck-export (PDF/PPTX).
---

# Slide Deck Spec

A slide deck is two linked JSON documents:

1. **Semantic spec** — what the deck *means*. Bound to data sources (e.g. `property.name`, `financials.irr`). Human/LLM-friendly. Durable across redesigns.
2. **Render-IR** — pixel-precise layout. Every element with x/y/w/h/zOrder/fill/stroke/font. Vendor-neutral (no React/HTML in the IR). Reproducible.

Each semantic element carries a `semanticRef` that points to where its content comes from. The render-IR carries the resolved layout. Renderers consume render-IR; editors and LLMs work on semantic spec.

## When to Use

- Generating a deck from app data (semantic spec is your output).
- Importing a canonical PPTX/PDF reference (extract render-IR; tag elements with semantic refs).
- Validating a deck before render or storage.
- Designing a deck-editor UI (the semantic spec is the editable surface).

## Locked Design Decisions

These are non-negotiable for cross-app reuse. Do not break them without an ADR.

1. **Schema versioning** — top-level `schemaVersion: "1.0"`. Bump on breaking changes.
2. **Units** — absolute `pt` (PowerPoint native: 1 pt = 1/72"). Slide size declared once at deck level (default `{ width: 960, height: 540 }` for 16:9 widescreen). Renderers convert to px/EMU as needed. Never use `%` in render-IR.
3. **Coordinates** — top-left origin. Every element has `x, y, w, h, zOrder` (integer; lower = behind). Optional `rotation` (degrees), `opacity` (0–1).
4. **Color** — 8-char hex with alpha: `"#RRGGBBAA"`. Theme-token references allowed in semantic spec (e.g. `"theme.primary"`); render-IR must contain resolved hex only.
5. **Assets** — registry at deck level: `assets: [{ id, kind: "image"|"svg"|"font", source: { url? | storageKey? | dataRef? } }]`. Elements reference `assetId`. Inline base64 only for SVGs ≤ 8 KB; everything else by reference.
6. **Element types** — fixed enum: `textBox | image | line | rect | ellipse | svg | group`. `group` has `children[]` with coords local to the group origin.
7. **Text runs** — a `textBox` has `runs: [{ text, fontId, sizePt, weight, italic, color, letterSpacing, lineHeight, align }]`. Rich text is just multiple runs.
8. **Semantic binding** — every semantic element has `{ id, kind, semanticRef?, content }`. `semanticRef` is a dotted path into the data source (`property.name`). When absent, `content` is literal.
9. **IDs** — stable across edits. Prefer human-readable: `slide1.heroPhoto`, `slide3.priceCard.value`. Required for diffing, vector retrieval, and editor cursors.
10. **Provenance** — every field carries `source: "seed" | "engine" | "llm" | "user" | "canonical-pptx"` and `updatedAt`. Without this, you cannot trust regeneration.

## Top-Level Shape

```ts
// Semantic spec
{
  schemaVersion: "1.0",
  deckId: string,
  revisionId: string,        // bump on every save
  title: string,
  slideSize: { width: 960, height: 540 },
  theme: { tokens: { primary: "#1C2B1EFF", ... }, fonts: [...] },
  assets: [{ id, kind, source }],
  slides: [{
    slideId: string,         // stable
    slideIndex: number,      // ordering only; not an ID
    archetype: "cover" | "property-spotlight" | "financials" | ...,
    elements: [{ id, kind, semanticRef?, content, layoutHintRef? }],
  }],
  metadata: { sourceFileHash?, createdBy, ... },
}

// Render-IR (derived; cacheable)
{
  schemaVersion: "1.0",
  deckId, revisionId,
  slideSize, theme, assets,
  slides: [{
    slideId,
    background: { fill?, assetId? },
    elements: [{
      id,                    // matches semantic.id when bound
      kind: "textBox" | "image" | "line" | "rect" | "ellipse" | "svg" | "group",
      x, y, w, h, zOrder,
      rotation?, opacity?,
      // kind-specific:
      runs?, assetId?, fill?, stroke?, points?, children?,
    }],
  }],
}
```

## Validation

Use **Zod** as the runtime validator; emit JSON Schema (draft 2020-12) via `zod-to-json-schema` for external consumers (editors, other languages).

- Every renderer/exporter MUST validate input render-IR before drawing. Failures are loud.
- Every writer MUST validate semantic spec before persisting. Storage is append-only by `revisionId`.
- Element IDs MUST be unique within a slide. Slide IDs unique within a deck.

## What Goes Where

| Concern | Semantic spec | Render-IR |
|---|---|---|
| What the slide says | ✅ | ❌ |
| Data binding | ✅ (`semanticRef`) | ❌ (resolved values only) |
| Layout (x/y/w/h/z) | ❌ | ✅ |
| Colors | tokens allowed | resolved hex only |
| Assets | by id | by id |
| Bullet text | yes | yes (resolved) |
| Computed numbers | `semanticRef: "financials.irr"` | resolved string `"18.4%"` |

## Anti-Patterns

- **Mixing layers** — putting `x: 120` on the semantic spec or `semanticRef` on render-IR.
- **% units** — breaks pixel fidelity across viewports.
- **Inline base64 images** — bloats every row; use the asset registry.
- **Mutating in place** — every save bumps `revisionId`; old revisions are immutable.
- **Parsing PDFs** — PDF is output, not source. See `pptx-to-deck-ir` for the canonical extraction path.

## Portability Boundary

The slide stack splits three ways: code that drops into any app unchanged, patterns whose architecture transfers but whose contents must be reauthored, and L+B-specific code that should not be extracted. The discriminator is import + content: any file that imports `@engine/*` or `@analytics/*`, or hard-codes slot keys / slide counts / domain field names, belongs in tier 3.

**Tier 1 — Truly generic, use as-is:**

| Layer | Where it lives | What it gives a new app |
|---|---|---|
| Schema | `lib/shared/src/deck-payload-v2.ts` | Versioned semantic-spec + render-IR contracts |
| Renderer plumbing | `slides/playwright-browser.ts`, `slides/internal-token.ts`, `slides/deck-logic-version.ts` | Headless-Chromium pool, signed-URL token helper, deck-logic version constant |
| Skills | `slide-deck-spec`, `slide-deck-vector`, `deck-ir-render`, `deck-export`, `pptx-to-deck-ir` | Schema authoring, pgvector storage, IR→HTML, HTML→PDF/PPTX, PPTX import |

**Tier 2 — Pattern portable, contents L+B; copy & reauthor:**

| Layer | Where it lives | What transfers vs. what doesn't |
|---|---|---|
| Slot context map | `slides/slot-context-map.ts` | **Pattern:** slot-key → minimal-brief-fields lookup keyed off a `DraftSlotKey` union. **Contents:** the 11 L+B slot names and their field references (`adrFormatted`, `revparFormatted`, `roomCount`) are real-estate-specific. |
| Slot output validator | `slides/slot-output-validator.ts` | **Pattern:** per-slot validation + budget enforcement, fail-loud on over-budget LLM output. **Contents:** rules typed against `DraftSlotKey` are L+B. |
| Slot readiness | `slides/slot-readiness.ts` | **Pattern:** complete / stale / missing / deterministic state machine using `provenance.updatedAt` vs. source-record `updatedAt`. **Contents:** `DRAFT_SLOT_KEYS` and `HUMAN_SLOT_KEYS` arrays are L+B. |

**Tier 3 — L+B-specific, do not extract:**

| Layer | Where it lives | Why it stays |
|---|---|---|
| Domain data shape | `slides/types.ts` (`SlideProperty`), `slides/property-brief.ts`, `ai/property-vision.ts`, `ai/buildPropertyContext.ts` | Real-estate underwriting context. A different domain substitutes its own brief + vision module. |
| Underwriting payload assembler | `slides/build-payload.ts` | Imports `@engine/*` and `@analytics/*` (IRR, debt, aggregation). Real-estate-specific by construction. |
| Render constants | `slides/deck-render-constants.ts` | `TOTAL_SLIDES = 6` and viewport sizing are tuned to the L+B 6-slide deck. |
| L+B template | `lb-slides-renderer` skill, `lb-slides-canonical-pngs` skill, `slides/canonical-assets.ts` | Template, brand, and pixel-authoritative PNGs are L+B-specific by design. |
| Brand/design tokens | `hbg-design-philosophy` skill | HBG portal visual identity. The portable foundation lives in `nai-design-system`. |

**Adoption checklist for a new app:**

1. Reuse Tier 1 unchanged: `lib/shared/src/deck-payload-v2.ts`, `playwright-browser.ts`, `internal-token.ts`, `deck-logic-version.ts`, and the five generic skills.
2. Copy Tier 2 files (`slot-context-map.ts`, `slot-output-validator.ts`, `slot-readiness.ts`) into the new app, then rewrite the slot-key union, the context-map, the validator rules, and the readiness key lists to match the new app's slide template and domain brief.
3. Replace Tier 3 entirely: write your own domain `Brief` type + brief-builder + LLM-vision module, your own payload assembler over your domain's data sources, and your own canonical template (skill + PNGs). Do not fork `lb-slides-renderer`.
4. Confirm no imports from `@engine/*` or `@analytics/*` survive into the new app's slide stack — those define the H+/L+B substitution boundary.
