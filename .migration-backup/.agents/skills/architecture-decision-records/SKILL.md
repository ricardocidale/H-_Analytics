---
name: architecture-decision-records
description: Write Architecture Decision Records (ADRs) to capture irreversible technical decisions, the alternatives considered, and the trade-offs accepted. Use when making any choice that future contributors will want to re-litigate but shouldn't have to re-derive — schema choices, dependency choices, pattern choices, naming conventions, tier boundaries.
---

# Architecture Decision Records (ADR)

A discipline for writing down *why* a decision was made, in just enough detail that the next contributor doesn't have to re-derive it from code archaeology. ADRs are cheap to write and expensive to skip.

## When to write one

Write an ADR for any decision that:

- Is **irreversible without significant cost** (schema shapes, public API contracts, dependency choices, persistence model).
- Will be **questioned later** ("why did we structure this as two services not one?").
- Trades off one approach against alternatives that look reasonable.
- Affects **multiple subsystems or contributors**.
- Locks in a vocabulary, naming convention, or boundary that the team will need to defend.

If a decision is reversible in a single PR with no migration cost, skip the ADR — a code comment is enough.

## When NOT to write one

- Routine implementation choices (which loop construct to use, file ordering).
- Decisions made by a coding-style guide already in effect.
- Choices the framework/runtime makes for you.

## Where ADRs live

`docs/architecture/decisions/` (or equivalent project-standard location). Numbered sequentially: `ADR-001-<short-slug>.md`, `ADR-002-...`. Numbers never reused, even for superseded ADRs.

## The template

```markdown
# ADR-NNN: <Title>

**Status:** Proposed | Accepted | Superseded by ADR-MMM | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** <names or roles>
**Tags:** <comma-separated>

## Context

What problem are we solving? What constraints apply? What forces are at play?
Keep this minimum-needed for future readers; link to other ADRs / docs rather
than restating them.

## Decision

What did we decide? State it plainly. Imperative or declarative voice
("We will…", "The system will…"), not aspirational ("We should consider…").
Multi-part decisions get enumerated. One ADR per orthogonal decision.

## Consequences

### Positive
- …

### Negative
- …

### Neutral / Notable
- …

## Alternatives considered

For each alternative: a short paragraph explaining what it was and why it
was rejected. The paper trail prevents future contributors re-litigating
out of ignorance.

## Implementation notes (optional)

Pointers to files, sequencing, migration concerns. Brief.

## References

- Related ADRs:
- Related architecture docs:
- External sources (RFCs, papers, vendor docs):
```

## Status lifecycle

- **Proposed** — under discussion, not yet binding.
- **Accepted** — the rule of the codebase. Edit the ADR only for clarifying typos; substantive changes mean a new ADR that supersedes.
- **Superseded by ADR-MMM** — replaced by a later decision. Keep the old ADR; never delete (the historical reasoning matters).
- **Deprecated** — the decision no longer applies but no replacement exists. Rare.

## Quality bar

A good ADR:

- States the decision in one sentence in the Decision section.
- Lists at least two real alternatives, each with a one-paragraph "what and why-rejected".
- Owns its **negative** consequences honestly. Decisions with no listed downsides are under-examined and the reviewer should push back.
- Links to the architecture docs it implements and the rule files it constrains.
- Reads in 3-5 minutes.

A bad ADR:

- Reads like a press release ("We are pleased to announce…").
- Lists only positive consequences.
- Has "alternatives" that are obviously straw-men.
- Re-derives the context the architecture doc already covers.
- Tries to be a tutorial ("first, ensure you have Node 18 installed…").

## When to update an existing ADR

Almost never. ADRs are immutable once Accepted, modulo:

- Typos and broken links.
- Adding a "Superseded by ADR-MMM" line in the status when a later ADR replaces it.
- Adding a backward-pointing "Note" if a later ADR amends without superseding.

Substantive change → new ADR. The historical decision context is the *value* of the ADR.

## Composition with other skills

- **`agent-handoff-briefs`** — handoffs that introduce irreversible change should reference (or write) an ADR.
- **`cross-check-invariants`** — locking in an invariant pair often warrants an ADR.
- **`pre-commit-gates`** — adding a gate is itself an architectural decision; consider an ADR.

## Common pitfalls

- **Writing the ADR after the fact, with rationalized reasons** — better to write it during the decision while the alternatives are fresh.
- **Treating ADRs as design documents** — ADRs capture decisions, not designs. Keep designs in dedicated architecture docs and link from the ADR.
- **Letting the ADR directory grow without an index** — once you have >10 ADRs, add an `INDEX.md` with title, date, status, tags.
