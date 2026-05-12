---
date: 2026-05-11
topic: property-assumptions-restructure
scope: Milestone A only — UI restructure of the Property Edit page + a small additive Drizzle migration for the As-Improved typed columns (see R11). No descriptor-catalog table, no JSONB columns, no accessor layer — those remain in Milestone B.
companion_docs:
  - deferred-milestone-b.md (descriptor schema + JSONB migration — DEFERRED)
  - open-questions/icp-strategic-doubt.md (open strategic doubt about ICP)
  - opus-consult.md (Claude Opus consult that informed the schema vision)
---

# Property Assumptions Restructure — Milestone A

## Summary

Restructure the Property Edit page's top "Property Information" zone into three subsections — Basic, As Purchased, As Improved — using only the existing typed columns on `properties`, with no descriptor-catalog or JSONB storage changes. Rename the breadcrumb "Edit" → "Property Assumptions" everywhere a property edit page is reached. Split the freeform description into purchased and improved variants as additive typed columns.

---

## Problem Frame

The Property Edit page's "Property Information" zone today is a single flat 455-line `BasicInfoSection.tsx` plus a separate freeform `DescriptionSection.tsx`. It does not distinguish between facts that describe the property as the user purchased it (e.g., 0 keys when the property was a single-family residence) and the renovation hypothesis the user is modeling (e.g., 8 keys after conversion to a boutique hotel). Users have to mentally hold both states in one set of fields, and the page conflates immutable identity (address, lot acres, year built) with mutable hypothesis (keys, F&B seats, event sqft) — making it impossible to model the seven hospitality transitions the platform actually serves (estate→boutique hotel, working farm→agritourism lodge, defunct restaurant→inn, strip-of-houses→STR cluster, historic mansion→event venue, motel→lodge, raw land→glamping). The breadcrumb label "Edit" also undersells what the page is — these are the property's foundational analytical assumptions, the inputs every Specialist and downstream model reads.

---

## Requirements

**Breadcrumb**
- R1. The breadcrumb label that today reads "Edit" on any path leading to the Property Edit page is renamed to "Property Assumptions" across the application.

**Page-level structure**
- R2. The top "Property Information" zone of the Property Edit page is reorganized into three vertically stacked, visually distinct subsections in this order: Basic, As Purchased, As Improved. The existing tab/layout chrome around the page is preserved.
- R3. Nothing below the Property Information zone (Capital Structure, Operating Costs, Revenue Assumptions, and any other sections currently rendered) is modified by this milestone.

**Basic subsection — immutable identity fields**
- R4. The Basic subsection contains only fields that describe the property's permanent identity and do not change with renovation. From the existing `BasicInfoSection.tsx` field set, these are: name, address, country, state, market, year built, total property acreage. The market tier field is included here as a v0 placeholder (its taxonomy is one of the six "look twice" fields deferred to Milestone B).

**As Purchased subsection — facts at acquisition**
- R5. The As Purchased subsection contains fields describing the property in its acquired condition. From the existing typed columns: F&B venues, F&B seats, event space sqft, total building sqft, last renovation year. Each value reflects what was true on the day of purchase.
- R6. The As Purchased subsection includes a freeform description field (`description_purchased`) for the user to narrate the property as acquired.

**As Improved subsection — renovation hypothesis**
- R7. The As Improved subsection contains the user's renovation hypothesis for the same set of operational fields as As Purchased: F&B venues, F&B seats, event space sqft, total building sqft. Each value reflects what the user intends the property to be after renovation. Last renovation year is replaced by a "planned reopening year" field that is purchased-state-only's mirror.
- R8. The As Improved subsection includes a freeform description field (`description_improved`) for the user to narrate the renovated vision.
- R9. When an As-Improved field has not been set, the UI displays the As-Purchased value as a faded placeholder so the user can see the starting point they're editing away from. The placeholder does NOT auto-populate the field on submit — it is purely visual.

**Storage — small additive migration only**
- R10. The new As-Purchased fields map directly to the existing typed columns on `properties` (no changes to those columns).
- R11. The new As-Improved fields are added as additive typed columns on `properties` using the existing Drizzle migration pattern. Naming follows the existing column convention (e.g., `fbVenuesImproved`, `fbSeatsImproved`, `eventSpaceSqftImproved`, `totalBuildingSqftImproved`, `plannedReopeningYear`, `descriptionImproved`).
- R12. The freeform `description_purchased` field reuses the existing description column on `properties` if present, or is added as `descriptionPurchased` matching the As-Improved naming convention. Whichever exists, the chosen column is the single source of truth for the As-Purchased narrative.
- R13. No descriptor catalog table is introduced. No JSONB columns are introduced. No accessor layer is introduced. Existing readers of `properties.fbSeats`, `fbVenues`, `eventSpaceSqft`, `totalBuildingSqft`, `marketTier`, etc. continue to read the same typed columns and see no behavioral change.

**Validation and types**
- R14. Each new As-Improved typed column gets a corresponding entry in the existing drizzle-zod update schema and OpenAPI spec, generated through the existing codegen pipeline (`pnpm --filter @workspace/api-spec run codegen`).
- R15. The PATCH endpoint for properties accepts the new As-Improved fields and persists them; no separate endpoint is created.

**Agent-native parity (CLAUDE.md §7)**
- R16. Every new user-editable action introduced for the As-Purchased and As-Improved subsections (R5–R9, AE2/AE4) must be achievable through Rebecca in the same PR. The `docs/discipline/agent-native-parity-map.md` map is updated to reference the new tools / patched tools, with ✅ status for each.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a user navigating to `/property/:id/edit`, when the page loads, then the breadcrumb reads "Property Assumptions" (not "Edit"), and the same label is used wherever the route is reached from elsewhere in the app.
- AE2. **Covers R5, R7, R9.** Given an existing property with `fbSeats = 40` and the user has not yet entered an As-Improved value, when the user opens the As Improved subsection, then the As-Improved F&B seats input shows `40` as a faded placeholder and is empty for input. When the user types `80` and saves, then `fbSeatsImproved` is persisted as `80` and the As-Purchased `fbSeats` value `40` is unchanged.
- AE3. **Covers R3, R13.** Given the migration ships, when a downstream consumer (ICP analysis, Rebecca research, report export, slide factory, financial engine) reads the property, then the values returned for `fbSeats`, `fbVenues`, `eventSpaceSqft`, `totalBuildingSqft`, `marketTier` are byte-identical to what the consumer received before the migration. No consumer needs to be updated to keep working.
- AE4. **Covers R6, R8, R12.** Given a user fills both `description_purchased` and `description_improved` and saves, when they reload the page, then both narratives are displayed in their respective subsections in the order they were entered.

---

## Success Criteria

- A user analyzing a property transition (e.g., SFR → boutique hotel) can express both states without overloading single fields, and a reader of the page can tell at a glance which numbers are "today" vs "the plan."
- The breadcrumb rename and the visual restructure ship in a single PR with no behavioral change to any downstream consumer of the property record.
- A downstream agent (ce-plan, an implementer, or a reviewer) can pick up this doc and produce a small additive Drizzle migration + UI restructure without needing to re-derive the descriptor-catalog vision or the JSONB question — both are explicitly deferred and pointer-linked.

---

## Verification (required for implementation PRs)

Per CLAUDE.md §5, every implementation unit shipped under this milestone must run and pass:

- `pnpm run typecheck` — clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS.
- The relevant unit/integration test suite — PASS.
- Because R11 ships a Drizzle schema migration, `pnpm --filter @workspace/scripts run check:migration-guards` — PASS.
- Rebecca parity (R16): the corresponding tool exercises in `tests/rebecca-tools/` cover the new field set and pass.

---

## Scope Boundaries

- Descriptor catalog table, JSONB columns, accessor layer, dual-write, drift instrumentation, reader migration. **All deferred to Milestone B.** See `deferred-milestone-b.md`.
- Refinement of the six "look twice" enum fields (`market_tier`, `target_adr_band`, `f&b_service_model`, `glamping_unit_types`, `condition_rating`, `seasonality_pattern`) — Milestone A keeps the existing `marketTier` column behavior unchanged and does not introduce the other five.
- Per-property-type form variants (no use_class gating in the UI in this cut).
- LLM "Description Drafter" persona / Specialist for auto-generating the freeform descriptions (deferred — separate brainstorm).
- Any change to fields, sections, or behavior outside the top "Property Information" zone.
- Range-badge quality contract integration on the new fields (separate contract per `analyst-intelligence-display`).
- Visual redesign / new typography / new color treatments. The restructure is structural, not visual.
- Re-evaluation of ICP's existence or scope (raised by user, captured separately in `open-questions/icp-strategic-doubt.md` — not a blocker for Milestone A).

---

## Key Decisions

- **Two-milestone split, Milestone A first.** The architect (2026-05-11) flagged the original unified scope as misshaped — a UI regroup conflated with a high-risk JSONB migration that touches active data contracts in ICP, Rebecca research, exports, slide factory, and the financial engine `PropertyInput` type. Milestone A ships the visible value (the page restructure users actually want) without touching any storage contract. Milestone B captures the migration vision and ships when the dependency matrix and accessor layer can be built safely.
- **Additive typed columns for As-Improved fields, not JSONB.** Milestone A uses the existing Drizzle / drizzle-zod / OpenAPI codegen pattern this codebase already runs. JSONB-based descriptors remain the end-state vision in Milestone B; they are not introduced halfway in Milestone A.
- **Visual placeholder, not auto-population, for unset As-Improved fields.** Auto-populating would silently make the As-Improved value identical to As-Purchased on first save, hiding the distinction the page is built to surface. Faded placeholder gives the user the reference point without making the decision for them.

---

## Dependencies / Assumptions

- The existing Drizzle migration pipeline and the OpenAPI codegen workflow (`pnpm --filter @workspace/api-spec run codegen`) are unchanged and used as-is.
- The existing breadcrumb component (location not yet identified — implementer needs to locate it) is the single place to rename "Edit" → "Property Assumptions"; if the label is duplicated across multiple files, all occurrences are renamed.
- The existing description column on `properties` (whatever its name) is treated as the As-Purchased narrative; if naming clarity is preferred, it can be renamed to `descriptionPurchased` in the same migration.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R1] [Implementation discovery] Where is the breadcrumb label currently defined? `rg "breadcrumb"` in `pages/property-edit/` and `components/layout/` returned empty during the brainstorm. The implementer needs to locate the breadcrumb source — likely inline in `PropertyEdit.tsx` or a shared layout wrapper — before R1 can be sized.
- [Affects R12] [Implementation discovery] What is the existing description column's name on `properties`? The decision between "reuse and rename to `descriptionPurchased`" and "reuse without renaming, add `descriptionImproved` only" depends on what's there today.

### Deferred to Planning

- [Affects R11] [Technical] Final naming convention for the six new As-Improved typed columns — the doc proposes `<field>Improved`, but the existing codebase convention should be checked before locking.
- [Affects R7] [Product] Does "planned reopening year" belong only on As-Improved, or is there value in capturing both "last renovation year" (As-Purchased) and "planned reopening year" (As-Improved) side-by-side for clarity?
