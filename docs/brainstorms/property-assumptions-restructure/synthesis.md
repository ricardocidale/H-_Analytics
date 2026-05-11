---
date: 2026-05-11
topic: property-assumptions-restructure
phase: ce-brainstorm Phase 2.5 synthesis (pre-doc)
---

# Property Assumptions page restructure — Synthesis (pre-requirements-doc)

## Forward summary

Restructure the Property Edit page's top "Property Information" zone (everything currently in `BasicInfoSection.tsx` plus the freeform `DescriptionSection.tsx`) into three subsections — Basic, As Purchased, As Improved — backed by a JSONB-based descriptor schema with a code/migration-locked descriptor catalog. Anything below that zone (Capital Structure, Operating Costs, Revenue, etc.) is untouched in this cut. Breadcrumb "Edit" → "Property Assumptions". Type-specific descriptor catalogs are unified (single catalog gated by `applies_to_use_classes`); an LLM Description Drafter persona is deferred.

## Stated

- Rename breadcrumb across the whole app: "Edit" → "Property Assumptions" wherever a property edit page is reached.
- Split the current "Property Information" zone into three stacked subsections: Basic, As Purchased, As Improved.
- **Hybrid** field shape: identity fields live only in Basic; some descriptors live in only one state; descriptors that genuinely change with renovation (keys, suites, F&B seats, F&B venues, event sqft, building sqft, parking, etc.) are parallel pairs across As Purchased and As Improved.
- `use_class` is a primary-use enum **plus** a secondary-uses array (so an inn-with-restaurant-and-event-venue can be modeled honestly).
- Six "look twice" fields (`market_tier`, `target_adr_band`, `f&b_service_model`, `glamping_unit_types`, `condition_rating`, `seasonality_pattern`) are included as v0 placeholder enums — conservative single-value vocabularies expected to be revised after operator/expert review.
- These are true user inputs requiring little or no AI research — once entered they're "ground work" that won't change much during the analysis lifetime.
- Storage shape: locked-down descriptor catalog in code/migrations (admin cannot edit, admin does not see), backed by a `descriptors_purchased` and `descriptors_improved` JSONB on `properties`, plus an `identity` JSONB for immutable fields. Catalog row gates which fields render for which `use_class`.
- Don't touch anything below the Property Information zone in this cut.

## Inferred (un-validated agent bets to be reviewed)

- Migration approach: existing typed columns currently in `properties` (`name`, `location`, `market`, `marketTier`, `propertyType`, `fbVenues`, `fbSeats`, `eventSpaceSqft`, `totalPropertyAcreage`, `totalBuildingSqft`, `yearBuilt`, `lastRenovationYear`) are migrated into the new JSONB shape via a backfill, then deprecated/dropped in a later task. **The first cut writes to JSONB only; existing typed columns are read-only fallbacks during transition.**
- The freeform description text in `DescriptionSection.tsx` becomes two fields: `description_purchased` and `description_improved`, both typed by the user (no LLM drafter in this cut).
- Stars are decorative only; quality / finish_grade IS functional (drives Specialist research prompts and ADR/RevPAR guardrails).
- The page keeps current tab/layout chrome; this cut changes only the content of the first tab/section.
- Knowledge & Resources Tables card surfaces the new `descriptor_catalog` table read-only (per 2026-05-11 contract) — rollout is part of this work, not a separate scope.
- No new Specialist or Minion is created in this cut.
- The 7 transition scenarios from the Opus consult inform the schema, NOT separate code paths — the schema is unified, gating happens via `applies_to_use_classes`.

## Out of scope

- LLM "Description Drafter" persona / Specialist (deferred).
- Per-property-type form variants beyond `applies_to_use_classes` gating.
- Refinement of the 6 placeholder enums (deferred follow-up task with operator/F&B/glamping consultation).
- Decomposing `condition_rating` into roof/mechanicals/envelope/finishes/site.
- Replacing `seasonality_pattern` enum with a 12-element monthly occupancy curve.
- Touching anything below the Property Information zone.
- Dropping the existing typed columns in `properties` (later cleanup task).
- Range-badge quality contract integration on the new fields (separate contract per `analyst-intelligence-display`).
- Visual redesign / new typography / new color treatments.

## Source consult

`docs/brainstorms/property-assumptions-restructure/opus-consult.md` — Claude Opus consult, 2026-05-11. ~50-field unified descriptor schema, 7 transition deltas, JSONB+catalog DB recommendation, 6 push-back fields.
