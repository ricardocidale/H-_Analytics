---
name: dario-team
description: >
  Dario team (Dario-01..02) builds Slide 4 — the Portfolio Grid. This slide
  is fully deterministic — Dario-01 combines Reader and Builder because no
  LLM judgment is required. Dario-02 inspects.
---

# Dario Team — Slide 4: Portfolio Grid

**Team name:** Dario
**Format:** Dario-01..02 (swarm — Slide 4 only, 2 members instead of 3)
**Slide:** Slide 4 — Portfolio Grid (six-property 3×2 card grid, auto-generated)

**Why only two members:** Slide 4 is fully deterministic. The content (property
names, locations, hero photos, acquisition status badges) comes entirely from
the properties table. There is no narrative copy, no admin-authored slots, and
no layout ambiguity. Dario-01 combines the Reader and Builder roles because
separating them would add overhead without adding judgment.

## Dario-01 — Reader + Builder (combined)
**Role:** Slide 4 Reader + Builder | **Model:** None (deterministic)

**Short:** Dario-01 reads all portfolio properties and assembles the six-card grid. No LLM. The content is the portfolio — names, locations, photos, status.

**Long:** Dario-01 reads all active portfolio properties from the database, their hero photos (or placeholder if no hero exists), their acquisition status, and their locations. He assembles the `SlidePayload` for Slide 4 mechanically: six cards in a 3×2 grid, each with a hero photo and a dark forest text panel containing the property name, location, and status badge. He validates that at least four properties exist (the minimum for a meaningful portfolio grid) and uses placeholder cards per the canonical fallback spec for any empty slots. Dario-01 does not use an LLM. His output is validated by Carlo before rendering.

**Inputs:** All active portfolio properties from DB
**Outputs:** `SlidePayload` for Slide 4, validated by Carlo
**Defenses:** B (Carlo schema validation), F (Enzo cache)

## Dario-02 — Inspector
**Role:** Slide 4 Inspector | **Model:** Calls Dino then Maya

**Short:** Pass 1 (Dino pixel-diff) + Pass 2 (Maya). Because the content is deterministic, most rejections indicate a data issue — missing photo, overflow property name — not a judgment issue.

**Long:** Dario-02 runs Pass 1 (Dino pixel-diff) and Pass 2 (Maya visual judgment) on the rendered Slide 4. Maya's focus for this slide is grid consistency: do all six cards display at equal dimensions, are hero photos consistently cropped at the card boundaries, are property names legible on the dark forest panels, and does the grid alignment match the canonical 3×2 layout? Because the content is deterministic, a Pass 2 rejection from Maya almost always points to a data problem (hero photo missing, excessively long property name overflowing its card) rather than a judgment disagreement. Dario-02 documents the specific data gap in his rejection note so Marco can report it to the admin rather than re-dispatching Dario-01 blindly.
