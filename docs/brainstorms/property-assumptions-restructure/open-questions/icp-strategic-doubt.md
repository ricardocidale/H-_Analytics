---
date: 2026-05-11
status: OPEN — strategic doubt, no decision yet
raised_by: user
raised_during: ce-brainstorm — property-assumptions-restructure (Phase 2.5 architect review)
---

# Strategic doubt: is ICP something we need to pursue as-is?

## What the user said

> "I am not convinced ICP is something we need to pursue as-is."

Raised in response to the architect's review of the property-assumptions-restructure synthesis, which had flagged ICP analysis / config / prompt generation as one of the heaviest direct consumers of `properties.fbSeats`, `fbVenues`, `eventSpaceSqft`, `totalPropertyAcreage`, and `totalBuildingSqft` — and therefore one of the main reasons the JSONB migration (Milestone B) needs an accessor-first / dual-write / drift-instrumentation discipline.

## Why this matters

ICP's status materially changes the cost shape of Milestone B (descriptor-catalog / JSONB migration, see `../deferred-milestone-b.md`):

- **If ICP stays in current form** — it is a hard constraint on the migration. The accessor must serve ICP's exact field-access patterns; ICP's prompt-generation paths must be migrated to the accessor before any typed-column drop. ICP's complexity is a meaningful share of Milestone B's risk.
- **If ICP is rebuilt or scoped down** — the dependency matrix shrinks, the accessor surface shrinks, and Milestone B becomes cheaper.
- **If ICP is removed entirely** — the strongest single argument for accessor-first discipline weakens (other consumers like report export, Rebecca research context, slide factory, and engine `PropertyInput` remain, but their access patterns are simpler).

## What this brainstorm did with the doubt

- Captured it here as an open strategic question, NOT as a Milestone B blocker.
- Cross-referenced from `../deferred-milestone-b.md` § "Open design questions to resolve when Milestone B starts".
- Did NOT shrink Milestone A's scope on its account — Milestone A is UI-only and does not touch ICP.

## What needs to happen

Separate brainstorm before Milestone B is picked up:

- What is ICP doing today? (current consumers, current product surface, current value to users)
- What did we want ICP to do? (original intent vs current behavior — drift?)
- What would "ICP as-is is wrong" mean? (rebuild / scope down / remove / replace with what?)
- What is the cost of leaving ICP alone vs the cost of touching it?

This is a product/strategy brainstorm, not a technical one. It does not need to happen before Milestone A ships.

## Pointers

- Companion: `../deferred-milestone-b.md` (the descriptor migration that ICP's status affects)
- Companion: `../requirements.md` (Milestone A — UI-only, ICP-independent)
- Companion: `../opus-consult.md` (the schema vision Milestone B is built on)
