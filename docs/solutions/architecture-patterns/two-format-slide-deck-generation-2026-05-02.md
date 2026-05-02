---
title: "Two-format slide deck generation: editable PPTX + image-locked PPTX on Railway"
date: 2026-05-02
category: architecture-patterns
module: slides
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - "Generating presentation files server-side on a memory-constrained host (e.g. Railway)"
  - "Requiring both an editable deck for internal use and a pixel-perfect locked deck for external distribution"
  - "Puppeteer/Playwright/headless Chromium is too heavy for the deployment environment"
related_components:
  - database
  - background_job
  - tooling
tags:
  - slides
  - pptx
  - satori
  - sharp
  - pptxgenjs
  - image-rendering
  - railway
  - pre-generation
---

# Two-format slide deck generation: editable PPTX + image-locked PPTX on Railway

## Context

The LB (Lackey+Beckett) property investment platform needed investor-facing slide decks in
two forms with fundamentally different security properties:

- **Editable PPTX** — for internal deal teams who annotate, modify, or customize decks.
- **Image-locked PPTX** — for external distribution where slide content must be tamper-proof;
  investors cannot extract text, formulas, or modify any element.

Constraints that shaped the solution:
- Deployment is on Railway; Puppeteer/Playwright (~300MB Chromium binary) was ruled out as too
  heavy for the container. LibreOffice headless was not available in the environment.
- AI image generation (DALL-E / gpt-image-1) was evaluated and rejected: models hallucinate
  digits — categorically unsafe for investor decks where financial figures must be exact.
  (session history)
- Python-pptx template-filling (the original Track 1 approach) produced acceptable editable
  output, but could not produce a pixel-perfect image-locked format without a browser. (session history)
- `@resvg/resvg-js` (JSX → SVG → PNG) was the initial plan for Track 2; ultimately `sharp`
  was used instead because it was already installed in the api-server and produced equivalent
  JPEG output. (session history)

## Guidance

### Two-pipeline architecture with a format discriminator table

Maintain **one DB record per (entity, format) pair** using a composite primary key. Each
pipeline is independent end-to-end: different toolchain, different R2 key namespace, same
status lifecycle.

```sql
CREATE TABLE property_slide_deck_variants (
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('pptx', 'image')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'generating', 'ready', 'error')),
  r2_key TEXT,
  file_size_bytes INTEGER,
  generated_at TIMESTAMP,
  triggered_by TEXT,
  error_message TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, format)
);
```

Migration from a single-format table:

```sql
INSERT INTO property_slide_deck_variants
  SELECT id, 'pptx', status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, NOW()
  FROM property_slide_decks;
DROP TABLE property_slide_decks;
```

R2 key convention:

```
slides/pptx/property-${id}.pptx    -- Track 1: editable
slides/image/property-${id}.pptx   -- Track 2: image-locked
```

### Track 1: Python template-driven PPTX

`generate_property_slides.py` fills a canonical template PPTX (`attached_assets/L+B_Property_Slides_*.pptx`)
via python-pptx. Shapes are located by name; content is injected. 6 slides per property; slide 7
("The Ask") is always excluded.

Design constants (must match template exactly):
- Colors: `#1C2B1E` forest bg, `#257D41` accent green, `#7AAA88` sage, `#FFF9F5` cream, `#9FBCA4` muted
- Fonts: EB Garamond (headers), Poppins ExtraLight (body)

### Track 2: TypeScript image-locked PPTX (zero native dependencies)

The image-locked pipeline is a fully server-side TypeScript chain — no browser, no native
process:

```
Dedicated JSX components → satori (JSX→SVG) → sharp (SVG→JPEG) → pptxgenjs (JPEG→PPTX)
```

Each slide becomes one full-slide JPEG (1920×1080, quality=92) inserted as the sole element in
a PPTX slide. The output is visually identical to the editable version but contains no
selectable text or editable shapes.

#### Core render pipeline (`image-renderer.ts`)

```typescript
async function renderSlideToJpeg(element: React.ReactElement, fonts: FontCache): Promise<Buffer> {
  const svg = await satori(element, { width: 1920, height: 1080, fonts: fontDefs });
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

export async function renderImagePptx(payload: SlidePayload): Promise<Buffer> {
  const fonts = await getSlideFonts();
  const jpegBuffers = await Promise.all(
    slideComponents.map((el, i) =>
      renderSlideToJpeg(el, fonts).catch((err) =>
        generateBlankSlideJpeg(i + 1, payload.property.name)
      )
    )
  );
  return buildImagePptx(jpegBuffers, payload.property.name);
}
```

Per-slide errors fall back to a blank placeholder slide rather than failing the entire deck.

#### Font loading (`fonts.ts`)

```typescript
export async function getSlideFonts(): Promise<FontCache> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = loadFonts().then(c => { cache = c; return c; });
  return loadPromise;
}
```

Fonts (EB Garamond, Poppins, Roboto) are fetched from Google Fonts CDN at module scope,
singleton-cached, shared across concurrent renders. Empty `ArrayBuffer` is returned on
failure — satori skips unavailable font weights rather than throwing.

#### JSX component constraints (`slide-jsx.tsx`)

```typescript
const C = { bg: "#1C2B1E", accent: "#257D41", sage: "#7AAA88", cream: "#FFF9F5", muted: "#9FBCA4" };
const W = 1920, H = 1080;

// ALLOWED: flexbox, inline styles, absolute positioning
// FORBIDDEN: CSS grid, CSS variables (var(--x)), @font-face declarations
```

Satori supports a restricted CSS subset. All styles must be inline; no Tailwind, no
stylesheet imports, no CSS variables. This is why Track 2 uses **dedicated server-side JSX
components** (`api-server/src/slides/`) rather than reusing the browser-optimized Tailwind
components in the property-slides app.

#### PPTX layout

```
Layout name: WIDE169
Dimensions: 13.33 × 7.50 inches (standard 16:9)
Each slide: one full-bleed image element, no other shapes
```

### Boot pre-generation

Both formats are generated eagerly at server startup to eliminate first-request latency:

```typescript
// index.ts — fires after migrations complete
setImmediate(() => {
  preGenerateAllSlides().catch(err =>
    logger.error(`Pre-generation failed: ${err}`, "slides")
  );
});

// property-slides.ts
const CONCURRENCY = 2;
export async function preGenerateAllSlides(): Promise<void> {
  const properties = await storage.getAllProperties();
  for (let i = 0; i < properties.length; i += CONCURRENCY) {
    const batch = properties.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(p => generateBoth(p.id, "boot")));
  }
}
```

Concurrency is capped at 2 to avoid memory pressure from concurrent satori/sharp invocations
during startup.

## Why This Matters

- **Security**: Image-locked slides prevent external investors from extracting underlying data.
  Tamper-proof distribution is a hard business requirement.
- **Workflow**: Deal teams retain editable decks for annotation without a separate manual step.
- **Reliability**: Pre-generation means download latency is predictable (R2 read) rather than
  variable (on-demand generation). Per-slide fallback prevents one bad slide from blocking the
  entire deck.
- **Zero native dependency**: Avoids Puppeteer/Chromium (~300MB container overhead, browser
  lifecycle complexity). The entire Track 2 pipeline runs in the Node.js process.

## When to Apply

Apply when:
1. The same artifact must be distributed in both a mutable form (internal) and an immutable
   form (external distribution).
2. The mutable and immutable toolchains are fundamentally different (template-driven vs.
   image-rasterized).
3. Pre-generation is acceptable — content changes infrequently enough to invalidate and
   regenerate on write rather than generate on read.

Do **not** apply when:
- Content is highly dynamic per-request (personalized per viewer) — the pre-generation
  assumption breaks down.
- Both formats can be produced by the same tool with a permission flag — a single pipeline
  with a format parameter suffices instead.

## Examples

**Serving the correct variant by format query param**:

```typescript
// GET /api/properties/:id/slides?format=image
const format = req.query.format === "image" ? "image" : "pptx";
const variant = await storage.getSlideVariant(propertyId, format);
if (variant?.status !== "ready") return res.status(202).json({ status: variant?.status ?? "idle" });
const signedUrl = await r2.getSignedUrl(variant.r2_key);
return res.redirect(signedUrl);
```

**Invalidating both variants on property update**:

```typescript
await db.update(propertySlideDecks)
  .set({ status: "idle", r2Key: null })
  .where(eq(propertySlideDecks.propertyId, propertyId));
setImmediate(() => generateBoth(propertyId, "property-update"));
```

## Related

- `docs/solutions/design-patterns/slide-decks-tab-dual-format-migration-2026-05-02.md` —
  frontend `SlideDecksTab` migration for dual-format (status map keying, dual download buttons)
- `artifacts/api-server/src/slides/` — `slide-jsx.tsx`, `fonts.ts`, `image-renderer.ts`
- `artifacts/api-server/src/routes/property-slides.ts` — generation routes and pre-generation export
- `lib/db/src/schema/property-slide-decks.ts` — Drizzle schema for `property_slide_deck_variants`
- `.agents/skills/hplus-slide-mapping/SKILL.md` — shape mapping authoritative reference for Track 1
