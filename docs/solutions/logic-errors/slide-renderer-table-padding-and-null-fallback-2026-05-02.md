---
title: Hybrid slide renderer — pad sparse tables and chain fallbacks on both null and throw
date: 2026-05-02
category: logic-errors
module: api-server/slides
problem_type: logic_error
component: tooling
symptoms:
  - "Slide 6 IS table rendered with header row of 5 'Yr N' columns but data rows had only the label cell when `financials.yearlyIS` / `yearlyCF` were empty or shorter than 5 — visually broken table, no crash"
  - "Slides 5 and 6 rendered as blank placeholder JPEGs whenever the slide background JPEG or recipe JSON was missing, even though a satori JSX fallback existed"
  - "JSX fallback was only invoked on thrown exceptions from `renderHybridSlide`, never when it returned `null`"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - hybrid-renderer
  - image-renderer
  - slot-resolver
tags:
  - slide-rendering
  - satori
  - sharp
  - fallback-chain
  - sparse-data
  - defensive-coding
---

# Hybrid slide renderer — pad sparse tables and chain fallbacks on both null and throw

## Problem

The H+ Analytics PPTX slide generator's hybrid renderer (sharp + satori, no headless browser) shipped two latent logic defects when Slides 5 and 6 were converted from full-JSX rendering to the recipe-driven hybrid path. Properties with sparse financial arrays produced a malformed Slide 6 income-statement table, and any property whose slide background or recipe was missing skipped the available JSX fallback and rendered as a blank placeholder.

## Symptoms

- Slide 6 IS table: header always showed 5 columns ("Yr 1"…"Yr 5") but data rows for properties with fewer than 5 years of `yearlyIS` / `yearlyCF` data rendered as a single label cell with no value cells — the row visually collapsed under the header.
- Slides 5 / 6 silently degraded to a blank placeholder JPEG when the recipe or background JPEG could not be loaded, even though a fully-rendered satori JSX version of each slide was available.
- No errors were logged for either failure mode — both produced "successful" PPTX output that was visibly broken.

## What Didn't Work

- **`.catch()` as the sole fallback hook** in `image-renderer.ts`. The chain `renderHybridSlide(...).catch(err => renderJsxToJpeg(...)).then(buf => buf ?? blank)` only invokes the JSX fallback when the hybrid render *throws*. `renderHybridSlide` returns `null` (not throws) when the background JPEG or recipe JSON is missing, so the `??` step jumped straight to the blank fallback and never tried JSX.
- **Header derived from header constants, rows derived from source arrays** in `buildSlide6IsTableJsx`. The header was hardcoded to 5 columns while rows were `years.map(...)` / `cf.slice(0, 5).map(...)`. With shape divergence between header and rows, sparse financials silently produced misaligned tables.
- *(Detour, abandoned)* Briefly attempted to fix the unrelated `check:magic-numbers` regressions by extracting render-specific font-size and color constants into `lib/shared/src/constants-slide-typography.ts`. Reverted because the constants are render-specific (they belong in the slides package) and another agent owns the magic-numbers gate fix.

## Solution

### A) Pad sparse rows to header column count — `artifacts/api-server/src/slides/hybrid-renderer.ts`

Before:

```ts
const years = financials.yearlyIS.slice(0, 5);
const cf = financials.yearlyCF.slice(0, 5);

const rows: Array<[string, string[], boolean]> = [
  ["Revenue",            years.map(y => fmtCurrency(y.revenueTotal)),           false],
  // ... data rows could be shorter than the 5-column header
];
const headerYears = years.length > 0
  ? years.map((_, i) => `Yr ${i + 1}`)
  : ["Yr 1", "Yr 2", "Yr 3", "Yr 4", "Yr 5"];
```

After:

```ts
const YEAR_COUNT = 5;
const years = financials.yearlyIS.slice(0, YEAR_COUNT);
const cf = financials.yearlyCF.slice(0, YEAR_COUNT);

const pad = (arr: string[]): string[] => {
  const out = arr.slice(0, YEAR_COUNT);
  while (out.length < YEAR_COUNT) out.push("—");
  return out;
};

const rows: Array<[string, string[], boolean]> = [
  ["Revenue",            pad(years.map(y => fmtCurrency(y.revenueTotal))),  false],
  ["Operating Expenses", pad(years.map(y => fmtCurrency(y.totalExpenses))), false],
  ["NOI",                pad(years.map(y => fmtCurrency(y.noi))),           true],
  // ... every row padded to YEAR_COUNT
];
const headerYears = Array.from({ length: YEAR_COUNT }, (_, i) => `Yr ${i + 1}`);
```

Header and rows are now both derived from the same `YEAR_COUNT` constant, and missing year cells render as an em-dash placeholder instead of vanishing.

### B) Chain fallbacks on both `null` and `throw` — `artifacts/api-server/src/slides/image-renderer.ts`

Before:

```ts
renderHybridSlide(5, payload, fonts).catch(err => {
  logger.warn(`[image-renderer] Slide 5 hybrid failed: ${err} — falling back to satori JSX`);
  return renderJsxToJpeg(React.createElement(Slide5, { p: payload }), fonts);
}).then(buf => buf ?? generateBlankSlideJpeg(5, payload.property.name)),
```

After:

```ts
renderHybridSlide(5, payload, fonts)
  .catch(err => {
    logger.warn(`[image-renderer] Slide 5 hybrid threw: ${err} — falling back to satori JSX`);
    return null;
  })
  .then(buf => buf ?? renderJsxToJpeg(React.createElement(Slide5, { p: payload }), fonts).catch(err => {
    logger.warn(`[image-renderer] Slide 5 satori fallback also failed: ${err} — using blank`);
    return generateBlankSlideJpeg(5, payload.property.name);
  })),
```

Same shape applied to Slide 6. Both failure signals (`null` return and thrown exception) now flow into the JSX fallback, and the blank placeholder is reached only when JSX itself also fails.

## Why This Works

- **Padding fix:** A table's header column count and its row column counts are a single contract. Driving both off the same `YEAR_COUNT` constant and forcing every row through `pad()` makes that contract structural rather than coincidental. "Missing data" becomes a visible em-dash instead of a vanished cell.
- **Fallback fix:** `.catch()` on a Promise only handles rejection, not a resolved-with-`null` value. The fix demotes the catch handler to a value normalizer (always resolve to `null` on failure), then uses the `??` step as the single decision point that picks the next tier in the fallback chain. Each tier is responsible for its own error normalization, so the chain composes regardless of how any individual tier fails.

## Prevention

- **Three-tier fallback chains (hybrid → JSX → blank, or any equivalent shape):** at every link, normalize *both* a thrown rejection and a returned `null` into the same "I couldn't produce output" signal before the next tier decides whether to take over. The pattern that works:
  ```ts
  primary().catch(() => null)
    .then(buf => buf ?? secondary().catch(() => fallbackValue))
  ```
  Anti-pattern: putting the secondary call inside the `.catch()` of the primary — it skips the secondary entirely on `null` returns.
- **Synthesized tables from variable-length source arrays:** derive the header column count from a single named constant (e.g. `YEAR_COUNT = 5`), and force every data row through a `pad(arr, n, placeholder)` helper before rendering. Never let the header and the rows compute their column count independently.
- **Distinguish "missing input" from "render error":** functions like `renderHybridSlide` should return `null` when prerequisites (background, recipe) are absent and throw only when rendering itself fails. Callers must then handle both signals — usually by collapsing them into the same fallback path as above.
- **Regression check:** when adding a new sparse-data property fixture, exercise it through Slides 5 and 6 end-to-end; visual misalignment is the only signal — there will be no exception.

## Related

- `docs/solutions/architecture-patterns/two-format-slide-deck-generation-2026-05-02.md` — canonical architecture reference for the H+ satori+sharp+pptxgenjs hybrid pipeline. This learning extends its per-slide `.catch(() => blank)` pattern into a three-tier hybrid → JSX → blank chain and adds sparse-array padding rules for synthesized tables.
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — adjacent pattern for defensive null-coalescing in async pipelines (different domain, same defensive principle).
- `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md` — adjacent pattern: try/catch swallowing failures while reporting success (this learning is the rendering-pipeline analogue).
