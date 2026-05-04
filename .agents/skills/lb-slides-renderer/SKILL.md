# L+B Slides Renderer Skill

## What this skill covers

This skill governs all work on the 6-slide L+B canonical investor deck renderer inside `artifacts/hospitality-business-portal/src/features/internal-deck/`.

The canonical deck is extracted from `L+B Property 6-Slide Canonical.pdf`. The authoritative render specification is stored at:

- `docs/slide-system/canonical/spec_skeleton_v4.json` — element-level skeleton (chars stripped, machine-readable)
- `attached_assets/canonical_slide_render_spec_v4_pdf_deterministic_*.json` — full PDF extraction with per-character bboxes (reference only, do not parse at runtime)
- `docs/slide-system/canonical/design-contract.json` — earlier v3 spec (superseded by v4 for rendering; still useful for editorial notes)

The TypeScript source of truth in the codebase is:

```
artifacts/hospitality-business-portal/src/features/internal-deck/contract.ts
```

**Never invent colors, radii, font sizes, or positions. Every value must trace back to `contract.ts`, which traces back to `spec_skeleton_v4.json`.**

---

## Render contract (non-negotiable)

### Canvas

```
960 × 540 px, fixed size, position: relative, overflow: hidden
```

External wrappers (thumbnails, preview panes) apply `transform: scale(N)` — this is the ONLY place scaling happens. Inside the slide, nothing scales responsively.

### Positioning rule

Every element inside a slide uses `position: absolute`. No exceptions.

```tsx
// CORRECT
<div style={{ position: "absolute", left: 33, top: 6.8, width: 364.7, height: 15.96 }}>

// FORBIDDEN
<div style={{ display: "flex", padding: "20px" }}>
```

### bbox formula

All layout values come from `bb(x1, y1, x2, y2)`:

```ts
function bb(x1: number, y1: number, x2: number, y2: number) {
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}
```

Coordinates are in 960×540 space exactly as they appear in `spec_skeleton_v4.json`. Do not multiply or divide.

---

## Palette tokens

Only these colors may appear in slide rendering. No hex values outside this table.

| Token | Hex | Usage |
|---|---|---|
| `PALETTE.deep_green` | `#257D41` | Titles, accents, badges |
| `PALETTE.forest_green` | `#15331F` | Dark backgrounds, captions |
| `PALETTE.sage` | `#9FBCAD` | Slide 5/6 bg, subtitles |
| `PALETTE.pale_sage` | `#AFC7B9` | Secondary sage elements |
| `PALETTE.off_white` | `#FFF9F5` | Slide 1-4 background |
| `PALETTE.cream_card` | `#FFFBF7` | Card fill backgrounds |
| `PALETTE.muted_gray_green` | `#9FB0A4` | De-emphasized text |
| `PALETTE.white` | `#FFFFFF` | Text on dark/sage backgrounds |
| `PALETTE.fine_rule` | `#D8D7D2` | Divider lines, card borders |
| `PALETTE.caption_overlay` | `rgba(21,39,28,0.70)` | Photo caption overlay gradient |

All tokens are exported from `contract.ts` as `PALETTE`.

---

## Font stack

Fonts are self-hosted WOFF files declared in `fonts.css`. Use the `FONTS` export from `contract.ts`.

| Token | CSS family | Weights | Usage |
|---|---|---|---|
| `FONTS.editorial` | `"EB Garamond Deck", Georgia, serif` | 400, 700 | Slide titles (Georgia-BoldItalic in PDF) |
| `FONTS.body` | `"Poppins Deck", Arial, sans-serif` | 200, 400, 700 | All body, badges, captions |
| `FONTS.numeric` | `"Roboto Condensed Deck", Arial, sans-serif` | 400, 700 | Financial table cells (Slide 6 only) |

Font weight constants: `FW.extralight = 200`, `FW.regular = 400`, `FW.bold = 700`.

**Never use generic "Garamond", "Poppins", or system fonts directly — always use the `FONTS.*` token.**

---

## Slide backgrounds

| Slides | Key | Color |
|---|---|---|
| 1, 2, 3, 4 | `off_white_grid` | `#FFF9F5` |
| 5, 6 | `sage_solid` | `#9FBCAD` |

Exported as `SLIDE_BG` from `contract.ts`.

---

## Slide structure: dynamic vs deterministic

| Slide | Title | Dynamic slots (from `deckPayloadV2`) | Fully deterministic |
|---|---|---|---|
| 1 | Pipeline Spotlight | propertySubtitle, headerSubtitle, visionBullets, closingTagline, photoCaptions | propertyName, askingPrice, propertySpecs, headerTitle |
| 2 | Alt View / Gallery | operationalModelText, revenueBullet, programmingBullet | financials, photo grid |
| 3 | Investment Model | conceptParagraph, marketRationale, reasons, closingLine | property data |
| 4 | Portfolio Overview | — | all (sibling property cards) |
| 5 | Transformation Plan | transformRows, keyMetrics | financial table, financing summary |
| 6 | Pro Forma | — | all (5-year income statement from engine) |

---

## Variable binding resolution

Each `TextElement` in `contract.ts` has an optional `variableBinding` field. The renderer resolves it as:

```ts
function resolveBinding(payload: SlidePayload, binding: string | null, fallback: string): string {
  if (!binding) return fallback;
  const val = getNestedValue(payload, binding);
  return val ?? fallback;
}
```

- If `variableBinding` is `null` → render `sourceContent` verbatim (static PDF chrome)
- If bound value exists → use it
- If bound value is absent → use `sourceContent` as fallback

---

## Vector paths

For elements with `render_type: "vector_path"`:

- Filled rectangle (path_type `"f"`, no stroke): render as absolutely-positioned `div` with `background` = `fill_hex` and `opacity` = `fill_opacity`
- Stroked line: render as `<svg>` with `<line>` — set `stroke`, `strokeWidth`, `strokeOpacity`, `lineCap`, `lineJoin`, `strokeDasharray`
- Never omit `stroke_opacity` or `lineCap` when they are specified in the spec

---

## Images and clip paths

Images are `position: absolute` with `object-fit: cover`. If `matched_clip_path` is present in the spec, apply `borderRadius` = `corner_radius_average_points` px and `overflow: hidden`.

**Do not invent border-radius values.** If no `clip_path` or `alpha_mask_analysis` data exists for an image element, use `borderRadius: 0`.

---

## Forbidden (will fail review)

1. `display: flex` or `display: grid` inside a slide canvas
2. Any color hex not in `PALETTE`
3. `position: relative` on any element inside the slide (except the canvas root itself)
4. UI component libraries (shadcn, MUI, etc.) for card/table rendering
5. `######` in any rendered output — always compute or omit the cell
6. Responsive sizing keywords (`vw`, `vh`, `%`, `auto` for positioning)
7. Guessed `border-radius` values without spec backing

---

## Key files

| File | Purpose |
|---|---|
| `src/features/internal-deck/contract.ts` | Single TS source of truth — palette, fonts, CANVAS, bb(), types, slide specs |
| `src/features/internal-deck/slides.tsx` | Six React slide components — must import ONLY from contract.ts |
| `src/features/internal-deck/canonical-assets.ts` | R2 keys for PNG/PDF reference assets (portal side) |
| `src/features/internal-deck/fonts.css` | WOFF declarations — do not modify without checking PDF font list |
| `src/features/internal-deck/helpers.tsx` | Utility functions (fmtCurrency, photoSrc, etc.) |
| `artifacts/api-server/src/slides/canonical-assets.ts` | R2 keys for PNG/PDF reference assets (server side) |
| `lib/shared/src/deck-payload-v2.ts` | Dynamic authored slot schema — the variable_binding authority |
| `docs/slide-system/canonical/spec_skeleton_v4.json` | Element-level spec from PDF extraction (chars stripped, ~27k lines) |
| `docs/slide-system/canonical/r2-manifest.json` | R2 key manifest written by the upload script |
| `scripts/src/upload-canonical-slides.ts` | Re-run this if the canonical PDF changes |

---

## R2 canonical assets

All reference assets are stored in R2 under the `canonical/lb-6-slide/` prefix.

| Asset | R2 key |
|---|---|
| Full 6-slide PDF | `canonical/lb-6-slide/lb-6-slide-canonical.pdf` |
| Slide 1 PNG (300 dpi) | `canonical/lb-6-slide/slides/slide-1.png` |
| Slide 2 PNG | `canonical/lb-6-slide/slides/slide-2.png` |
| Slide 3 PNG | `canonical/lb-6-slide/slides/slide-3.png` |
| Slide 4 PNG | `canonical/lb-6-slide/slides/slide-4.png` |
| Slide 5 PNG | `canonical/lb-6-slide/slides/slide-5.png` |
| Slide 6 PNG | `canonical/lb-6-slide/slides/slide-6.png` |
| Slide 1–6 individual PDFs | `canonical/lb-6-slide/slides/slide-N.pdf` |

Import `CANONICAL_ASSETS` from `canonical-assets.ts` to get typed access to these keys. Use `CANONICAL_ASSETS.slide(N, "png")` or `CANONICAL_ASSETS.slide(N, "pdf")` for convenience.

To re-upload (e.g. if the canonical PDF changes):
```bash
pnpm --filter @workspace/scripts run upload:canonical-slides
```

---

## How to update a single slide

1. Open `spec_skeleton_v4.json` and find the slide's `text_runs`, `vector_paths`, `images` arrays
2. Identify which `variable_binding` fields map to `deckPayloadV2` properties
3. Update or add the element in `contract.ts` under the appropriate slide spec
4. Update the component in `slides.tsx` to use the new/changed element — absolute positioning from `bb()`, style from the element's `style` object in the spec
5. Run `pnpm run typecheck` — must pass with zero errors
6. Visually compare against the `spec_skeleton_v4.json` reference values

---

## Canvas size change from previous renderer

The old renderer used 1920×1080. The canonical spec uses 960×540. If you encounter legacy 1920×1080 pixel values in comments or old code, divide by 2 to get the correct spec-native value, or better — delete the comment and re-derive from `spec_skeleton_v4.json`.

---

## Validation rules (from spec)

| ID | Severity | Rule |
|---|---|---|
| v_abspos | error | Every rendered element must use `position:absolute` |
| v_bbox | error | `left/top/width/height` must match bbox values |
| v_no_hashes | error | `######` must not appear in output |
| v_strokes | error | Stroke elements must set `stroke_width`, `stroke_hex`, `stroke_opacity`, `lineCap`, `lineJoin`, `dashes` exactly |
| v_clips | error | Images with `matched_clip_path` must apply border-radius |
| v_no_default_radius | warning | Do not invent radii without spec backing |
| v_baseline_compare | warning | Compare rendered output visually against PDF reference |
