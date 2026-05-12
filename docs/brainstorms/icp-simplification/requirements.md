---
date: 2026-05-11
topic: icp-simplification
scope: Simplify ICP from a per-company ~70-field schema into 3–5 reusable, market-inferred ICP brackets that drive Management Company revenue and expense calculations. Brackets are characterized by ICP-research agents from real hospitality brand comps. Hotels consume all Mgmt Co services; STRs only marketing/branding/performance bonus. Vendor pass-through costs and Mgmt Co markup factors come from national research as % of revenue.
companion_docs:
  - ../property-assumptions-restructure/open-questions/icp-strategic-doubt.md (the strategic doubt this brainstorm resolves)
  - ../property-assumptions-restructure/deferred-milestone-b.md (dependency matrix shrinks under this design)
status: REQUIREMENTS — awaiting follow-up implementation tasks
---

# ICP Simplification — Requirements

## Summary

Replace the current per-company ~70-field ICP definition with a small set of 3–5 reusable ICP brackets characterized from real hospitality brand comps in the market. Brackets, not freeform fields, drive the Management Company's revenue and expense calculations. Hotels consume all Mgmt Co services; STRs consume only marketing, branding, and performance-bonus fees. Vendor pass-through costs and Mgmt Co markup factors are sourced from national research as percent of revenue, not authored per-company.

---

## Problem Frame

The current ICP system was built as if each Management Company needed a fully-defined, freeform Ideal Customer Profile authored from scratch. That intent produced a heavy stack:

- A ~70-field typed schema in `lib/shared/src/icp-types.ts` (mirrored at `lib/db/src/icp-types.ts`) covering rooms, suites, baths, land, building, dining, events, parking, kitchen, maintenance, staff quarters, ~25 priority-ranked amenities (`pool`, `spa`, `sauna`, `coldPlunge`, `tennis`, `vineyard`, `chapel`, `wineCellar`, …), condition, access, proximity, and ~30 financial dimensions.
- A multi-stage server pipeline in `artifacts/api-server/src/ai/icp/` — `portfolio-analysis.ts` (deterministic aggregates over the company's existing portfolio), `config-builder.ts` (a 259-line FALLBACK constants block that hand-derives the ~70 fields from those aggregates), `prompt.ts` (an LLM prompt that asks for 10 qualitative descriptive sections plus an investor essay), `narrative.ts`, `fallback-descriptive.ts`, `orchestrator.ts`.
- Four client pages — `Icp.tsx` (420 lines), `IcpStudio.tsx` (628), `CompanyIcpDefinition.tsx` (623), and the four tabs in `pages/icp/` (Profile, MarketContext, IndustryStandards, DataSources). 3,079 LOC across the whole ICP surface.

What the user actually needs from ICP is much narrower. The Management Company's financial calculations only need to know what *kind* of customer property each company serves so the right revenue lines and the right service-consumption assumptions flow through. The user's 6 hand-picked brand comps plus the comps the agents discovered already encode the answer — the market has 3–5 recognizable customer-property archetypes, and most Mgmt Co business is a mix of them. Authoring a bespoke ~70-field profile per Mgmt Co is overbuilt for that calculation. It is also the heaviest direct consumer of the property descriptors that Milestone B of the property-assumptions-restructure migration must protect (see `../property-assumptions-restructure/open-questions/icp-strategic-doubt.md`), so its size is paid for twice — once in maintenance, once in migration risk.

---

## User direction (2026-05-11) — verbatim source of truth

> What I have to say about ICP is that we need to keep it simple and base the ICP to be used by the Management Company financial calculations in the market research and tables that show the other hospitality brands that are on the market. By understanding these companies that I provided 6 names and you found many more, you can provide the user with a fairly good estimate of what their ICP companies look like. You can even have 3 to 5 ICP brackets so that you can mix them when calculating what the revenue and expenses will be as far as influenced by the ICP for the management company. As far as services sourced by ICP companies the app should assume that hotels will consume all the services and the STR will only pay for marketing, branding and performance bonus type of fees. That is enough. All the complexity of defining an ICP by the admin or the app AI should be simplified and the agents working on ICPs should focus on looking at competitors and similar companies that are in the market and what kind of customer properties they have. If they own the properties or not is not relevant because you want to know the revenue side most of all. As far as vendor costs for pass-through services the app should do a national research and establish these costs as percentage of revenue and similarly for the markup factors to be used by the management companies to charge these services to clients properties.

This block is the design contract for everything below. Where any requirement appears to soften it, the verbatim text wins.

---

## Requirements

**Bracket model**
- R1. ICP is represented as a small fixed catalog of 3–5 reusable **ICP brackets**, not as a per-company freeform profile. The exact count is decided during planning (see Outstanding Questions); the model must accept any count in `[3, 5]` without code changes per bracket.
- R2. Each Management Company's effective ICP is a **mix** of brackets — a weighted distribution across the catalog (weights sum to 1.0). A company can have 100% of one bracket or any blend.
- R3. Brackets are **shared across all Management Companies** in the system. Brackets are not Mgmt-Co-scoped. Per-company customization is captured only via the bracket mix (R2).
- R4. Each bracket has a **minimum stored field set** sufficient to drive Mgmt Co revenue and expense calculations. The minimum set is: bracket id, human-readable name, customer-property archetype label (e.g., "boutique upscale hotel", "branded STR cluster"), service-consumption profile (R8/R9), target revenue band per customer property (ADR/RevPAR or equivalent), and the bracket's comp-set name list. The 70-field schema is NOT the minimum set.

**Bracket inference from market comps**
- R5. Brackets are characterized by an ICP-research agent from real hospitality brand comps in the market — the 6 brand names the user provided plus the additional comps the agents discover. The agent's job shifts from "define an ICP for THIS company" to "characterize the brackets that exist in the market."
- R6. Whether the comp companies own the properties they serve is **out of scope** for bracket characterization. The signal the agent extracts is the revenue side — what kind of customer property each comp serves and at what price band — not the asset side.
- R7. Bracket assignment to a Management Company (the mix in R2) starts from agent inference based on the company's stated comps and existing portfolio, and is editable by the user. The default mix is never silent — the user sees which brackets the agent picked and why, and can adjust.

**Service-consumption rules baked into the model**
- R8. **Hotels consume ALL Management Company services.** Every Mgmt Co service line applies to a hotel-customer-property bracket by default. No per-company toggle is required to model a standard hotel relationship.
- R9. **STRs consume ONLY marketing, branding, and performance-bonus fees.** All other Mgmt Co service lines are zero by default for an STR-customer-property bracket. This is a hard product rule, not a per-company default the user has to configure.
- R10. The hotel-vs-STR distinction is a **property of the bracket**, not of the Management Company. A Mgmt Co with a 70/30 hotel/STR bracket mix automatically gets the blended service-consumption profile.

**National research drives pass-through cost and markup factor**
- R11. **Vendor cost for pass-through services** that flow through the Management Company is sourced from national research and stored as **percent of revenue**. It is not authored per-company and not authored per-bracket — it is a single national number per service line, refreshable from research.
- R12. **Markup factor** the Management Company applies on those pass-through services to charge them to client properties is also sourced from national research and stored as **percent of revenue** (or as a percent multiplier on R11, planning to choose). It is not authored per-company.
- R13. The vendor-cost and markup-factor research outputs are surfaced in `Admin → AI → Intelligence → Knowledge & Resources → Tables` per the 2026-05-11 Knowledge & Resources contract, with the standard read-only Admin treatment, accordion row + status, and the Analyst (regenerate) button on the Tables card.
- R14. Brackets reference these national pass-through cost and markup factor tables by name; they do not duplicate the values. If a national value updates, every bracket that references it sees the new value on the next calculation.

**Agent + minion roles (naming per `slide-factory` skill)**
- R15. The ICP-research agent that characterizes the bracket catalog from market comps is a **named cross-app Specialist** (single first name, Brazilian or Italian per `slide-factory`). It is registered with `role`, `short_description`, `long_description` per the agent taxonomy in CLAUDE.md §10.
- R16. The deterministic helpers that aggregate comp data, validate the bracket schema, and assign a Mgmt Co's bracket mix are **minions** (single first names, no LLM, no judgment). The bracket mix assigner is deterministic given the comp set and the Mgmt Co's portfolio inputs.

**What stays, what shrinks, what goes**
- R17. The current `lib/shared/src/icp-types.ts` ~70-field schema (and its `lib/db/src/icp-types.ts` mirror) is **superseded** for new ICP storage by the bracket model. It is not deleted in v1 — see R20.
- R18. The current server pipeline (`artifacts/api-server/src/ai/icp/orchestrator.ts`, `config-builder.ts` 259-line FALLBACK block, `portfolio-analysis.ts`, `prompt.ts`, `narrative.ts`, `fallback-descriptive.ts`) is **not the right shape** for the bracket model and is replaced rather than extended. The bracket model has its own much smaller orchestrator + prompt + minions.
- R19. The four client pages (`Icp.tsx`, `IcpStudio.tsx`, `CompanyIcpDefinition.tsx`, `pages/icp/{Profile,MarketContext,IndustryStandards,DataSources}Tab.tsx`) are reduced as follows. **Kept (refactored, not deleted):** `IcpMarketContextTab.tsx` — its comp-set table and brand cards become the bracket's "evidence panel" inside the new bracket-mix page; `IcpDataSourcesTab.tsx` — collapsed into a single link block that points into `Admin → AI → Intelligence → Knowledge & Resources` (the data-source inventory itself moves there per R13/R21). **Removed (deleted from the codebase, not just hidden):** `IcpProfileTab.tsx` (the 70-field freeform editor), `IcpIndustryStandardsTab.tsx` (the industry-standards tab as currently shaped), `CompanyIcpDefinition.tsx` (replaced by the bracket-mix page from follow-up task #7), and any other UI that asks the user or admin to author the ~70-field schema directly. `Icp.tsx` and `IcpStudio.tsx` are reduced to whatever remains after the kept components are extracted; if nothing remains, they are deleted.
- R20. **Migration of existing per-company ICP records** is read-only preservation: existing records are kept in their current storage as legacy reference data, surfaced read-only on a deprecated tab, and not used for any new financial calculation. New calculations read only the bracket mix. There is no automatic backfill from the 70-field schema into a bracket assignment — the agent runs against the company's comps to produce the bracket mix from scratch on first open.

**Front-of-app vs Admin discipline**
- R21. The bracket catalog itself, the national pass-through cost table, and the national markup-factor table all live in Admin (per the Knowledge & Resources contract and the front-of-app-admin-isolation rule). Front-of-app surfaces a Mgmt Co's bracket mix and the resulting calculation outputs only — never the raw national tables, never an editor for the bracket catalog.
- R22. The Mgmt Co page that shows the bracket mix uses the standard analyst-research-buttons pattern to (re)run the bracket-assignment minion against the Mgmt Co's comps, and the standard analyst-intelligence-display range-badge contract for any bracket-derived range surfaced inline.

**Verification and parity**
- R23. Every new user-editable action in the bracket-mix UI is achievable through Rebecca in the same PR per CLAUDE.md §7. The agent-native parity map is updated.
- R24. No numeric literal introduced by this work encodes a business-model assumption per CLAUDE.md §1 / `no-magic-numbers`. The 3–5 bracket bounds, the hotel/STR service-consumption rules, the national pass-through cost percentages, and the national markup-factor percentages all live in named constants or admin-resourced tables, never as inline literals.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given the bracket catalog ships with 4 brackets, when a Management Company is opened for the first time, then its effective ICP is shown as a weighted mix across those 4 brackets summing to 1.0 — never as a freeform 70-field form. A second Management Company opened in the same session sees the same 4 brackets, with its own mix.
- AE2. **Covers R8, R9, R10.** Given a Mgmt Co with bracket mix 70% hotel-bracket / 30% STR-bracket, when revenue and expense calculations run, then 70% of the customer-property weight contributes to all Mgmt Co service lines, and 30% contributes only to the marketing, branding, and performance-bonus lines. No user toggle was required to produce that behavior.
- AE3. **Covers R5, R6, R7.** Given a new Mgmt Co with the user's 6 brand comps entered, when the ICP-research Specialist runs, then it returns a proposed bracket mix with a one-line rationale per bracket that cites the comps, AND no part of the rationale references whether those comps own their properties.
- AE4. **Covers R11, R12, R13, R14.** Given the national pass-through cost table is updated in Admin from new research, when a Mgmt Co's calculation re-runs, then every bracket's pass-through cost contribution reflects the new percentages immediately, with no per-bracket edit and no per-company edit.
- AE5. **Covers R20.** Given a Management Company that already has a legacy 70-field ICP record from before this work, when the user opens the company, then the new bracket-mix UI renders against a fresh agent-derived mix, AND the legacy record is reachable on a clearly-labeled deprecated read-only tab, AND the legacy record contributes nothing to the financial calculation.
- AE6. **Covers R17, R18, R19.** Given the v1 ships, when a developer searches the codebase for the 259-line FALLBACK constants block in `config-builder.ts` or the 70-field freeform editor in `CompanyIcpDefinition.tsx`, then those code paths are no longer the calculation source — the bracket-model orchestrator is. (Whether the legacy code is deleted or left as inactive scaffolding behind the deprecated tab is a planning decision; the calculation source is unambiguous.)

---

## Success Criteria

- The Management Company financial calculations produce sensible revenue and expense estimates from a 3–5 bracket mix alone, with no user authoring of a 70-field profile.
- A user opening a new Management Company sees a useful proposed bracket mix derived from their stated comps within one Specialist run, and can adjust the mix without learning a new vocabulary.
- The hotel-vs-STR service-consumption rule is not a config the user can get wrong — it is a property of the bracket and applies automatically.
- A national research refresh of the pass-through cost or markup factor table updates every Mgmt Co calculation on the next run, with no per-company edit.
- The dependency matrix that property-assumptions-restructure Milestone B has to protect (see `../property-assumptions-restructure/deferred-milestone-b.md`) shrinks meaningfully — ICP is no longer the heaviest single direct consumer of `properties.fbSeats / fbVenues / eventSpaceSqft / totalPropertyAcreage / totalBuildingSqft`, because the bracket model does not consume per-property descriptors at the per-field grain the current ICP pipeline does.
- A downstream agent (ce-plan, an implementer) can pick this doc up and produce the bracket-catalog schema, the bracket-assignment minion, the national pass-through and markup tables, and the reduced UI without re-deriving the design.

---

## Scope Boundaries

- **Bracket boundaries themselves are not decided here.** The framework says 3–5 brackets characterized from the comp set; the actual archetype labels (e.g., "branded upscale hotel", "soft-brand boutique", "independent luxury", "performance-managed STR cluster", "agritourism / experiential lodge") are tuned during implementation with operator input.
- **The specific national-research source for vendor cost and markup factor is not picked here.** The pattern is an admin_resources entry per `external-data-source-integration` with a Costantino health probe; the source URL/API/scraper is research-design work in implementation. FRED is already wired but does not cover hospitality vendor costs at this granularity.
- **No code change to the existing ICP system in this task.** This is a docs-only brainstorm. Implementation is a separate set of follow-up tasks (sized below in `## Follow-up implementation tasks (sized, not created)`).
- **No changes to property descriptors on `properties`.** The property-assumptions-restructure milestones own that surface; this brainstorm only declares that the bracket model consumes far less of it.
- **No new orchestrator inside the slide factory.** The ICP-research Specialist is cross-app, not bound to a slide pipeline.
- **No re-litigation of Knowledge & Resources placement** — the national tables go where the 2026-05-11 contract says they go (Admin → AI → Intelligence → Knowledge & Resources → Tables).

---

## Key Decisions

- **Brackets, not freeform profiles.** The user direction is explicit: 3–5 brackets that mix to drive Mgmt Co calculations. Per-company freeform ICP authoring is the wrong shape and is removed.
- **Service consumption is a bracket property, not a per-company toggle.** Hotels consume all services; STRs consume only marketing/branding/performance bonus. Encoding this on the bracket prevents the user from mis-modeling an STR as a full-service hotel.
- **National research, not per-company estimates, for pass-through cost and markup factor.** Captured as % of revenue. Single source per line item, refreshable.
- **Property ownership of the comps is irrelevant.** The bracket model cares about the revenue side — what kind of customer property the comp serves — not the asset side. This is a deliberate narrowing of what the ICP-research agent reports.
- **Legacy 70-field records are preserved read-only, not migrated.** The bracket model is regenerated from comps; a backfill from the freeform schema would re-introduce the assumption that the freeform schema captured the right signal in the first place. It did not.
- **Bracket catalog and national tables live in Admin.** Per Knowledge & Resources + front-of-app-admin-isolation. Front-of-app shows mix and outputs only.

---

## Dependencies / Assumptions

- The `external-data-source-integration` pattern (admin_resources entry + scheduled minion fetcher + DB cache table + Rebecca tool + parity map entry + health probe) is the canonical way to add the two new national tables (vendor cost, markup factor). Costantino picks them up automatically once registered.
- The 2026-05-11 Knowledge & Resources contract (Tables under `Admin → AI → Intelligence → Knowledge & Resources`, accordion + Analyst button + read-only) is in force. Both new tables go there.
- The `slide-factory` skill agent-naming inventory is the source of truth for the new Specialist's name and the new minion names — names must be reserved before any code lands.
- The property-assumptions-restructure Milestone B deferred doc is updated alongside this brainstorm to reflect the smaller dependency matrix.
- The `analyst-research-buttons` and `analyst-intelligence-display` contracts apply to any front-of-app surface that triggers a bracket-mix re-run or shows a bracket-derived range.
- CLAUDE.md §1 (`no-magic-numbers`), §7 (agent-native parity), §10 (agent taxonomy), §11 (frontend design / NAI design system) apply to the implementation.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R1, R5][User decision] **Bracket count and shape.** The user said 3 to 5. Is the catalog tier-shaped (economy / midscale / upscale / luxury), property-type-shaped (boutique-hotel / agritourism / event-venue / glamping / STR), revenue-band-shaped, or hybrid? Recommend hybrid: each bracket is `(customer-property-archetype × revenue-band)` so the comp evidence and the calculation inputs both have a clean home. Needs user sign-off before R1's exact catalog can be drafted.
- [Affects R20][User decision] **Legacy ICP record preservation length.** Read-only deprecated tab — for how long? Forever (audit reference), one release window, or until the user says delete? Default proposed: keep for one release, then archive to cold storage and remove the tab.
- [Affects R7][User decision] **Default mix when the agent has low confidence.** If the comp set is sparse or contradictory, does the agent (a) propose its best mix with a low-confidence badge, (b) refuse and prompt the user to add comps, or (c) seed a 100%-weight default bracket and let the user adjust? Recommend (a) with a Fabio-style range-quality dot per `analyst-intelligence-display`.

### Deferred to Planning

- [Affects R11, R12][Needs research] What national research source(s) yield hospitality vendor pass-through cost as % of revenue and Mgmt Co markup factor as % of revenue at usable granularity? STR Global / CBRE / HVS / PKF / regional CVB reports are likely candidates; scrape vs API vs paid feed depends on what's accessible. Costantino-monitored admin_resources entry per `external-data-source-integration` once chosen.
- [Affects R12][Technical] Markup factor representation — store as `% of revenue` (parallel to vendor cost, additive) or as `multiplier on vendor cost` (e.g., 1.15× pass-through)? Affects how the calculation composes them. Planning decides after looking at the calc engine's existing fee composition.
- [Affects R4][Technical] Final minimum bracket field set — the requirement names six fields (id, name, archetype label, service-consumption profile, target revenue band, comp-set name list). Planning should sanity-check against the Mgmt Co revenue/expense calculation entry points to confirm nothing else is needed.
- [Affects R15, R16][Technical] Specialist and minion names — must come from the `slide-factory` reserved-names list. Reserve the names during planning before any agent code lands.
- [Affects R19][Technical] What exactly is kept of `IcpMarketContextTab.tsx` and `IcpDataSourcesTab.tsx`? The brainstorm says market context becomes the bracket's evidence panel and data sources becomes the link to Knowledge & Resources — planning resolves whether those tabs are renamed in place, refactored into the bracket-mix page, or replaced with new components.
- [Affects R8, R9][Product] Are there bracket types that fall *between* hotel and STR for service-consumption purposes (e.g., serviced apartments, branded residences, condotels)? The verbatim direction is binary; planning should ask the user before introducing a third category.

---

## Follow-up implementation tasks (sized, not created)

For the next round. Each is a candidate task; none is created in this work.

1. **Bracket catalog schema + seed (small).** Define the bracket model storage (table + Drizzle migration), seed 3–5 starter brackets with the minimum field set, register in Knowledge & Resources Tables card.
2. **National pass-through cost table — admin_resources + fetcher minion (medium).** Pick the source, register the admin_resources entry, build the fetcher minion + DB cache table + Costantino health probe per `external-data-source-integration`. Wire the Knowledge & Resources Tables card.
3. **National markup-factor table — admin_resources + fetcher minion (medium).** Same shape as #2 for the markup factor.
4. **ICP-research Specialist (medium).** New cross-app Specialist (Brazilian/Italian first name, reserved via `slide-factory`) that consumes a comp set and returns a proposed bracket mix with per-bracket rationale. Includes `role`, `short_description`, `long_description`. Excludes property-ownership signal per R6.
5. **Bracket-assignment minion + Mgmt-Co bracket mix storage (small-medium).** Deterministic minion that turns the Specialist's proposal into a stored mix (weights sum to 1.0); mix storage on the Management Company record; PATCH endpoint accepts edits.
6. **Mgmt Co revenue/expense calculation rewire (medium-large).** Replace the current ICP-driven inputs in the Mgmt Co calc paths with the bracket-mix-driven inputs; bake in the hotel-all / STR-marketing-only service-consumption rule as a bracket property; consume the national pass-through cost and markup factor tables. **Hard prerequisite:** tasks 1–5 merged.
7. **UI — bracket mix page on Management Company (medium).** Build the new bracket-mix page that replaces `CompanyIcpDefinition.tsx`. Owns: bracket-mix display + edit, analyst re-run button per `analyst-research-buttons`, range-badge treatment per `analyst-intelligence-display` (R22). Does **not** touch the kept tabs (those are task #8). Deletes `IcpProfileTab.tsx`, `IcpIndustryStandardsTab.tsx`, `CompanyIcpDefinition.tsx` per R19.
8. **UI — refactor market context tab into the bracket evidence panel; fold data sources into a Knowledge & Resources link block (small-medium).** Owns: `IcpMarketContextTab.tsx` refactor (becomes the bracket evidence panel embedded in #7's page), `IcpDataSourcesTab.tsx` collapse into the K&R link block. Does **not** touch the bracket-mix display itself (task #7) or any deleted tabs (task #7 owns deletions). Sequence: starts after #7's page scaffold lands so the evidence panel has a host; can run in parallel with #7's polish phase.
9. **Legacy 70-field ICP — read-only deprecated tab + cold-storage migration plan (small).** Per R20. Includes the audit-trail preservation decision from Outstanding Questions.
10. **Removal of obsolete pipeline (`config-builder.ts` 259-line FALLBACK, `prompt.ts`, `narrative.ts`, `fallback-descriptive.ts`, `portfolio-analysis.ts`, `orchestrator.ts`) (small).** Last in sequence — only after #6 calculation rewire ships and a clean run window has passed. Removes ~700 LOC of obsolete server code.
11. **Rebecca parity for the new bracket-mix UI (small, paired with #7).** Tools + parity map per R23 / CLAUDE.md §7.
12. **Cross-update property-assumptions-restructure Milestone B deferred doc once #6 ships (tiny).** Confirm the dependency matrix actually shrunk.

Sequencing:
- 1, 2, 3, 4, 5 are largely parallelizable.
- 6 blocks on 1–5.
- 7, 8, 9, 11 can run in parallel with or shortly after 6.
- 10 is the last code task.
- 12 is the closing doc task.
