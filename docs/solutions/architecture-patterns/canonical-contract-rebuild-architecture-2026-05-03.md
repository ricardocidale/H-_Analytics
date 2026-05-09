---
title: "Canonical-contract rebuild: a four-layer architecture for fixed-design deck rendering"
date: 2026-05-03
last_updated: 2026-05-06
category: architecture-patterns
module: internal-deck
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "A designer hands over a strict canonical design contract (JSON spec + per-shape bbox/font/color/character-count + self-validation checklist)"
  - "Generated output must be a faithful derivative of a canonical artifact, not a responsive interpretation"
  - "Per-slot recipes are heterogeneous — a slot's expected length, voice, and field shape differ across slots"
  - "The current renderer is a generic-bag pipeline that silently flattens slot-specific recipes into ad-hoc bindings"
  - "Regression risk is high enough that a build-time validation gate is justified"
related_components:
  - documentation
  - testing_framework
tags:
  - canonical-contract
  - slide-rendering
  - lb-slides
  - absolute-positioning
  - payload-schema
  - self-validation
---

# Canonical-contract rebuild: a four-layer architecture for fixed-design deck rendering

> **Update (2026-05-06):** This four-layer deterministic-render core is now wrapped (not replaced) by an agent-native overlay — see [Agent-Native Precision Pipeline Pattern](./agent-native-precision-pipeline-pattern-2026-05-06.md). The overlay adds the Lorenzo ingestion team (canonical extraction), per-slide specialist teams (Sofia / Bianca / Chiara / Dario / Elisa / Felix), a hybrid Inspector (deterministic Pass 1 + LLM-vision Pass 2 via Maya), Drafter + admin vetting UX (Lucca), and 10 hallucination defenses. Marco orchestrates. The four layers below remain the foundation; the overlay treats the canonical contract as the bicameral validation target for its Inspectors.

## Context

A designer delivered a four-document canonical contract for the L+B 6-slide investor deck (saved in `docs/slide-system/canonical/`):

- **`design-contract.json`** — the single source of truth: `design_theme` (palette, typography, canvas, shape_language), `generation_contract` (priority order, required/forbidden behavior, overflow rules, QC checklist), `variable_content_schema` (per-slide-type field shapes), and per-slide `text_elements` + `visual_elements` with `bbox=[x1,y1,x2,y2]`, font, approx_size, color, and **character counts** for every slot.
- **`coding-agent-instructions.md`** — rendering model: absolute positioning ONLY, 960×540 canvas, derive `{left,top,width,height}` from bbox, strict palette, Georgia + Poppins ExtraLight typography, manual cards (no UI components), background per slide, overflow rule (wrap → font-reduce → tighten line-height → expand box LAST), no `######` in financials.
- **`self-validation-checklist.md`** — a 10-point checklist the renderer must pass before output (positioning, structure, color, typography, image treatment, manual cards, financial readability, footer, forbidden elements, "does this look like the SAME deck?").
- **`agent-prompt-instructions.txt`** — high-level reinforcement that the JSON is the design contract.

The current implementation in `artifacts/hospitality-business-portal/src/features/internal-deck/` ignores all of this. `types.ts` defines a generic `SlidePayload { property, photos, financials, siblings, visionText, improvements }` that all six slides share, and `slides.tsx` (689 lines) hand-picks fields per slot. Generated output for a "San Diego" property had ~14 of 24 mapped slots wrong on Slide 1: title force-uppercased ("SAN DIEGO" vs the canonical mixed-case "Sul Monte" 21pt Poppins ExtraLight), the title-subtitle slot (bbox `[429, 84, 603.5, 97.8]`, Poppins ExtraLight Italic 8.6pt, 42 characters in canon) was stuffed with a ~600-char paragraph from `property.description`, the Property Specs card listed CRM enums ("20 boutique keys planned", "Boutique Hotel · upscale tier", "Pipeline — hotel structure") instead of the canonical building facts (`61+ Private Acres`, `1926 Stone-and-Timber Chateau (8,200+ sq ft)`, `8 Bedrooms, 7 Full Baths`), Vision bullets were a financial recap ($240 ADR, 72% occupancy) instead of the canonical strategic vision ("Post-Purchase Expansion: 20 Keys | 30–50 Guests", "Year-Round Demand: Skiing, Hiking, Cultural Calendar", "Anchored Programming: Curated Retreats & Community Off-sites"), the closing two-color italic tagline at `y≈518` was missing entirely, and a verbose "L+B Analytics · Investor Briefing / Page 1" footer band was invented out of nothing. Slide 2 had a *different layout entirely* — a single-column dark-green panel with a financial summary table — when the contract specifies the same 2-column hero+specs+vision template as Slide 1.

This doc captures the four-layer architecture that prevents that class of failure when a strict canonical contract is in play.

## Guidance

A canonical-contract rebuild has four layers. The contract is the spine; each layer is a faithful reflection of one slice of the contract.

### Layer 1 — SCHEMA (per-slot payload types mirror `variable_content_schema`)

Reject the temptation of a single `SlidePayload` "bag." Each slide's payload type declares exactly the slots it needs, with field names that match the contract's roles (`property_name_at_slide_title`, `property_subtitle`, `property_specs`, `vision_bullets`, `footer_tagline`, etc.) and Zod constraints that encode the contract's character counts.

```ts
// shared/slides/payload-v2.ts
export type Slide1Payload = {
  kind: "per-property";
  headerTitle: string;          // ≤ 60 chars; "Pipeline Spotlight: <Name>, <State>"
  headerSubtitle: string;       // ≤ 70 chars; editorial — NOT enum jargon
  propertyName: string;         // mixed-case (NOT uppercased); 21pt Poppins ExtraLight
  propertySubtitle: string;     // ≤ 80 chars italic descriptor; canon = 42 chars
  askingPrice: { headline: string; targetAcquisition?: string };
  propertySpecs: [string, string, string, string, string, string]; // 6 building facts
  visionBullets: [string, string, string];                          // 3 strategic
  closingTagline?: { lead: string; tail: string };                  // two-color split
  photos: {
    hero:      { src: string; caption: string }; // caption describes SUBJECT
    secondary: { src: string; caption: string };
    inset:     { src: string; caption: string };
  };
};

export type DeckPayloadV2 = {
  slide1: Slide1Payload;
  slide2: Slide2Payload;     // structural clone of Slide1Payload
  slide3: Slide3Payload;     // expansion concept
  slide4: Slide4Payload;     // 6-card pipeline grid
  slide5: Slide5Payload;     // transformation + metrics (sage bg)
  slide6: Slide6Payload;     // pro-forma table (sage bg)
};
```

The contract's `variable_content_schema.slide_1_or_2_property_spotlight_fields`, `slide_3_expansion_fields`, etc., maps 1:1 to these types. The Zod validator enforces `.length(6)` on `propertySpecs`, `.length(3)` on `visionBullets`, `.max(80)` on `propertySubtitle` — making slot drift a *type/runtime* error instead of a *visual* error.

(See the precursor doc, `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md`, for the narrower argument against the generic-bag schema.)

### Layer 2 — THEME (tokens derived strictly from `design_theme`)

Build a single `theme.ts` whose constants are read directly from `design_theme.palette`, `design_theme.typography`, `design_theme.canvas`, `design_theme.shape_language`. No app-theme colors, no Tailwind/shadcn defaults, no design-system tokens from elsewhere.

```ts
export const PALETTE = {
  deepGreen:      "#257D41",
  forestGreen:    "#15331F",
  sage:           "#9FBCAD",
  paleSage:       "#AFC7B9",
  offWhite:       "#FFF9F5",  // canvas background (slides 1–4)
  creamCard:      "#FFFBF7",  // card fill (different layer from canvas)
  mutedGrayGreen: "#9FB0A4",
  white:          "#FFFFFF",
  captionOverlay: "rgba(21,39,28,0.70)",
  fineRule:       "#D8D7D2",  // stroke-only; the 10th color
} as const;
```

**Two contract reconciliations to flag in code comments:**

1. The coding-agent doc lists 9 colors, but the JSON `design_theme.palette` plus the card-stroke spec (`background: #FFFBF7; border: 1px solid #D8D7D2`) yields **10 colors**. `#D8D7D2` is the legitimate stroke exception — it never paints a fill or text, only the 1px card border.
2. `#FFF9F5` (`background_primary`/`off_white`) and `#FFFBF7` (`cream_card`) are **not duplicates**. The first is the canvas; the second is the card fill that sits *on top of* the canvas. Slides 1–4 layer cream cards on the off-white grid; the half-shade difference is the visual signal.

Backgrounds: slides 1–4 = `#FFF9F5` + faint `#E8E3DC` architectural grid texture; slides 5–6 = solid `#9FBCAD`. Typography: titles = `Georgia Bold Italic` / `Georgia Italic`, body = `Poppins ExtraLight`, large property name = `Poppins ExtraLight` 21pt, captions = small white text on `caption_overlay`. Shape language: rounded cream cards w/ thin pale stroke, deep-green section header bars w/ white title, sage secondary header bars, image corners 6–18px, footer = green circle icon + italic tagline + slide dots.

### Layer 3 — RENDERER (dumb absolute positioning over a 960×540 canvas)

The renderer is intentionally *dumb*. Every element is `position: absolute` with `{left, top, width, height}` derived mechanically from the contract's `bbox=[x1,y1,x2,y2]`:

```ts
function bboxToStyle([x1, y1, x2, y2]: BBox): React.CSSProperties {
  return { position: "absolute", left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
}
```

Container: `{ position: "relative", width: 960, height: 540 }`. **No flex, no grid, no responsive layout** inside the slide canvas — the self-validation forbidden-element check explicitly fails on flex/grid auto-layouts (see Layer 5). Cards are rendered with manual CSS only — no `<Card>`, no shadcn, no MUI:

```css
background: #FFFBF7;
border: 1px solid #D8D7D2;
border-radius: 12px;
```

Implement the contract's `overflow_handling_rules` in priority order:

1. Wrap text within the original bbox.
2. If still overflowing, reduce font size slightly (preserve hierarchy).
3. Tighten `line-height` minimally.
4. Expand or move bboxes ONLY as a last resort.
5. Never allow text to overlap images, captions, or financial values.
6. Financial values must remain readable; never emit `######`.

**Caption rule (the one the current renderer most violates):** never auto-derive a caption as `${property.name.toUpperCase()} · ${typeLabel(property)}`. Captions describe the *subject of the photo* (canon: "HEATED SALT-WATER POOL · 61+ PRIVATE ACRES"), not the property classification. If no subject-specific caption is authored, leave the caption slot empty — an empty slot is better than a wrong slot.

### Layer 4 — PAYLOAD BUILDER (deterministic property → `DeckPayloadV2`)

The builder is server-side, deterministic, and *honest about what it doesn't know*.

```ts
async function composeDeckPayloadV2(propertyId: number): Promise<DeckPayloadV2> {
  const property = await loadProperty(propertyId);
  const authored = await loadAuthoredDeckPayload(propertyId); // jsonb column
  const photos = await loadSlotTaggedPhotos(propertyId);
  // …
  return {
    slide1: {
      kind: "per-property",
      headerTitle: authored?.slide1?.headerTitle
        ?? `Pipeline Spotlight: ${property.name}, ${property.stateProvince}`,
      headerSubtitle: authored?.slide1?.headerSubtitle ?? "", // empty, NOT statusLabel(...)
      propertyName: property.name, // mixed-case, NOT toUpperCase()
      propertySubtitle: authored?.slide1?.propertySubtitle ?? "",
      // …
    },
    // …
  };
}
```

Persistence: store the authored payload as a `jsonb` column on the property row (`property.lb_deck_payload`) plus an admin payload-editor UI that exposes the shape one slot at a time, with character-count meters wired to the same Zod constraints as the type. Optionally include an "LLM draft" button that *suggests* copy for a slot — but it must be human-approved before it lands in the jsonb. Never let the builder auto-fill editorial copy from CRM enums (`acquisitionStatus`, `qualityTier`, `businessModel`); those are fact fields, not editorial fields.

Photos require slot tagging: `hero / secondary / inset / amenity / pipeline-thumb` — `isHero` + `sortOrder` is not enough (a Slide 1 inset is not a Slide 2 lounge).

Operational note: `@shared/*` resolves directly to `lib/shared/src/*` in both api-server and portal tsconfigs — no manual mirror copy is needed.

### Cross-cutting — SELF-VALIDATION as a build gate

Convert `self-validation-checklist.md` into a vitest suite that runs over the rendered DOM (or a JSDOM render of the slide components) for a fixture deck. Assertions, drawn directly from the checklist:

- Every styled element on the slide canvas has `position: absolute` (no `display: flex` or `display: grid` inside the 960×540 region).
- Every used color is in the allowed palette set (PALETTE values + `caption_overlay`); fail with the offending hex.
- Every used `font-family` is in the allowed Georgia/Poppins family list; fail with the offending font.
- Every text element bbox is within ±2pt of the contract bbox for that slot ID.
- No text element contains `######` (financial-table guard).
- Every required slot is present (slide 1: title, subtitle, name, asking-price, specs heading + 6 bullets, vision heading + 3 bullets, closing tagline, 3 photo captions, footer icon, slide dots).
- Cards use the manual CSS recipe (`background: #FFFBF7; border: 1px solid #D8D7D2; border-radius: 12px`), not a `<Card>` component.
- Captions are non-empty and non-derived (regex out the forbidden `${NAME} · ${TYPE}` pattern).

Wire the suite into `check:*` in CI. A red gate blocks merge.

## Why This Matters

Generic-bag systems get the *shape* of the output right and the *details* wrong, in a way that is invisible to TypeScript and visible only to a human reading the rendered PDF. A `string` is happily a `string` whether it's 5 words of italic descriptor or 600 characters of marketing prose; the compiler can't tell the title-subtitle slot is being abused. Drift then accumulates across all six slides simultaneously, because every slide pulls from the same flattened bag and every binding is ad-hoc. The result is a deck that looks *roughly* like the canonical — same colors, same fonts, same general layout — but is wrong in 14 of 24 slots on Slide 1 and structurally different on Slide 2.

A strict contract demands a strict renderer. The contract does not tolerate "responsive interpretation"; it specifies bboxes, fonts, colors, and character counts down to the decimal point. The renderer must be just as literal: dumb absolute positioning, a closed palette set, a closed font set, manual cards, no auto-derived captions, no invented footers. Anything else is the renderer making editorial decisions the designer already made.

Human authoring is essential. Editorial copy at this fidelity ("Former 1920s Estate of Amelita Galli-Curci", "A historic estate with a proven cultural legacy — positioned at the intersection of nature, heritage, and year-round demand.") cannot be derived from a CRM record. The right system shape is: human writes copy into a slot-aware editor → payload validates against Zod → renderer paints the contract. LLM drafts are acceptable as a *seed*, never as a *source*.

The self-validation gate is what catches the regression. The 10-point checklist is the designer telling you, in advance, exactly which failure modes she expects you to make. Automating it as vitest converts an aspirational checklist into a CI signal.

## When to Apply

- A design contract exists in machine-readable form (JSON/YAML/spec) with bbox-precise per-slot constraints (font, size, color, character count).
- Per-slot recipes are heterogeneous: slot N's content type, length, and voice are not interchangeable with slot M's.
- Generated output must be a faithful derivative of a canonical artifact (PDF, PPTX, Figma frame), not a "responsive interpretation."
- Photo slots have *roles* beyond `isHero` (hero / secondary / inset / amenity / background / pipeline-thumb), each with distinct aspect ratios and caption voice.
- The artifact is investor- or client-facing, so regression risk is high enough to warrant a build-gate validator.
- The current renderer is — or is at risk of becoming — a single generic-payload pipeline shared across slides.

## Examples

### BEFORE — generic bag + ad-hoc bindings (current `slides.tsx` Slide 1)

```tsx
// types.ts — one bag for all six slides
interface SlidePayload {
  property: SlideProperty;     // .description = long marketing paragraph
  photos: SlidePhoto[];        // isHero + sortOrder only — no slot role
  visionText: VisionText;      // 19-field bag, none match recipe slot names
  financials: SlideFinancials;
  // …
}

// slides.tsx — Slide1 picks fields ad-hoc
<span style={{ fontSize: 38, fontWeight: 700, textTransform: "uppercase" }}>
  {property.name.toUpperCase()}                {/* "SAN DIEGO" — wrong: canon is mixed-case "Sul Monte" */}
</span>
<span style={{ fontStyle: "italic" }}>
  {property.description}                        {/* 600 chars in a 42-char italic descriptor slot */}
</span>
specs = [
  `${property.roomCount} boutique keys planned at stabilization`,    // CRM enum, not building fact
  `${type} · ${property.qualityTier} tier`,
  regionLine,
  `${statusLabel(property.acquisitionStatus)} — ${property.businessModel} structure`,
];
visionBullets = [visionText.visionBullet1, visionText.visionBullet2, visionText.programmingBullet];
//                                                                       ↑ financial-recap copy, not strategic vision
const heroCaption = `${property.name.toUpperCase()} · ${type.toUpperCase()}`;  // forbidden auto-derivation
// closingTagline: missing entirely
// inserted footer: "L+B Analytics · Investor Briefing / Page 1" — does not exist in canon
```

### AFTER — `Slide1Payload` + dumb renderer (target shape)

Payload (matching canon Sul Monte verbatim):

```ts
const slide1: Slide1Payload = {
  kind: "per-property",
  headerTitle: "Pipeline Spotlight: Belleayre Mountain, NY",     // canon span, 42 chars
  headerSubtitle: "Active acquisition target — Western Catskills, Delaware County", // 61 chars
  propertyName: "Sul Monte",                                     // mixed-case 21pt Poppins ExtraLight
  propertySubtitle: "Former 1920s Estate of Amelita Galli-Curci", // 42 chars italic descriptor
  askingPrice: { headline: "ASKING PRICE $3.25M", targetAcquisition: "Target Acquisition: $2.3M" },
  propertySpecs: [
    "61+ Private Acres in Western Catskills",
    "1926 Stone-and-Timber Chateau (8,200+ sq ft)",
    "8 Bedrooms, 7 Full Baths",
    "Heated Salt-Water Pool & Indoor Sauna",
    "Studio/Guest House (ADU Conversion)",
    "Asking: $3.25M | Target Acquisition: $2.3M",
  ],
  visionBullets: [
    "Post-Purchase Expansion: 20 Keys | 30–50 Guests",
    "Year-Round Demand: Skiing, Hiking, Cultural Calendar",
    "Anchored Programming: Curated Retreats & Community Off-sites",
  ],
  closingTagline: {
    lead: "A historic estate with a proven cultural legacy",
    tail: " — positioned at the intersection of nature, heritage, and year-round demand.",
  },
  photos: {
    hero:      { src: "…", caption: "SUL MONTE · 1926 STONE-AND-TIMBER CHATEAU" },
    secondary: { src: "…", caption: "HEATED SALT-WATER POOL · 61+ PRIVATE ACRES" },
    inset:     { src: "…", caption: "CURATED GUEST EXPERIENCE" },
  },
};
```

Renderer (single pattern repeats per element, no flex/grid):

```tsx
<div style={{ position: "relative", width: 960, height: 540, background: PALETTE.offWhite }}>
  <span style={{ ...bboxToStyle([429, 53.2, 530.1, 86.6]),
                 fontFamily: "Poppins", fontWeight: 200, fontSize: 21, color: PALETTE.deepGreen }}>
    {slide1.propertyName}
  </span>
  <span style={{ ...bboxToStyle([429, 84, 603.5, 97.8]),
                 fontFamily: "Poppins", fontWeight: 200, fontStyle: "italic",
                 fontSize: 8.6, color: PALETTE.mutedGrayGreen }}>
    {slide1.propertySubtitle}
  </span>
  {/* …each text/visual element rendered the same way, bbox from contract, color from PALETTE */}
</div>
```

## Related

- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — agent-native overlay above this deterministic core: Sage intake pipeline, per-slide specialist teams, hybrid Inspector, Drafter + vetting UX, hallucination defenses. The four layers documented here become the substrate that overlay's Inspectors validate against.
- `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md` — narrower precursor: the specific argument against a generic `SlidePayload` + `VisionText` bag, with a slot-by-slot diff table from the regression that surfaced this work. This doc generalizes that lesson into the four-layer architecture.
- `docs/solutions/workflow-issues/three-way-diff-recon-methodology-2026-05-03.md` — sibling methodology doc: the three-way diff (human brief × machine-precise JSON spans × generated PDF) that surfaced the per-slot drift this architecture is designed to prevent. Diagnose with that, rebuild with this.
- ~~`docs/solutions/tooling/mirror-shared-package-sync.md`~~ — (deleted 2026-05-09): the `@shared/*` mirror has been eliminated; tsconfig path aliases now resolve directly to `lib/shared/src/*` in both packages.
- `docs/solutions/architecture-patterns/slide-deck-generation-decision-reversal-2026-05-03.md` — decision record: Playwright HTML→PDF replaced the two-format PPTX pipeline; adjacent pipeline history, different layer of the slide system.
- `docs/slide-system/canonical/design-contract.json` — the JSON design contract.
- `docs/slide-system/canonical/coding-agent-instructions.md` — the rendering-model rules.
- `docs/slide-system/canonical/self-validation-checklist.md` — the 10-point checklist that becomes the vitest gate.
- `docs/slide-system/canonical/agent-prompt-instructions.txt` — high-level reinforcement.
- Diagnostic source assets: `attached_assets/Pasted-SLIDE-{1,2}-…txt` (human briefs), `attached_assets/slide_analysis_agent_report.precise_*.json` (machine spans).
- Current broken implementation: `artifacts/hospitality-business-portal/src/features/internal-deck/slides.tsx`, `…/types.ts`.
