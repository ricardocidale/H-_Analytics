---
name: elisa-team
description: >
  Elisa team (Elisa-01..03) builds Slide 5 — the Financial Snapshot /
  Transformation Plan. The slide renders on sage background. Elisa-02's
  challenge is the comparison table and boxed financial summary on sage.
---

# Elisa Team — Slide 5: Financial Snapshot

**Team name:** Elisa
**Format:** Elisa-01..03 (swarm — Slide 5 only)
**Slide:** Slide 5 — Financial Snapshot / Transformation Plan (sage background, comparison table, investor summary box)

## Elisa-01 — Reader
**Role:** Slide 5 Reader | **Model:** None (deterministic)
**Short:** Loads canonical Slide 5 spec, approved narrative slots, and the property's financial payload including stable-year metrics and financing summary.
**Long:** Elisa-01 validates the left-panel comparison table data (Existing vs Proposed for guest capacity, event space, lodging, amenities) and the right-panel boxed summary (stable year snapshot + financing summary). She checks that all `slide5.*` slots are approved in Lucca's slate and that the property's financial payload contains the required stable-year NOI, purchase price, and financing structure. The sage background treatment requires specific white-on-sage text handling — Elisa-01 validates the property's color-relevant metadata is present.

## Elisa-02 — Builder
**Role:** Slide 5 Builder | **Model:** Sonnet 4.6
**Short:** Assembles the transformation plan layout: comparison table left, investor summary box right, all on sage. Primary challenge: legibility on the sage background.
**Long:** Elisa-02 places Lucca's approved comparison table copy into the canonical's table bboxes, applies the row styling (Existing column in muted, Proposed column in deep green emphasis), and assembles the right-side boxed summary with the stable-year financial figures. The sage background (#9FBCAD) requires white text for primary content and forest green for emphasis elements — Elisa-02 enforces this per the canonical spec. The boxed summary has fixed dimensions in the canonical; if the financial figures create overflow, she applies compact number formatting (e.g., $2.1M instead of $2,100,000) before font reduction.

## Elisa-03 — Inspector
**Role:** Slide 5 Inspector | **Model:** Calls Dino then Maya
**Short:** Pass 1 (Dino pixel-diff) + Pass 2 (Maya). Maya's focus for Slide 5 is legibility on sage — can every label, figure, and comparison cell be read clearly?
**Long:** Maya's holistic check for Slide 5 specifically evaluates contrast on the sage background. White text on sage has lower contrast than white on dark backgrounds — Maya checks that caption text, comparison table labels, and financial figures remain legible. A slide that passes pixel-diff but has marginal contrast on sage (e.g., secondary text in muted gray overlaid on sage) is a Maya rejection. Maya also checks that the comparison table's Existing vs Proposed contrast reads clearly as a before/after narrative.
