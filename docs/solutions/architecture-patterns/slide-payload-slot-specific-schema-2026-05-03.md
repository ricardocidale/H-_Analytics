---
title: "Slide payloads must model per-slot semantics, not a generic property+vision bag"
date: 2026-05-03
category: architecture-patterns
module: api-server/slides + hospitality-business-portal/internal-deck
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "A canonical/recipe-driven slide deck (PDF/PPTX) defines per-shape text slots with strict size, font, color, and word-count expectations"
  - "The slide generator is fed by a single `SlidePayload`/`VisionText` shape that is reused across every slide"
  - "Generated slides exhibit text overflow, content drift from the recipe, or generic placeholder copy where the recipe expects slot-specific copy"
  - "A property field (e.g. `description`) does double duty as marketing paragraph AND as a slide subtitle"
related_components:
  - tooling
  - frontend_stimulus
  - documentation
tags:
  - slide-rendering
  - schema-design
  - slot-modeling
  - canonical-recipe
  - lb-slides
  - payload-shape
---

# Slide payloads must model per-slot semantics, not a generic property+vision bag

## Context

The L+B per-property 6-slide investor deck is generated from a canonical recipe
(per-slide text files in `attached_assets/Pasted-SLIDE-N-…txt` plus
`slide_analysis_agent_report.precise_*.json`). The recipe specifies, for every
shape on every slide, the bounding box, font, font size, color hex, and
expected text length — frequently as short as one italic phrase ("Former 1920s
Estate of Amelita Galli-Curci", ~5 words).

The current generator (`artifacts/hospitality-business-portal/src/features/internal-deck/slides.tsx`,
fed by `artifacts/api-server/src/slides/types.ts → SlidePayload`) uses ONE
generic payload shape per property:

- `SlideProperty` (CRM-shaped: id, name, city, state, county, purchasePrice, roomCount, businessModel, hospitalityType, qualityTier, **`description`**, acquisitionStatus, …)
- `VisionText` (a 19-field bag: `cinematicCaption`, `visionHeadline`, `visionBullet1`, `visionBullet2`, `descriptionParagraph`, `investmentModelConcept`, `marketRationale`, `reason1Label/Detail`, `reason2Label/Detail`, `reason3Label/Detail`, `closingLine`, `transformationDescription`, `operationalModelText`, `revenueBullet`, `programmingBullet`, `operationalParagraph`, …)
- `SlideFinancials` (yearlyIS/yearlyCF/loan/IRR/etc.)

Every slide component (`Slide1`..`Slide6`) reads from the same payload and
hand-picks fields per slot. Because the schema does not encode per-slot
semantics — slot length, slot purpose, slot scope (per-property vs portfolio)
— each slide makes its own ad-hoc binding decisions, and those decisions drift
from the recipe.

The diagnosis was triggered when a generated Lakeview Haven Lodge Slide 1 PDF
was diffed against the canonical "Sul Monte / Belleayre Mountain" Slide 1 PDF
and the precise JSON span list. Every slot diverged in the same shape: the
recipe expected short, slot-specific copy; the code injected long, generic copy
from the wrong field of the generic payload.

## Guidance

When a slide's canonical recipe specifies per-shape text expectations, the
slide payload must encode those expectations as **per-slide, per-slot fields**
— not a flat property+vision bag picked over by each slide component.

Adopt a `DeckPayloadV2` shape keyed by `slideId`, where each slide's slice
declares exactly the slots it needs, with role names that match the recipe:

```ts
// CORRECT — per-slot, per-slide schema
type DeckPayloadV2 = {
  slide1: {
    kind: "per-property";
    headerTitle: string;          // "Pipeline Spotlight: <Name>, <State>"
    headerSubtitle: string;       // editorial — "Active acquisition target — <Region>"
    titleName: string;            // mixed-case, NOT uppercased
    titleSubtitle: string;        // SHORT italic phrase (≤ ~80 chars), NOT property.description
    askingPrice: { headline: string; targetAcquisition?: string };
    propertySpecs: string[];      // exactly 6 building-fact lines (acres, sqft, BR/BA, amenity, ADU, price)
    visionBullets: string[];      // exactly 3 strategic-vision bullets (NOT financial summaries)
    closingTagline?: { lead: string; tail: string }; // two-color italic at ~y518
    photos: {
      hero:      { src: string; caption: string }; // caption describes the SUBJECT, not slot
      secondary: { src: string; caption: string };
      inset:     { src: string; caption: string };
    };
  };
  slide2: { kind: "per-property"; /* same shape, different photo roles */ };
  slide3: { kind: "portfolio";    /* Cartagena strategy — global */ };
  slide4: { kind: "portfolio";    /* 2×3 pipeline grid of all properties */ };
  slide5: { kind: "per-property"; transformationRows: ImprovementRow[]; stableYear: StableYearTable; financingSummary: FinancingTable };
  slide6: { kind: "per-property"; proforma: ProformaTable };
};
```

Validate the payload with a Zod schema that enforces lengths (`.max(80)` on
`titleSubtitle`, `.length(6)` on `propertySpecs`, `.length(3)` on
`visionBullets`) — this is the bridge between the recipe's word-count
expectations and the runtime data.

Anti-pattern to avoid:

```ts
// WRONG — generic bag, picked over per slide
interface SlidePayload {
  property: SlideProperty;     // .description = a long marketing paragraph
  visionText: VisionText;      // 19 fields, none of which match the recipe's slot names
  financials: SlideFinancials;
  photos: SlidePhoto[];        // sortOrder/isHero only — no role tag
}
// Each Slide N picks fields ad-hoc:
//   <span>{property.description}</span>  // ← overflows the title-subtitle slot
//   specs = [`${roomCount} keys`, type, region, status]  // ← CRM facts, not building facts
//   visionBullets = [revenueBullet, programmingBullet, ...]  // ← financial copy, not vision
```

## Why This Matters

The recipe gives per-shape constraints for a reason: shapes are sized for
specific copy lengths. A 4-line marketing paragraph stuffed into a one-line
italic descriptor slot doesn't just "look bad" — it pushes the title card,
specs card, vision card, and inset photo apart and breaks the entire layout.
Likewise, a "Property Specs" card that lists CRM facts (key count, business
model, region, status) instead of building facts (acres, sqft, BR/BA, pool,
ADU, price) communicates the wrong story to investors — the slot was designed
to act as a property fact-sheet, not a CRM record summary.

The generic payload is also why the current pipeline cannot express:

- **Per-property vs portfolio scope.** Slides 3 and 4 are portfolio strategy
  slides; the schema has no way to say "this slide is the same for every
  property's deck."
- **Multi-instance templates.** Slides 1 and 2 share the same template but
  show different content (whether two photo-sets of the same property, or two
  different pipeline properties). The schema can't distinguish them.
- **Slot-role photos.** `SlidePhoto` only carries `isHero` + `sortOrder`. The
  recipe defines distinct roles (hero / secondary / amenity / background /
  pipeline-card-thumb) with different aspect ratios and captions.
- **Editorial header copy** like "Active acquisition target — Western
  Catskills" vs the system-derived "Pipeline — Huntsville, Utah". The schema
  has no editorial-prefix field, so the code falls back to enum jargon
  (`statusLabel(acquisitionStatus)`).

Without per-slot modeling, every drift becomes invisible at the type level: TS
is happy with `String` in any slot, so the compiler never tells you the slot
is being abused. The drift only surfaces when a human eyeballs a generated
PDF against the recipe.

## When to Apply

- Any time a deck/document/report generator is fed by a **recipe that
  specifies per-shape constraints** (PPTX shape XML, Figma frames, PDF span
  bboxes, design-token-bound layouts).
- Any time a slot in a rendered output has a **fixed expected length or
  voice** different from the source field's expected length or voice (the
  classic case: long marketing `description` reused as a short sub-headline).
- Any time a generator must **mix per-instance and global slides** in the
  same artifact (per-property + portfolio strategy + portfolio pipeline grid).
- Any time photo slots have **roles** beyond `isHero` (aspect ratio,
  caption-from-subject, slot-specific cropping).
- Any time the recipe is the source of truth for **what should appear**, not
  just where it should appear.

## Examples

### Diff that exposed the pattern (Slide 1, Lakeview Haven Lodge)

| Slot | Recipe / canonical | Generated (wrong) | Source field bound |
|---|---|---|---|
| Header subtitle | "Active acquisition target — Western Catskills, Delaware County" *(editorial)* | "Pipeline — Huntsville, Utah" *(enum jargon)* | `statusLabel(acquisitionStatus) + regionLine` |
| Title | "Sul Monte" *(mixed case 21pt green)* | "LAKEVIEW HAVEN LODGE" *(uppercased)* | `property.name.toUpperCase()` |
| Title subtitle | "Former 1920s Estate of Amelita Galli-Curci" *(≤ 1 italic line)* | 4-line marketing paragraph that overflows the title card | `property.description` |
| ASKING PRICE | label + "$3.25M" + "Target Acquisition: $2.3M" *(3 lines)* | label + "$3.8M" *(no target)* | `fmtCurrency(purchasePrice)` only — no target field exists |
| Property Specs | 6 building-fact lines (acres / sqft / BR-BA / pool / ADU / price) | 4 CRM-fact lines (keys / type · tier / region / status — model) | hand-built from CRM enums |
| The Vision | 3 strategic bullets (post-purchase expansion, year-round demand, anchored programming) | 3 financial bullets (RevPAR, basis, demand drivers) | `visionText.{visionBullet1,visionBullet2,programmingBullet}` |
| Closing tagline | "A historic estate with a proven cultural legacy — positioned at the intersection of nature, heritage, and year-round demand." | *missing entirely* | no field exists |
| Hero caption | "SUL MONTE · 1926 STONE-AND-TIMBER CHATEAU" *(describes subject)* | "LAKEVIEW HAVEN LODGE · BOUTIQUE HOTEL" *(repeats type)* | `${name} · ${type}` |
| Secondary caption | "HEATED SALT-WATER POOL · 61+ PRIVATE ACRES" *(describes subject)* | "CURATED GUEST EXPERIENCE" *(generic placeholder)* | hardcoded literal |

Every row is the same failure mode: a generic field forced into a slot it
wasn't designed for.

### Migration sketch

1. Define the `DeckPayloadV2` Zod schema in `lib/shared` (mirrored to api-server + portal per the `shared-mirror-sync` skill).
2. Build a server-side `composeDeckPayloadV2(propertyId)` that maps property + portfolio + financials data into the v2 shape, honoring length constraints (truncate/expand sources, derive editorial strings, choose photo roles).
3. Rewrite each `Slide N` component to take its own slice (`Slide1Payload`) instead of the generic `SlidePayload`. The component reads slot fields by role name; no `property.description` reach-throughs.
4. Add a registry (`slideRegistry`) that declares for each slide: `kind` (per-property | portfolio), `requiredPhotoSlots`, `requiredNarrativeFields`, `requiredFinancialFields`. Drives validation and the "Rebuild deck" cache pipeline.
5. Replace the per-slide "Regenerate (Analyst)" button with a single "Rebuild deck" action that invalidates the deck cache and re-runs the v2 pipeline end-to-end.

## Related

- `docs/solutions/architecture-patterns/two-format-slide-deck-generation-2026-05-02.md` — orthogonal: covers the editable-vs-image-locked PPTX architecture, not the payload-slot mismatch.
- `docs/solutions/logic-errors/slide-renderer-table-padding-and-null-fallback-2026-05-02.md` — orthogonal: renderer-internals defensive coding (sparse tables, JSX fallback).
- `docs/solutions/design-patterns/slide-decks-tab-dual-format-migration-2026-05-02.md` — orthogonal: admin-UI download state migration.
- Recipe assets: `attached_assets/Pasted-SLIDE-{1..6}-…txt`, `slide_analysis_agent_report.precise_1777824741855.json`, `L+B_Property_6-Slide_Cannonical_1777775653617.pdf`, `belleayre-mountain-slides_1777774635693.pptx`.
- Generated diff source: `attached_assets/lakeview-haven-lodge-slide-1_(1)_1777845758180.pdf`.
- Code: `artifacts/hospitality-business-portal/src/features/internal-deck/slides.tsx`, `…/types.ts`, `artifacts/api-server/src/slides/types.ts`.
