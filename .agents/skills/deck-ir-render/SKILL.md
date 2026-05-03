---
name: deck-ir-render
description: Render a validated deck render-IR (from slide-deck-spec) to HTML/CSS/React. Use when building a deck preview, web viewer, or HTML source for the deck-export PDF pipeline. The renderer is generic — driven entirely by the IR, with zero per-deck JSX. Pairs with slide-deck-spec (input) and deck-export (PDF output).
---

# Deck IR → HTML

A generic renderer that takes a `RenderIR` document and produces HTML. No per-slide React components — every slide is rendered by walking the same element list. New deck designs require zero new code; they ship as new IR.

## When to Use

- Web preview of a deck.
- Producing HTML to feed to `deck-export` (Playwright → PDF).
- Live-editing scenarios where the IR mutates and the UI re-renders.

## Renderer Contract

Input: a `RenderIR` validated against the Zod schema from `slide-deck-spec`.
Output: one `<section class="deck-slide">` per slide, sized to `slideSize` in `pt` (CSS supports `pt` natively; for screen preview, scale via `transform: scale(pxPerPt)` on a wrapper).

```tsx
function DeckRenderer({ ir }: { ir: RenderIR }) {
  return (
    <div className="deck">
      {ir.slides.map(s => <Slide key={s.slideId} slide={s} ir={ir} />)}
    </div>
  );
}
```

## Layout Rules

- Slide container: `position: relative; width: ${ir.slideSize.width}pt; height: ${ir.slideSize.height}pt; overflow: hidden;`
- Every element: `position: absolute; left: ${x}pt; top: ${y}pt; width: ${w}pt; height: ${h}pt; z-index: ${zOrder};`
- Apply `rotation` via `transform: rotate(${rotation}deg)` (origin: center).
- Apply `opacity` if present.

## Element Renderers

Pure functions, one per `kind`. Each returns a single positioned element.

| kind | DOM | Notes |
|---|---|---|
| `textBox` | `<div>` containing `<span>` per run | Use `display: flex` for `align`; runs become spans with inline `font-family/size/weight/color`. Apply `lineHeight` to the container. |
| `image` | `<img>` | `src` from `assets[assetId].source`. `object-fit: cover`. Always pass explicit `width`/`height` attrs for headless-Chromium PDF stability. |
| `rect` | `<div>` | `background: fill; border: stroke.width pt solid stroke.color`. |
| `ellipse` | `<div>` | Same as rect + `border-radius: 50%`. |
| `line` | `<svg>` | One `<line>` inside an SVG sized to bbox. Stroke from `stroke`. |
| `svg` | inline `<svg>` from `assets[assetId]` | Inline so CSS can style; for opaque external SVG use `<img>`. |
| `group` | `<div>` | `position: relative`; children's `x/y` are local to the group. Children render with their own absolute positioning inside. |

## Asset Resolution

The renderer needs an `assetResolver(assetId) → URL | dataURL`. Three strategies:

- **Web preview** — resolve to a signed URL or `/api/assets/:id` route.
- **PDF export** — resolve to a `data:` URL (base64) so Playwright doesn't make network calls inside Chromium. Pre-fetch all assets server-side, build a map, pass it in.
- **Native render** (Skia/Canvas) — resolve to a `Buffer` and draw directly.

The resolver is the only thing that varies across rendering targets.

## Fonts

Render-IR carries `fontId`s; the deck's `theme.fonts` registry maps `fontId → { family, source }`. Inject as `<link rel="stylesheet">` (Google Fonts) or `@font-face` (self-hosted). For PDF export, **always self-host or inline** — Playwright in headless mode often misses network font loads.

Wait for `document.fonts.ready` before signaling render complete:

```ts
await document.fonts.ready;
window.__deckReady = true;  // Playwright polls this
```

## CSS Reset

Slides need a clean baseline:

```css
.deck-slide * { box-sizing: border-box; margin: 0; padding: 0; }
.deck-slide img { display: block; }
.deck-slide { font-family: system-ui, sans-serif; color: #000; background: #fff; }
```

## Print-Mode

When generating HTML for PDF, add to the slide container:

```css
@page { size: ${slideSize.width}pt ${slideSize.height}pt; margin: 0; }
.deck-slide { page-break-after: always; }
.deck-slide:last-child { page-break-after: auto; }
```

## Validation

The renderer MUST validate `ir` with the Zod schema from `slide-deck-spec` before mounting. A malformed IR is a bug — fail loud, do not skip elements silently.

## Anti-Patterns

- **Per-slide React components** — defeats the purpose. The renderer is generic; new designs ship as IR, not code.
- **CSS in pt for some properties, px for others** — pick `pt` for layout, period. Scale via transform for screen.
- **Loading remote fonts/images during PDF render** — flaky in headless. Pre-resolve to data URLs.
- **Reading from semantic spec at render time** — render-IR is self-sufficient. The semantic spec is for editing, not rendering.
- **Recomputing the IR on every render** — IR is immutable per `revisionId`; cache aggressively.
