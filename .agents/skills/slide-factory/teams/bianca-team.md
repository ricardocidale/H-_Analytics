---
name: bianca-team
description: >
  Bianca team (Bianca-01..03) builds Slide 2 — the Photo Gallery.
  Same Reader/Builder/Inspector pattern as Sofia. Bianca-02's primary
  challenge is photo harmony across the 2×2 grid.
---

# Bianca Team — Slide 2: Photo Gallery

**Team name:** Bianca
**Format:** Bianca-01..03 (swarm — Slide 2 only)
**Slide:** Slide 2 — Photo Gallery (secondary property showcase, 2×2 photos)

## Bianca-01 — Reader
**Role:** Slide 2 Reader | **Model:** None (deterministic)
**Short:** Loads and validates the canonical Slide 2 spec, approved slots, and property photos. Validates all 4 gallery photo slots are filled before Bianca-02 runs.
**Long:** Same pattern as Sofia-01, scoped to Slide 2. Bianca-01 specifically validates that the property has at least 4 gallery-quality photos (not just a hero shot) and that the captions for each photo are approved in the `DeckPayloadV2` content slate. Gallery slides fail gracefully if photo inventory is insufficient.

## Bianca-02 — Builder
**Role:** Slide 2 Builder | **Model:** Sonnet 4.6
**Short:** Assembles the 4-photo gallery layout with approved captions. Primary judgment: photo selection and ordering for visual harmony across the 2×2 grid.
**Long:** Bianca-02 selects which 4 photos fill the gallery grid based on the property's photo library and the canonical's bounding boxes. Her primary judgment challenge is harmony: color temperature consistency, subject variety (not four identical exterior shots), and framing that works at the card dimensions the canonical defines. She applies the same overflow and canonical-conformance rules as Sofia-02. Approved captions from Lucca's draft slate are placed on the dark overlay strips per the canonical spec.

## Bianca-03 — Inspector
**Role:** Slide 2 Inspector | **Model:** Calls Dino then Maya
**Short:** Pass 1 (Dino pixel-diff) + Pass 2 (Maya visual judgment). Maya's focus for Slide 2 is gallery cohesion — do the four photos feel curated or assembled?
**Long:** Same pass structure as Sofia-03. Maya's holistic judgment for Slide 2 places particular emphasis on whether the four photos feel selected together — color temperature consistency, subject framing, and gallery composition. A grid that passes pixel-diff but feels like a random selection from a property database is a Maya rejection.
