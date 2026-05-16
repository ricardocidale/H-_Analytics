---
title: "Factory v2 PPTX substitution: pptx-automizer is the chosen library"
date: 2026-05-11
last_updated: 2026-05-16
category: architecture-patterns
module: slides
problem_type: decision_record
component: service_object
severity: medium
status: authoritative
applies_when:
  - "Building the Factory v2 PPTX render pipeline (U4 and downstream)"
  - "Choosing a PPTX manipulation library for the slide factory"
  - "Adding a new slide variant that substitutes into a canonical template"
tags:
  - slides
  - pptx
  - factory-v2
  - substitution
  - pptx-automizer
  - decision-record
---

# Factory v2 PPTX substitution: pptx-automizer is the chosen library

## What this doc is

The U1 decision record for [Factory v2](../../plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md). It names the library Factory v2 will use to substitute property-specific data into the v7 reconstruction-package PPTX, the rationale, and the constraints discovered while validating the choice with a spike.

This decision unblocks U4 (PPTX template fetch + substitution engine) and downstream Phase B/C work.

## Decision

**Chosen:** [`pptx-automizer`](https://github.com/singerla/pptx-automizer) v0.8.1 (MIT, TypeScript-native, Node-only).

Installed in both `artifacts/api-server` (where Marco's per-slide Builders run) and `scripts` (where the U1 spike lives and where future ops scripts may run substitutions for diagnostic purposes).

**Rejected:**
- **Claude for PowerPoint (Microsoft Office add-in).** User-interactive add-in inside the PowerPoint app; not headless, not Railway-compatible. Wrong shape for a server pipeline.
- **Claude API Agent Skills (`pptx` skill).** Programmatic and Railway-compatible, but LLM-mediated — every substitution costs tokens, adds latency, and is non-deterministic. Factory v2's substitution layer must be deterministic because Lucca already does the AI judgment upstream (best-shot narrative draft) and Maya/Dino verify pixel fidelity downstream. An LLM in the middle layer turns a deterministic spine into a coin flip.
- **Raw `unzip + fast-xml-parser`.** The original fallback. Workable but reinvents the relation-tracking, slide-master, and media-relation logic `pptx-automizer` already implements. Reserved for the slide-6 image-embed path if `pptx-automizer`'s image surface proves insufficient in U4 (see "Constraints discovered" below).

## Why pptx-automizer over the alternatives

| Criterion | pptx-automizer | Claude PPT Agent Skill | Raw unzip + XML |
|---|---|---|---|
| Deterministic | ✅ | ❌ (LLM in the loop) | ✅ |
| Token cost per substitution | none | $0.01–0.10/slot | none |
| Railway-compatible (Node, no browser, no native deps) | ✅ | ✅ | ✅ |
| TypeScript types | ✅ first-party | partial | none |
| Preserves template typography, masters, layouts | ✅ | ✅ | manual |
| Maintained / active | ✅ (active 2024–) | ✅ | n/a (own code) |
| License | MIT | Anthropic ToS | n/a |
| Bundle size impact | ~150 KB | API client only | minimal |

The deterministic-substitution requirement is the load-bearing one. The plan's R3 (PPTX-as-truth: substitution writes property-specific data into a copy of the template) and R7 (aesthetic guardrails: typography hierarchy preserved, overflow handled by tightening/wrapping/abbreviation) both demand deterministic behavior. An LLM-mediated substitution layer would also defeat Maya/Dino's pixel-diff pass — small token-sampling variance would produce drift the pixel-diff would flag, even when the input data is identical.

## Spike findings

The U1 spike at `scripts/src/pptx-substitution-spike.ts` (throwaway; **deleted in U4** as planned — the production module `artifacts/api-server/src/slides/pptx-substitution.ts` supersedes it) exercised three things end-to-end against the L+B canonical PPTX:

1. **Load + enumerate.** `Automizer.loadRoot(...).load(...)` plus `getTemplate('src').setCreationIds()` discover all 6 slides and all shapes on each. Slide 2 has 59 shapes — names like `Text 3`, `Image 7`, `Picture 35`.
2. **Text-shape overwrite.** `slide.modifyElement('Text 3', [modify.setText(newContent)])` overwrites a slot text. Works cleanly. Output PPTX has 189 archive entries (vs. ~190 input entries — the cleanup-step diff).
3. **Round-trip parse.** The output PPTX re-loads through `Automizer` without throwing. OOXML is well-formed.

Both happy-path (short replacement) and overflow edge case (66-char replacement into a placeholder-length slot) succeed. The overflow case produces a valid PPTX; how PowerPoint and LibreOffice *render* the overflow visually is a U2/U7 (LibreOffice headless verification) and U6 (visual-inspection) concern.

## Constraints discovered

Three things the spike surfaced that U4 must handle:

1. **`cleanup: true` is unsafe on our canonical PPTX.** Triggers a content-tracker walk in `pptx-automizer` that hits a relation-map bug (`Cannot read properties of undefined (reading 'filename')` in `content-tracker.ts:283`). The output is still valid without cleanup — leave `cleanup: false` in production until upstream fixes the bug or we prove the v7 reconstruction package PPTX has cleaner relations.
2. **Use `modify.setText`, not `modify.replaceText`, for slot writes.** The intra-shape find/replace path (`replaceText`) trips a different content-tracker code path on this template. `setText` (full-shape overwrite) is what we want anyway — Lucca emits final slot text and Marco/Builders overwrite shapes wholesale; we never need to find/replace *within* an existing string.
3. **Image-swap surface is fragile.** `ModifyImageHelper.setRelationTarget(...)` plus `loadMedia(...)` fails with a relation-tracking error on the canonical Belleayre PPTX's picture shapes. The v7 reconstruction package's per-shape bbox manifest (deferred to U4 per the plan's "Deferred to Implementation" section) should give us cleaner relations to target. If the v7 PPTX's picture shapes are still problematic, slide-6's image-embed path (R6 — `format-generators/*` PNG embedded in a PPTX picture shape) becomes the fallback worth proving early.
4. **`setTableData` is a destructive full-replace — never call it once per cell.** Internally, `setTableData` calls `sliceRows(n)` and `sliceCols(m)` which physically trim the table XML to exactly `data.body.length` rows and `data.body[0].values.length` cols. Calling it once per `table_cell` entry (each with a 1-row body) causes `sliceRows(1)` to destroy all other rows on the first call, leaving a `1 rows x 1 cols` table with only the first cell intact and no error thrown. Fix: collect all `table_cell` entries for a given shape, then call `setTableData` exactly once with the full `(maxRow+1) x (maxCol+1)` body matrix. See `docs/solutions/logic-errors/pptx-automizer-table-cell-batching-1x1-corruption-2026-05-16.md` for the full root cause analysis and code fix.

## Bundle / externals impact

`pptx-automizer` is pure JS (xmldom + jszip + a tiny PptxGenJS wrap). No native modules. Safe to bundle in api-server's esbuild output. **Not added to `artifacts/api-server/build.mjs` externals.** Bundle delta measured: small (~150 KB compressed; the heavy weight is xmldom which we already ship transitively via other deps).

`pptxgenjs` is already externalized in api-server's build (existing convention). Since pptx-automizer wraps PptxGenJS for the "create-from-scratch" path, leaving `pptxgenjs` external keeps that surface working.

## How U4 should use this

U4 — the production substitution engine — should:

- Read the v7 reconstruction package PPTX from R2 once at boot (or cache in `/tmp/factory-v2-template/`).
- Derive the slot→shape mapping from the v7 package's per-slide manifest (deferred-implementation per the plan), not from `setCreationIds()` walks at runtime. `setCreationIds()` is fine for diagnostics; the mapping should be static-known at build time.
- Use the slot mapping shape `{ slideNumber: number, shapeName: string, contentType: 'text' | 'image' | 'table' }` — keyed by Lucca's slot IDs, not by PPTX shape names directly. The shape-name layer is a private implementation detail of the renderer.
- Always set `cleanup: false` until the upstream bug is resolved.
- Always use `modify.setText` for text slot overwrites.
- Prove image-swap on the actual v7 PPTX before committing to it for slide-6. If it doesn't work, fall back to embedding the report-exporter PNG via a fresh `pptx-automizer` `generate()` call (PptxGenJS-wrapped) rather than overwriting an existing picture shape's relation.

## Pattern to follow (skeleton)

```ts
import pptxAutomizer from 'pptx-automizer';
const Automizer = (pptxAutomizer as any).default ?? pptxAutomizer;
const { modify } = pptxAutomizer as any;

export async function substituteSlots(
  templatePath: string,
  outputPath: string,
  substitutions: { slideNumber: number; shapeName: string; text: string }[],
): Promise<Buffer> {
  const automizer = new Automizer({
    templateDir: path.dirname(templatePath),
    outputDir: path.dirname(outputPath),
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    cleanup: false,
  });

  const pres = automizer
    .loadRoot(path.basename(templatePath))
    .load(path.basename(templatePath), 'src');

  // Group substitutions by slide so each slide is only addSlide'd once.
  const bySlide = new Map<number, typeof substitutions>();
  for (const s of substitutions) {
    if (!bySlide.has(s.slideNumber)) bySlide.set(s.slideNumber, []);
    bySlide.get(s.slideNumber)!.push(s);
  }

  for (const [slideNumber, slots] of bySlide) {
    pres.addSlide('src', slideNumber, (slide) => {
      for (const slot of slots) {
        slide.modifyElement(slot.shapeName, [modify.setText(slot.text)]);
      }
    });
  }

  await pres.write(path.basename(outputPath));
  return fs.readFileSync(outputPath);
}
```

## What this supersedes / interacts with

- **Does not supersede** [`slide-deck-generation-decision-reversal-2026-05-03.md`](./slide-deck-generation-decision-reversal-2026-05-03.md) by itself — U13 in the Factory v2 plan will land that supersession with the full rollout. This doc only records the *library* choice for the new pipeline.
- **Does interact with** [`api-server-bundle-size-externalize-heavy-deps-2026-05-02.md`](../performance-issues/api-server-bundle-size-externalize-heavy-deps-2026-05-02.md): we deliberately did *not* externalize `pptx-automizer`. If post-U4 bundle measurements show the api-server bundle crossing the 8 MB threshold, revisit and add it to `build.mjs` externals.

## References

- Plan: `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md` (U1)
- Spike: `scripts/src/pptx-substitution-spike.ts` (throwaway; deleted in U4 — production module is `artifacts/api-server/src/slides/pptx-substitution.ts`)
- Library: https://github.com/singerla/pptx-automizer (MIT, v0.8.1)
- Existing factory-runs schema decision: [`slide-factory-runs-schema-design-2026-05-07.md`](./slide-factory-runs-schema-design-2026-05-07.md)
