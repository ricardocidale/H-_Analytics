---
date: 2026-05-11
status: RESOLVED — superseded by `docs/brainstorms/icp-simplification/requirements.md`
raised_by: user
raised_during: ce-brainstorm — property-assumptions-restructure (Phase 2.5 architect review)
resolved_on: 2026-05-11
resolved_by: ce-brainstorm — icp-simplification
---

# Strategic doubt: is ICP something we need to pursue as-is? — RESOLVED

> **Resolution (2026-05-11).** No, not as-is. ICP is being radically simplified from a per-company ~70-field freeform profile into a small catalog of 3–5 reusable, market-inferred ICP brackets that mix to drive Management Company revenue and expense calculations. Hotels consume all Mgmt Co services; STRs consume only marketing, branding, and performance-bonus fees. Vendor pass-through costs and Mgmt Co markup factors come from national research as % of revenue. See **`docs/brainstorms/icp-simplification/requirements.md`** for the full design contract, R-IDs, scope boundaries, and the sized follow-up implementation tasks.
>
> The dependency matrix Milestone B (`../deferred-milestone-b.md`) was protecting around ICP shrinks meaningfully under the bracket model — ICP no longer consumes `properties.fbSeats / fbVenues / eventSpaceSqft / totalPropertyAcreage / totalBuildingSqft` at the per-field grain the current pipeline does. The deferred Milestone B doc has been updated accordingly.

---

## What the user said (original framing)

> "I am not convinced ICP is something we need to pursue as-is."

Raised in response to the architect's review of the property-assumptions-restructure synthesis, which had flagged ICP analysis / config / prompt generation as one of the heaviest direct consumers of `properties.fbSeats`, `fbVenues`, `eventSpaceSqft`, `totalPropertyAcreage`, and `totalBuildingSqft` — and therefore one of the main reasons the JSONB migration (Milestone B) needs an accessor-first / dual-write / drift-instrumentation discipline.

## Why this mattered (preserved for context)

ICP's status materially changed the cost shape of Milestone B (descriptor-catalog / JSONB migration, see `../deferred-milestone-b.md`):

- **If ICP stayed in current form** — it was a hard constraint on the migration. The accessor would have to serve ICP's exact field-access patterns; ICP's prompt-generation paths would have to be migrated to the accessor before any typed-column drop. ICP's complexity would be a meaningful share of Milestone B's risk.
- **If ICP was rebuilt or scoped down** — the dependency matrix would shrink, the accessor surface would shrink, and Milestone B would become cheaper. **← This is the path taken.**
- **If ICP was removed entirely** — the strongest single argument for accessor-first discipline would weaken (other consumers like report export, Rebecca research context, slide factory, and engine `PropertyInput` remain, but their access patterns are simpler).

## Pointers

- **Resolution doc:** `docs/brainstorms/icp-simplification/requirements.md`
- Companion: `../deferred-milestone-b.md` (the descriptor migration that ICP's status affects — updated with the shrunken dependency matrix note)
- Companion: `../requirements.md` (Milestone A — UI-only, ICP-independent)
- Companion: `../opus-consult.md` (the schema vision Milestone B is built on)
