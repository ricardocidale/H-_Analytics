---
name: deck-export
description: Export a rendered deck (HTML from deck-ir-render) to PDF, PNG, or PPTX. Use when producing investor decks, downloadable artifacts, or print-ready output. Defaults to Playwright headless Chromium for HTML→PDF; falls back to documented PPTX writer paths for round-trip. Pairs with deck-ir-render (input HTML) and slide-deck-spec (source of truth).
---

# Deck Export

Turn rendered deck HTML into shareable artifacts. The pipeline is deliberately small: HTML is the universal intermediate, exporters are thin shells.

## When to Use

- "Generate the investor PDF" — primary use.
- Slide thumbnails (PNG per slide) for previews and email.
- Round-trip back to PPTX for designer handoff.

## Pipeline

```
slide-deck-spec  ─►  deck-ir-render  ─►  HTML  ─►  deck-export  ─►  PDF / PNG / PPTX
```

The exporter never reads the spec directly. Everything it needs is in the rendered HTML.

## PDF Export (Primary Path)

Playwright headless Chromium. System Chromium on Linux/Replit is fine; do NOT bundle the Playwright browser download.

### Render-readiness signal

The HTML must set `window.__deckReady = true` after fonts load and images decode. The exporter waits on this — never on arbitrary timeouts.

```ts
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__deckReady === true, { timeout: 30_000 });
```

### Page sizing

Pass slide size in pt; do NOT rely on `format: 'Letter'`.

```ts
await page.pdf({
  width: `${slideSize.width}pt`,
  height: `${slideSize.height}pt`,
  printBackground: true,
  preferCSSPageSize: true,         // honor @page from deck-ir-render
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  path: outPath,
});
```

### Chromium flags

```ts
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,  // system chromium on Replit
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
```

`--font-render-hinting=none` produces consistent kerning across machines.

### Asset embedding

Have `deck-ir-render` resolve assets to `data:` URLs **before** serving HTML. Avoid network round-trips inside Chromium — they're the #1 cause of "blank PDF" bugs.

## PNG Export (Per-Slide)

```ts
const slides = await page.$$('.deck-slide');
for (const [i, el] of slides.entries()) {
  await el.screenshot({ path: `slide-${i + 1}.png`, omitBackground: false });
}
```

Use `deviceScaleFactor: 2` on `browser.newContext()` for retina-quality thumbnails.

## PPTX Export (Round-Trip)

Use `pptxgenjs`. The exporter walks the **render-IR** (not HTML) and emits one shape per element. This is the one exporter that reads the IR directly because PPTX is structural, not pixel.

| IR kind | pptxgenjs call |
|---|---|
| `textBox` | `slide.addText(runs, { x, y, w, h, ... })` (convert pt → inches: `÷ 72`) |
| `image` | `slide.addImage({ data: assetDataURL, x, y, w, h })` |
| `rect` | `slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill, line })` |
| `ellipse` | `slide.addShape(pptx.ShapeType.ellipse, ...)` |
| `line` | `slide.addShape(pptx.ShapeType.line, ...)` |
| `group` | flatten to absolute coords (pptxgenjs has limited group support) |

Set `pptx.layout = "CUSTOM"` and `pptx.defineLayout({ name: "DECK", width: slideSize.width / 72, height: slideSize.height / 72 })`.

## Common Failures

- **Blank or partial PDF** — `window.__deckReady` never fires. Check `document.fonts.ready` and image `complete` flags in the renderer.
- **Wrong page size** — `@page` in CSS not respected. Set `preferCSSPageSize: true` AND pass explicit `width/height` to `page.pdf()`.
- **Fonts wrong** — remote font load failed silently. Self-host or inline `@font-face` with `data:` woff2.
- **Images missing** — relative URLs against `file://`. Use absolute URLs or data URLs.
- **Slide breaks mid-content** — missing `page-break-after: always` on `.deck-slide`. Add via the renderer's print CSS.
- **Sandbox errors on Replit** — use `--no-sandbox` and point `executablePath` at system Chromium (`/nix/store/.../chromium`).

## Performance

- Reuse one browser across multiple exports (`browser.newPage()` per deck).
- For large decks (>20 slides), serve HTML from a localhost server, not `data:` URL — Chromium parses faster.
- Embed assets as data URLs but compress images first (sharp → webp at quality 85 is usually indistinguishable in PDF).

## Anti-Patterns

- **`waitUntil: 'networkidle'`** — flaky and slow; use `__deckReady` instead.
- **`page.waitForTimeout(N)`** — race condition waiting to happen.
- **Bundling Chromium** — bloats the artifact; use system binary.
- **Generating PPTX from HTML scraping** — go from render-IR directly; HTML loses structure.
- **One browser per slide** — startup cost dominates; one browser per export job.
