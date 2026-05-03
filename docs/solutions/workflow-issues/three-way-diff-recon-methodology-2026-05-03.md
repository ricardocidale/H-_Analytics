---
title: "Three-way diff: diagnose generated-artifact drift against a canonical reference"
date: 2026-05-03
category: workflow-issues
module: design-systems
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "A generated artifact (slide, PDF, branded report, mobile screen, dashboard) has a canonical reference design"
  - "The canonical reference has slot-level structure (named regions with fixed bbox/font/color/length expectations)"
  - "Visual review of the rendered output has produced ambiguous feedback like \"looks wrong but I can't pinpoint why\""
  - "Precise spans (text + bbox + font + color) can be extracted from the canonical via PDF text-extraction, Figma export, or DOM snapshot"
  - "Drift may be content-level, constraint-level (overflow), or structural (whole template wrong)"
related_components:
  - documentation
  - tooling
tags:
  - design-recon
  - canonical-diff
  - slot-level-validation
  - drift-diagnosis
  - lb-slides
  - editorial-systems
---

# Three-way diff: diagnose generated-artifact drift against a canonical reference

## Context

When a generator produces an artifact (slide, PDF, branded report) that has a canonical design reference, "this looks wrong" is the most expensive feedback a reviewer can give. It triggers a guess-and-rerun loop where the engineer eyeballs the output, edits a likely culprit, regenerates, and re-shows. Each cycle costs minutes-to-hours and rarely converges, because visual review at thumbnail scale silently ignores the constraints (font, color, character budget, bbox, slot existence) that actually define design fidelity.

The L+B 6-slide investor deck rebuild was the working example. A "San Diego" Slide 1 was generated against the canonical "Sul Monte" Slide 1 reference. Visual review produced "the slide looks broken." A three-way diff produced a slot-level table showing exactly which 14 of 24 slots were wrong, which payload field was mapped into each wrong slot, and (critically) which canonical slot was *missing entirely* from the generated output. That table is what made the architectural fix possible (see Related → `slide-payload-slot-specific-schema-2026-05-03.md` and the four-layer rebuild architecture in `canonical-contract-rebuild-architecture-2026-05-03.md`).

## Guidance — the three-way diff procedure

You need three sources, in this order:

**Source 1 — Human editorial brief.** A prose description of every shape, slot, role, and *intent*. Example: `attached_assets/Pasted-SLIDE-1-Sul-Monte-Investment-Spotlight-0-Slide-Level-Me_*.txt`. The brief explains *why* a slot exists ("shape 50 is a single-line italic descriptor; it carries the property's editorial subtitle, NOT a marketing paragraph") and flags ambiguities or canonical bugs ("Shape 44 'Pipeline Spotlight: Belleayre Mountain' green-on-dark-green fails WCAG"). Caveat: the brief is opinionated and may editorialize on the canonical's own mistakes — treat it as designer intent, not ground truth.

**Source 2 — Machine-precise JSON spans.** bbox-anchored, font-named, color-typed, character-counted. Example: `attached_assets/slide_analysis_agent_report.precise_*.json`. Each `editable_text_spans` entry has `{ text, char_count, bbox: [x1,y1,x2,y2], font, font_size_pt, color_hex }`. This is the ground truth for *what the canonical actually renders*. Use this to derive the slot's hard constraints (font name, exact size, exact hex, exact bbox, character budget).

**Source 3 — Generated artifact.** The rendered PDF, screenshot, or DOM dump you are diagnosing.

### The procedure

Build a slot-by-slot table with these columns:

| Slot ID | Canonical Spec (font · size · color · bbox · char-budget) | Canonical Text | Generated Text | Verdict |

Verdicts use a fixed vocabulary: `✓ correct`, `✗ wrong content`, `✗ wrong font/size/color`, `✗ overflow`, `✗ missing`, `✗ added (not in canon)`. The discipline is **one row per canonical slot, no skipping**, even when the slot looks fine in the rendered output. Skipping is how you miss a "missing slot" failure.

After the table, group failures by *source field* (which payload field was bound to which wrong slot). The grouping reveals architectural drift (one wrong source field can show up in five wrong slots) and is the input to the schema/payload fix.

### Source priority when sources disagree

Source 2 (machine spans) is ground truth for **fidelity** — what the canonical actually renders. Source 1 (human brief) is ground truth for **intent** — what the designer meant. When they disagree (e.g., the brief flags "PAGE 17" in the canonical footer as a stale-template bug, but the JSON span confirms "PAGE 17" is what's actually rendered), the right read is "designer intent vs canonical bug" — escalate to the designer, do not silently reproduce one over the other.

## Why This Matters

Three failure modes are invisible to pure visual review:

**(a) Constraint-level violations.** Slide 1's `s1_property_subtitle` slot is canonically `Poppins ExtraLight Italic, 8.6pt, #9FB0A4`, bbox `[429, 84, 603.5, 97.8]`, character budget ~42 (canonical text: "Former 1920s Estate of Amelita Galli-Curci"). The generator stuffed `property.description` (~600 chars) into it. At thumbnail scale this looks like "small text wraps a lot"; the constraint table makes it visible as `char_budget: 42 → got: ~600 (14× overflow)`.

**(b) Shape correct, content wrong.** The Property Specs card is the correct size and position in the broken Slide 1, but the bullets are CRM enums ("20 boutique keys planned", "Boutique Hotel · upscale tier", "Pipeline — hotel structure") instead of building facts ("61+ Private Acres in Western Catskills", "1926 Stone-and-Timber Chateau (8,200+ sq ft)", "8 Bedrooms, 7 Full Baths"). The slot looks populated, so visual review skips it. The character-budget + content-pattern comparison flags it instantly.

**(c) Missing slots.** The canonical closing tagline (`s1_footer_tagline`, two-color italic at y≈518, "A historic estate with a proven cultural legacy — positioned at the intersection of nature, heritage, and year-round demand.") was simply absent from the generated output. Eyeballing the generated PDF gives no anchor for "what's *not* there"; only iterating the canonical span list produces a row that says `✗ missing`.

Without all three sources you cannot disambiguate *designer-introduced canonical bug* from *renderer drift from canonical* from *designer intent that neither canonical nor renderer captures*. The brief catches the first; the JSON spans catch the second; the generated artifact reveals the third.

## When to Apply

Apply this methodology when:

- The generated artifact has a canonical reference (deck, brand sheet, design comp, exported PDF, Figma frame).
- Precise spans can be extracted from the canonical (PyMuPDF `fitz` text-extraction, Figma `getCSSAsync`, DOM `getBoundingClientRect`, PPTX `<a:t>` parsing).
- The artifact has slot-level structure (slides, forms, cards, mobile screens, dashboards) — i.e. discrete named regions with stable roles. Skip for free-flowing content (long-form prose, freeform whiteboards).
- Drift is suspected but ambiguous from visual review alone.
- The drift is recurring across instances (every property's deck breaks the same way) — the table also doubles as a regression checklist.

### Reusing the methodology across artifact types

The procedure is artifact-agnostic; only the extractor for Source 2 changes:

- **Mobile UI:** Source 2 = Figma frame export (`figma-export` or the Figma REST API `/files/{key}/nodes` for bbox + style per layer); Source 3 = Appium / Playwright DOM snapshot or device screenshot.
- **Branded reports (Word/PDF):** Source 2 = `python-docx` paragraph/run iteration or PyMuPDF span extraction; Source 3 = generated PDF. Char-budget and font-name checks are identical.
- **Web pages / dashboards:** Source 2 = `getBoundingClientRect()` + `getComputedStyle()` per `data-testid`; Source 3 = live page DOM. Verdict vocabulary is unchanged.

## Examples

### Slide 1 — "San Diego" generated vs. "Sul Monte" canonical (abridged; full table is ~24 rows)

| Slot ID | Canonical spec | Canonical text | Generated text | Verdict |
|---|---|---|---|---|
| `s1_header_subtitle` | Georgia Italic · 14pt · #9FB0A4 · bbox [33, 21, 432.5, 37.5] · ≤62 chars | "Active acquisition target — Western Catskills, Delaware County" | "Pipeline — Hotel · San Diego, CA" | ✗ wrong content (enum jargon, not editorial) |
| `s1_property_name` | Poppins ExtraLight · 21pt · #257D41 · bbox [429, 53, 530, 87] · mixed-case | "Sul Monte" | "SAN DIEGO" | ✗ wrong content (uppercased) |
| `s1_property_subtitle` | Poppins ExtraLight Italic · 8.6pt · #9FB0A4 · bbox [429, 84, 603.5, 97.8] · ~42 chars | "Former 1920s Estate of Amelita Galli-Curci" | property.description (~600 chars) | ✗ overflow (14× char budget) |
| `s1_specs_bullets` (rows 1–3) | Poppins ExtraLight · 9pt · #257D41 · 6 building-fact lines | "61+ Private Acres in Western Catskills" / "1926 Stone-and-Timber Chateau (8,200+ sq ft)" / "8 Bedrooms, 7 Full Baths" | "20 boutique keys planned" / "Boutique Hotel · upscale tier" / "Pipeline — hotel structure" | ✗ wrong content (CRM enums, not building facts) |
| `s1_vision_bullets` | Poppins ExtraLight · 8.5pt · #9FB0A4 · 3 strategic bullets | "Post-Purchase Expansion: 20 Keys \| 30–50 Guests" / "Year-Round Demand: …" / "Anchored Programming: …" | "$240 ADR" / "72% occupancy" / "$173 RevPAR" | ✗ wrong content (financial recap, not strategic vision) |
| `s1_footer_tagline` | Poppins Italic/Regular · 9pt · two-color #257D41/#6D756F · bbox [46.3, 518.2, 591.9, 532.5] · ~124 chars | "A historic estate with a proven cultural legacy — positioned at the intersection of nature, heritage, and year-round demand." | *(nothing rendered at y518)* | ✗ missing |
| *(no slot)* | — | — | "Generated by H+ Analytics · property dossier · v1.0 · 2026-05-03 …" verbose system footer at bottom-of-card | ✗ added (not in canon) |

Grouping by source field exposes the architectural fix: `property.description` is bound to a 42-char italic slot; `acquisitionStatus` enum-label is bound to the editorial header subtitle; `visionText.{revenueBullet, programmingBullet, …}` is bound to the strategic-vision bullet block. Each is a single mis-binding cascading into one wrong slot. The whole pattern motivates the per-slot schema (see the architecture doc).

### Slide 2 — structural divergence (one-line summary)

The same procedure applied to Slide 2 produced row 1 = "✗ wrong template entirely." The canonical Slide 2 is a structural clone of Slide 1 (same chrome, same right-column hero+specs+vision card stack, swapped photos and copy). The generated Slide 2 was a single-column financial summary table. Pure visual review reported "different content." The three-way table reported "every canonical slot ID is missing; all generated content is `added (not in canon)`" — i.e. the generator is rendering the *wrong template*, not just the wrong content. That distinction routes to a different fix (template selection bug, not slot-binding bug).

## Related

- `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md` — the architectural fix this methodology surfaced (per-slot, per-slide payload schema replacing the generic `SlidePayload + VisionText` bag). Its "diff that exposed the pattern" section is itself a worked instance of this methodology.
- `docs/solutions/architecture-patterns/canonical-contract-rebuild-architecture-2026-05-03.md` — the broader rebuild-from-canonical-contract pattern that consumes the diagnostic outputs of this methodology as inputs to its planning step. **Diagnose with this doc; rebuild with that one.**
- `docs/slide-system/canonical/` — the kind of canonical reference this methodology consumes: `design-contract.json` (machine-precise per-slot specs), `coding-agent-instructions.md` (rendering rules), `self-validation-checklist.md` (the renderer's own pre-output gate, which is the inverse of this diagnostic loop).
- Source files for the working example: `attached_assets/Pasted-SLIDE-1-Sul-Monte-…txt`, `attached_assets/Pasted-SLIDE-2-Hazelnis-…txt`, `attached_assets/slide_analysis_agent_report.precise_1777824741855.json`.
