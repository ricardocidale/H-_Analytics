---
name: chiara-team
description: >
  Chiara team (Chiara-01..03) builds Slide 3 — the Investment Model /
  global expansion proof-of-concept. Chiara-02's challenge is fitting
  the argumentative investment narrative into the three-panel layout.
---

# Chiara Team — Slide 3: Investment Model

**Team name:** Chiara
**Format:** Chiara-01..03 (swarm — Slide 3 only)
**Slide:** Slide 3 — Investment Model (hero image left, strategic details center, rationale cards right)

## Chiara-01 — Reader
**Role:** Slide 3 Reader | **Model:** None (deterministic)
**Short:** Loads canonical Slide 3 spec, approved strategic narrative slots, and the property's investment rationale content.
**Long:** Chiara-01 validates the three-panel layout requirements: hero image (left), concept block + strategic details (center), and rationale cards (right). She confirms the approved `slide3.visionBullets`, `slide3.strategicDetails`, and `slide3.rationaleCards` slots are all complete in Lucca's approved slate. She also validates the hero photo exists and is landscape-oriented (Slide 3 uses a full-height left panel image, not a stacked layout like Slides 1-2).

## Chiara-02 — Builder
**Role:** Slide 3 Builder | **Model:** Sonnet 4.6
**Short:** Assembles the three-panel investment narrative. Primary challenge: the copy is argumentative (investment thesis) rather than descriptive — fitting it into the canonical bboxes without losing the logical thread.
**Long:** Slide 3 copy is the most narrative in the deck. Chiara-02 fits Lucca's approved investment thesis bullets, strategic details, and rationale cards into the canonical's center and right panel bboxes. The canonical positioning has three right-panel cards with specific character budgets. If Lucca's approved copy exceeds those budgets, Chiara-02 applies overflow handling (reduce font first, then tighten line height) before considering wrapping, because the card layout has fixed heights in the canonical. The hero image is placed at the full left panel position with the dark translucent caption overlay per the canonical spec.

## Chiara-03 — Inspector
**Role:** Slide 3 Inspector | **Model:** Calls Dino then Maya
**Short:** Pass 1 (Dino pixel-diff) + Pass 2 (Maya). Maya's focus for Slide 3 is narrative integrity — does the investment argument remain coherent in the rendered layout, or has overflow handling fragmented the logic?
**Long:** Maya's holistic check for Slide 3 extends beyond aesthetics to readability of the investment argument. A slide that passes pixel-diff but presents truncated bullets or a fragmented strategic rationale is a rejection — an investor who can't follow the investment thesis on Slide 3 means the deck fails its purpose. Maya is the only check capable of making this judgment.
