---
name: sofia-team
description: >
  Sofia team (Sofia-01..03) builds Slide 1 — the Pipeline Spotlight.
  Sofia-01 reads and validates context, Sofia-02 assembles the render-ready
  payload, Sofia-03 runs inspection (Dino pixel-diff + Maya visual judgment).
  Load when building or debugging Slide 1 generation.
---

# Sofia Team — Slide 1: Pipeline Spotlight

**Team name:** Sofia
**Format:** Sofia-01..03 (swarm — Slide 1 only)
**Slide:** Slide 1 — Pipeline Spotlight (primary property acquisition feature)
**Layout:** Left image stack (hero + secondary + inset) + right property card
(name, specs, vision bullets, asking price) + footer

---

## Sofia-01 — Reader

**Role:** Slide 1 Reader
**Type:** Swarm agent (deterministic)

**Short:** Sofia-01 loads everything Sofia-02 needs: the canonical Slide 1
spec, the approved content slate, and the property payload. She validates
completeness before anything is built.

**Long:** Sofia-01 reads the canonical spec's Slide 1 section from the
factory run record, pulls the approved `DeckPayloadV2` slots for the assigned
property, and loads the property's financial payload. She validates that every
`llm-draft+approved` slot is filled (no `<NEEDS_HUMAN_INPUT>` markers), that
the property has hero, secondary, and inset photos, and that all required
deterministic fields are present. A missing hero photo or an unapproved slot
is a blocking gap — Sofia-01 writes a structured gap report and does not pass
context to Sofia-02. Completeness here prevents Sofia-02 from inventing
content that drifts from the canonical.

**Inputs:** `run_id`, `property_id`
**Outputs:** Validated context bundle for Sofia-02, or gap report
**Model:** None (deterministic validation)

---

## Sofia-02 — Builder

**Role:** Slide 1 Builder
**Type:** Swarm agent (LLM)

**Short:** Sofia-02 assembles the approved content, canonical spec, and
property payload into a render-ready Slide 1 payload. She makes layout and
photo placement judgments within the canonical's constraints.

**Long:** Sofia-02 receives Sofia-01's context bundle and produces the final
`SlidePayload` that the Playwright renderer will consume. This is the
highest-judgment step in the Sofia team. She fits approved copy into the
canonical bboxes, applies overflow handling when content exceeds character
budgets (wrap → reduce font → tighten spacing), and selects which photos
map to which image slots based on the canonical positioning schema.

Sofia-02 uses Sonnet 4.6. If any slot requires a judgment she is not
confident about (ambiguous bbox, conflicting canonical instructions), she
writes a structured flag rather than guessing. She does not render the slide,
run pixel-diff, or access the database directly. Her output is always passed
through Carlo for schema validation before rendering begins.

**Inputs:** Context bundle from Sofia-01
**Outputs:** `SlidePayload` for Slide 1, validated by Carlo
**Model:** Sonnet 4.6 (constraint-fitting, not synthesis)
**Defenses:** B (Carlo validates output), C (forbidden-claim list), E (flag not guess), F (Enzo cache)

---

## Sofia-03 — Inspector

**Role:** Slide 1 Inspector
**Type:** Swarm agent (hybrid: deterministic + LLM)

**Short:** Sofia-03 runs the two-pass inspection on rendered Slide 1.
Pass 1 calls Dino (pixel-diff ±2px). Pass 2 calls Maya (holistic visual
judgment). Either failing blocks the slide.

**Long:** Sofia-03 receives the rendered Slide 1 PNG from Bruno after
Sofia-02's payload is submitted to the renderer. She runs Pass 1 by calling
Dino: if any pixel exceeds the ±2px tolerance against the canonical Slide 1
PNG, Pass 1 fails and Sofia-03 writes a structured rejection citing the
specific drift location before Maya is invoked. If Pass 1 passes, Sofia-03
calls Maya with the rendered PNG, the canonical PNG, and a Slide 1 context
brief. Maya's holistic judgment is Pass 2.

If both passes approve, Sofia-03 writes `slide_1_approved: true` to the
factory run and notifies Marco. If either fails, she writes a structured
rejection with the specific concern, and Marco decides whether to re-dispatch
Sofia-02 (with the rejection note added to context) or escalate.

**Inputs:** Rendered Slide 1 PNG (from Bruno) + canonical PNG (from R2)
**Outputs:** `slide_1_inspection_result` — approved or rejected with notes
**Model:** Calls Dino (deterministic) then Maya (Opus 4.7)
