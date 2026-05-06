---
name: lorenzo-team
description: >
  The Lorenzo team (Lorenzo-01 through Lorenzo-05) ingests a canonical
  PDF or PPTX and produces the structured design spec + canonical PNGs
  that all slide teams build against. Load when building or debugging
  the canonical ingestion pipeline.
---

# Lorenzo Team — Canonical Ingestion Swarm

**Team name:** Lorenzo
**Format:** Lorenzo-01..05 (swarm — job-specific)
**Job:** Convert a canonical deck artifact into a machine-readable design
spec + per-slide canonical PNGs

**Short description:**
The Lorenzo team turns a canonical PDF or PPTX into the structured design
spec and canonical reference PNGs that the rest of the factory depends on.
They are the only team that touches raw file bytes.

**Long description:**
The Lorenzo team's job is to answer one question: given this canonical deck,
what are the precise visual rules a new property deck must follow? They
produce two artifacts — the design spec JSON (a structured description of
every layout element, font, color, and slot for all 6 slides) and the
canonical PNGs (one per slide, used by Dino for pixel-diff during inspection).
The spec they produce becomes the single source of truth for the entire
factory. Every subsequent agent — Lucca, all Builder -02 agents, all
Inspector -03 agents — works from what the Lorenzo team produced.

---

## Lorenzo-01 — PDF/PPTX Primitive Extractor

**Role:** Canonical Primitive Extractor
**Type:** Swarm agent (deterministic, no LLM)

**Short:** Lorenzo-01 extracts every positioned element from the canonical
file — text, fonts, colors, bounding boxes, image placements — using
deterministic tools. No interpretation. Ground truth only.

**Long:** Lorenzo-01 calls Aldo to extract every text run, image coordinate,
font name, font size, font weight, and color value from the canonical PDF or
PPTX. His output is a raw primitives JSON: a flat list of positioned elements
in the 960×540 coordinate space. He makes no judgments about what elements
mean. If Aldo returns an error or produces fewer than a minimum element count,
Lorenzo-01 writes a structured failure and the run stops before any LLM
is invoked. He is the foundation — if his output is wrong, everything
downstream is wrong.

**Inputs:** Canonical file buffer (PDF or PPTX)
**Outputs:** `primitives_json` — flat array of positioned elements
**Model:** None (deterministic, calls Aldo)

---

## Lorenzo-02 — Visual Renderer

**Role:** Canonical PNG Renderer
**Type:** Swarm agent (deterministic, no LLM)

**Short:** Lorenzo-02 renders each slide of the canonical to a full-resolution
960×540 PNG using Playwright. These PNGs are the pixel ground truth every
Inspector compares against.

**Long:** Lorenzo-02 calls Bruno to render the canonical, producing one PNG
per slide. These canonical PNGs are stored to R2 under
`canonical/lb-6-slide/slides/slide-N.png` and written to the factory run
record. Every slide Inspector (Sofia-03 through Felix-05) calls Dino with
these PNGs as the reference baseline. Lorenzo-02 does not interpret slides
or analyze content — he only captures them. His success criterion is simple:
six readable PNGs at 960×540, stored and keyed.

**Inputs:** Canonical PDF (already loaded by Lorenzo-01)
**Outputs:** 6 R2 keys for canonical PNGs; written to `slide_factory_runs`
**Model:** None (deterministic, calls Bruno)

---

## Lorenzo-03 — Vision Reconciler

**Role:** Canonical Vision Reconciler
**Type:** Swarm agent (LLM)

**Short:** Lorenzo-03 is the only LLM in the Lorenzo team. He reads the raw
primitives and canonical PNGs to assign semantic roles — which element is
the property title, which block is the header subtitle, what the overflow
behavior should be.

**Long:** Lorenzo-03 works under Carlo's strict schema contract. He receives
Lorenzo-01's primitives JSON and Lorenzo-02's canonical PNGs, and fills in
only the interpretive fields: `semantic_role`, `variable_binding`,
`overflow_behavior`, `character_count`. He cannot overwrite numerical fields
(bbox, font_size, color) — Carlo will reject any attempt. Where the canonical
has ambiguous elements, Lorenzo-03 flags them explicitly rather than guessing.
He uses Opus 4.7. If Lorenzo-03 fails or produces incomplete output, the run
pauses for admin review before proceeding.

**Inputs:** `primitives_json` (Lorenzo-01) + canonical PNGs (Lorenzo-02)
**Outputs:** `spec_draft_json` — merged primitives + semantic interpretation
**Model:** Opus 4.7 (vision required, highest judgment)
**Defenses active:** B (Carlo schema lock), C (forbidden overwrite list), E (flag not guess)

---

## Lorenzo-04 — Schema Validator

**Role:** Canonical Spec Validator
**Type:** Swarm agent (deterministic, no LLM)

**Short:** Lorenzo-04 calls Carlo to validate the merged spec against the
design-contract schema. Blocking errors stop the run; advisory errors are
surfaced to admin.

**Long:** Lorenzo-04 calls Carlo with the merged spec and the canonical
design-contract schema. Carlo returns pass or a list of field-level errors.
Lorenzo-04 categorizes them: blocking (missing required fields, type
violations) vs advisory (character count warnings, overflow risk). It also
enforces the numerical-field integrity check: if Lorenzo-03's output contains
any bbox, font_size, or color values that differ from Lorenzo-01's extraction,
Lorenzo-04 flags them as integrity violations regardless of Zod validity.

**Inputs:** `spec_draft_json` (Lorenzo-03)
**Outputs:** `validation_result` — pass/fail with categorized issues
**Model:** None (deterministic, calls Carlo)

---

## Lorenzo-05 — Canonical Inspector

**Role:** Canonical Spec Inspector
**Type:** Swarm agent (LLM)

**Short:** Lorenzo-05 asks the final question before the spec is accepted:
could someone rebuild this deck faithfully from this spec alone? He reads
the spec and the canonical PNGs with the same holistic judgment as Maya.

**Long:** Lorenzo-05 receives the validated spec and all six canonical PNGs.
He evaluates completeness: are all slots mapped, are layout instructions
unambiguous, are font definitions precise enough that a Builder won't guess?
He uses Opus 4.7 with vision. If the spec is complete and accurate, he
approves and the factory run advances to Property Setup. If not, he writes
a structured rejection with specific gaps, triggering Lorenzo-03 to refine
its output for the affected slides. The admin can override a Lorenzo-05
rejection if they have context Lorenzo-05 does not.

**Inputs:** `spec_validated_json` (Lorenzo-04) + canonical PNGs (Lorenzo-02)
**Outputs:** `spec_inspection_result` — approved or rejected with gaps
**Model:** Opus 4.7 (holistic judgment)
**Defenses active:** E (flag not guess), H (audit logged)
