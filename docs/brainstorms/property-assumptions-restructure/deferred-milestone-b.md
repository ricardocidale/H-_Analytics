---
date: 2026-05-11
status: DEFERRED — captured for a future brainstorm
parent_brainstorm: property-assumptions-restructure
companion_doc: requirements.md (Milestone A only)
source_consults:
  - opus-consult.md (Claude Opus, 2026-05-11)
  - architect review, 2026-05-11 (recorded inline below)
---

# Property Assumptions Restructure — Milestone B (DEFERRED)

> **Status:** Not in active scope. Milestone A (UI-only restructure, see `requirements.md`) ships without any storage change. Milestone B captures the descriptor-catalog / JSONB migration vision so it can be picked up by a future brainstorm without rebuilding the dialogue.

---

## End-state vision

Pure JSONB + locked descriptor catalog as the canonical storage shape for property descriptors. Per Opus's recommendation (preserved over the architect's hybrid pushback at the user's direction):

```sql
CREATE TABLE descriptor_catalog (
  field_key TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,            -- identity|envelope|inventory|quality|posture
  scope TEXT NOT NULL,                 -- identity|parallel|purchased_only|improved_only
  data_type TEXT NOT NULL,             -- int|float|enum|bool|string|array
  enum_values JSONB,
  unit TEXT,                           -- keys|sqft|seats|acres|usd
  applies_to_use_classes TEXT[],       -- gates UI rendering
  display_label TEXT NOT NULL,
  help_text TEXT,
  sort_order INT
);

ALTER TABLE properties
  ADD COLUMN identity JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN descriptors_purchased JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN descriptors_improved  JSONB NOT NULL DEFAULT '{}';
```

`descriptor_catalog` is code/migration-defined (NOT admin-editable), surfaced read-only in the Knowledge & Resources Tables card per the 2026-05-11 contract.

Approximate field count: **~50 total** (~9 identity, ~5 purchased-only, ~3 improved-only, rest parallel). Full unified schema in `opus-consult.md` § B.

---

## Hard prerequisites — architect-mandated (non-negotiable for this milestone)

These were the architect's reasons for blocking the original unified-cut plan. They become hard requirements when Milestone B is picked up:

1. **Dependency matrix BEFORE any storage change ships.** Map every reader of every column being moved. Known consumers as of 2026-05-11:
   - ICP analysis / config / prompt generation (consumes `fbSeats`, `fbVenues`, `eventSpaceSqft`, `totalPropertyAcreage`, `totalBuildingSqft`)
   - Rebecca research context assembly
   - Report assumption export (consumes `marketTier`, `fbVenues`, `eventSpaceSqft`, acreage)
   - Slide factory pulls
   - Shared engine `PropertyInput` type
   - AI tool function-calling parameters
   - Anywhere else `rg` finds these column names
   - **Note:** ICP consumer status is itself uncertain — see `open-questions/icp-strategic-doubt.md`.

2. **Accessor-first.** Single server-side accessor that resolves a property's descriptors from typed columns + JSONB. **No reader reads JSONB directly.** All reads go through the accessor.

3. **Dual-write with drift instrumentation throughout the migration window.** Every write updates BOTH typed columns and JSONB, with logged drift checks. **JSONB-only writes are forbidden** until every reader has been migrated to the accessor.

4. **Reader-migration order: lowest-risk first.** Exports & research context before the financial engine. Engine reads migrate last because deterministic-engine output is the highest-stakes contract.

5. **Drop dual-write only after a clean drift-log window.** No silent storage-shape change.

---

## Migration sequence (locked-in order)

1. Build the dependency matrix (see prerequisite #1).
2. `descriptor_catalog` table + seed migration.
3. Additive `identity`, `descriptors_purchased`, `descriptors_improved` JSONB columns on `properties`.
4. Backfill JSONB from existing typed columns (one-shot script).
5. Build the accessor layer + tests (resolves typed + JSONB into a unified property descriptor).
6. Migrate readers to the accessor (ordered by risk per prerequisite #4).
7. Switch the UI to write JSONB through the accessor (still dual-writing typed columns).
8. Drop dual-write once drift logs are clean for an agreed window.
9. Drop the deprecated typed columns.

---

## Open design questions to resolve when Milestone B starts

- **6 v0 placeholder enums need refinement** before they ossify in production data: `market_tier`, `target_adr_band`, `f&b_service_model`, `glamping_unit_types`, `condition_rating`, `seasonality_pattern`. Each requires operator/expert consultation (F&B operator for service model, glamping operator for unit types, hospitality consultant for tier/ADR bands).
- **`use_class` taxonomy** — final enum list. Opus implies ~10-15 values. Primary + secondary array shape is decided; the values are not.
- **`condition_rating` decomposition** — still 1-5 single scale, or split into roof/mechanicals/envelope/finishes/site? Or accept it stays decorative and real condition data lives in the cap-ex module?
- **`seasonality_pattern` retrofit risk** — enum vs 12-element monthly occupancy curve. Revenue module's call.
- **ICP's status** as a Milestone B reader (see `open-questions/icp-strategic-doubt.md`) — if ICP is rebuilt or scoped down, the dependency matrix shrinks meaningfully.

---

## Reference — what got us here

- `opus-consult.md` — Claude Opus consult (2026-05-11): 7 transition deltas (SFR→boutique hotel, working farm→agritourism lodge, defunct restaurant→inn-above-restaurant, strip-of-houses→STR cluster, historic mansion→event-venue inn, tired motel→upscale lodge, raw land→glamping); ~50-field unified descriptor schema; JSONB+catalog DB recommendation; 6 push-back fields.
- Architect review (2026-05-11) — flagged the original unified cut as misshaped; mandated milestone split + accessor-first / dual-write / drift-instrumentation discipline (recorded above).
- User decisions (2026-05-11): hybrid field shape; `use_class` = primary + secondary array; v0 placeholder enums for the 6 flagged fields; pure JSONB+catalog over architect's typed-hybrid pushback; accept the milestone split.
