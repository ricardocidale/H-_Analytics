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

The slide stack splits cleanly into a generic layer (reusable across apps) and an app-specific layer (per-product templates and design language). Keep the boundary clean so other apps can adopt the generic layer without inheriting H+/L+B specifics.

**Generic / app-agnostic — reusable as-is:**

| Layer | Where it lives | What it gives a new app |
|---|---|---|
| Schema | `lib/shared/src/deck-payload-v2.ts` | Versioned semantic-spec + render-IR contracts |
| Deterministic core | `artifacts/api-server/src/slides/` (`slot-context-map`, `slot-output-validator`, `slot-readiness`, `build-payload`, `playwright-browser`, `internal-token`, `deck-render-constants`, `deck-logic-version`) | LLM gating, slot validation, deterministic facts pipeline, headless-Chromium renderer plumbing |
| Skills | `slide-deck-spec`, `slide-deck-vector`, `deck-ir-render`, `deck-export`, `pptx-to-deck-ir` | Schema authoring, pgvector storage, IR→HTML, HTML→PDF/PPTX, PPTX import |

**App-specific — do NOT extract or generalize:**

| Layer | Where it lives | Why it stays |
|---|---|---|
| Domain data shape | `slides/types.ts` (`SlideProperty`), `slides/property-brief.ts`, `ai/property-vision.ts` | Real-estate underwriting context (rooms, ADR, occupancy). A different domain substitutes its own brief + vision module. |
| L+B 6-slide template | `lb-slides-renderer` skill, `lb-slides-canonical-pngs` skill, `slides/canonical-assets.ts` | Template, brand, and pixel-authoritative PNGs are L+B-specific by design. |
| Brand/design tokens | `hbg-design-philosophy` skill | HBG portal visual identity. The portable foundation lives in `nai-design-system`. |

**Cross-app dependencies to be aware of:** `slides/build-payload.ts` and `slides/property-brief.ts` import from `@engine/*` and `@analytics/*` (financial models — IRR, debt, aggregation). For non-real-estate adoption, those imports define the substitution boundary: replace the domain math, keep the slot/validator/renderer plumbing.

**Adoption checklist for a new app:**

1. Reuse `lib/shared/src/deck-payload-v2.ts` and the `slides/` deterministic core unchanged.
2. Replace `SlideProperty` and `property-brief.ts` with your domain's equivalent fact-brief.
3. Author your own canonical template (skill + PNGs) — don't fork `lb-slides-renderer`.
4. Reuse `slide-deck-spec`, `slide-deck-vector`, `deck-ir-render`, `deck-export`, `pptx-to-deck-ir` as-is.
