---
name: pptx-to-deck-ir
description: Extract a canonical PPTX (.pptx) file into the deck render-IR + semantic-spec defined by slide-deck-spec. Use when importing a designer-built PowerPoint as the truth source for a slide deck system, or when reverse-engineering a reference deck. Do NOT use for PDF — PDF is output and unreliable for structural extraction; always insist on the PPTX source.
---

# PPTX → Deck IR

PowerPoint files (`.pptx`) are ZIP archives of OOXML. They preserve every shape, position, z-order, theme color, font, and image as structured XML. This is the canonical extraction path for the deck system. PDF is rendering output and lacks z-order, theme tokens, and reliable text-run grouping — refuse PDF as source.

## When to Use

- Designer hands over a `.pptx` reference deck and you need to mirror it programmatically.
- Building a "deck template library" from a folder of `.pptx` files.
- Bootstrapping `slide-deck-spec` content from an existing deck instead of authoring from scratch.

## Toolchain

- `jszip` — read the ZIP container.
- `fast-xml-parser` (or `xml2js`) — parse OOXML.
- Native `Buffer` — extract embedded media (`ppt/media/*`).
- Output: validated render-IR + draft semantic-spec per `slide-deck-spec`.

Avoid heavyweight all-in-one parsers (`pptx2json`, etc.) — they hide z-order and theme resolution. Hand-rolled is ~250 lines and far more reliable.

## File Layout Inside a .pptx

```
[Content_Types].xml
ppt/
  presentation.xml         # slide size, master refs, slide order
  theme/theme1.xml         # color scheme, font scheme
  slides/slide1.xml        # the actual shapes for slide 1
  slides/slide2.xml        # ...
  slideLayouts/*.xml       # layout templates
  slideMasters/*.xml       # master templates
  media/image1.png         # embedded images
  media/image2.jpeg        # ...
  _rels/
    presentation.xml.rels  # slide → xml file
  slides/_rels/
    slide1.xml.rels        # image refs → media/imageN.*
```

## Extraction Pipeline

1. **Open the ZIP** with JSZip; read `ppt/presentation.xml` to get slide size in EMU (914400 EMU = 1 inch = 72 pt).
2. **Resolve theme** from `ppt/theme/theme1.xml` — collect `accent1..accent6`, `lt1`, `dk1`, `lt2`, `dk2`, plus the major/minor font scheme. This becomes the `theme.tokens` and `theme.fonts` in the spec.
3. **For each `slides/slideN.xml`**:
   - Parse `<p:spTree>`. Children are shapes in document order; document order = z-order (first = back). Assign `zOrder = index`.
   - For each `<p:sp>` (shape): read `<p:spPr>/<a:xfrm>` for `x, y, w, h` (in EMU; convert to pt with `÷ 12700`). Map `<a:prstGeom prst="rect">` → `kind: "rect"`, `prst="ellipse"` → `"ellipse"`, etc.
   - For `<p:pic>` (picture): get `r:embed` from `<a:blip>`, resolve via `slides/_rels/slideN.xml.rels` to `ppt/media/imageX.png`. Register asset; element kind `"image"`.
   - For text-bearing shapes: walk `<p:txBody>/<a:p>/<a:r>` runs. Each `<a:r>` becomes a `runs[]` entry: `{ text: <a:t>, fontId, sizePt: rPr.sz/100, weight: rPr.b ? 700 : 400, color: <a:solidFill>/<a:srgbClr> or <a:schemeClr> }`.
   - For `<p:grpSp>` (group): recurse; children's `x/y` are local to the group's `chOff`/`chExt` transform.
4. **Resolve theme refs** — anywhere a color is `<a:schemeClr val="accent1"/>`, look up `theme.tokens.accent1` and write the resolved `#RRGGBBAA` into render-IR. Keep the token reference in the semantic spec.
5. **Extract media** — write each `ppt/media/*` to your asset store (R2/S3/disk/base64), capturing the storage key. Build `assets[]` registry.
6. **Stable IDs** — derive element IDs deterministically: `slide${N}.${kind}${index}` (e.g. `slide1.image2`). For text, use the first ~20 alphanumeric chars of the text as a hint: `slide1.heading.belleayreMountain`. This makes diffs human-readable.
7. **Validate** — run the result through the Zod schemas from `slide-deck-spec`. Fail loudly on missing fields.

## EMU Conversion Constants

```ts
const EMU_PER_INCH = 914400;
const EMU_PER_PT = 12700;          // 914400 / 72
const HUNDREDTHS_PT_PER_PT = 100;  // <a:rPr sz="2400"> means 24pt
```

## Z-Order Rule

OOXML document order IS the rendering order: first child = farthest back. Renderers must paint by ascending `zOrder`. Never reorder shapes during extraction — preserve source order verbatim.

## Semantic-Spec Bootstrapping

The extractor produces render-IR with `semanticRef: null` everywhere. A separate manual or LLM pass attaches refs (`property.name`, `financials.irr`, etc.). Tag the source file with `metadata.sourceFileHash = sha256(pptxBytes)` so future re-imports can detect drift.

## What NOT to Extract

- Slide transitions / animations — out of scope for static decks.
- Embedded charts (`<c:chart>`) — they're separate XML parts; extract as a black-box image preview unless your renderer also handles OOXML chart trees.
- Speaker notes — optional; if needed, parse `notesSlides/notesSlideN.xml` and attach as `slide.notes`.

## Why Not PDF

- PDF has no concept of z-order; painters' algorithm only.
- Text is broken into glyph clusters with no run grouping — reconstructing "this is one bullet" is heuristic.
- No theme tokens; every color is baked.
- Images are often re-encoded/scaled, losing the original asset.
- If only a PDF exists, ask the designer for the source `.pptx`. If truly impossible, fall back to manual authoring of the semantic spec — do not pretend PDF parsing reproduces the source.
