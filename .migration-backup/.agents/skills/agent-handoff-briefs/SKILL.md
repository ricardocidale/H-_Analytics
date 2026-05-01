---
name: agent-handoff-briefs
description: Write structured handoff packages when one agent (or session, or contributor) hands work to another. Use when crossing an ownership boundary — agent-to-agent, session-to-session, planner-to-implementer, or anywhere context will be lost without an explicit transfer document. Replaces "I'll just message them" with a reviewable contract.
---

# Agent Handoff Briefs

A discipline for treating cross-boundary work transfers as artifacts, not conversations. The brief is the contract: the receiver should be able to execute without coming back for clarification, and the sender's intent is auditable later.

## When to use

- Two AI agents share a project (e.g., one plans + reviews, another executes UI / DB changes).
- One agent's session ends and another starts on the same workstream.
- A long-running task spans multiple PRs and the next PR will be done by someone else.
- A planner / architect drafts work for an implementer.
- A reviewer needs to surface follow-ups too large to inline in a code review.

## When NOT to use

- Trivial tasks completable in a single message exchange.
- Pair-programming sessions where context is shared in real time.

## Where briefs live

A predictable directory the receiver knows to check. Examples:

- `docs/handoffs/`
- `.claude/replit-handoffs/`
- `tasks/handoffs/`

Filename pattern: `<phase>-<scope>.md` (e.g., `phase-1b-analyst-skills.md`). Date-prefix only when the same scope might be re-handed-off across phases.

## Required sections

A complete brief has six sections. Skipping any of them is the most common cause of receiver-side confusion.

### 1. Header

```
**From:** <sender role / agent / contributor>
**To:** <receiver role / agent / contributor>
**Date:** YYYY-MM-DD
**Context:** link(s) to prior work, parent task, or session memory
**Why this is a handoff:** the boundary being crossed (agent split,
ownership rule, session reset)
```

### 2. Scope of work

A short paragraph naming the deliverables and the bounds. "Three new files under X. Zero changes to Y or Z."

### 3. File-by-file specification

For each file the receiver will touch:

- File path (or pattern).
- What it should contain (template, structure, key invariants).
- Approximate length (rough line count keeps the receiver from over- or under-investing).
- References to prior art the file should pull from.

This is the **executable** part of the brief. If the receiver can't act without asking questions, this section is too thin.

### 4. Verification

The exact commands the receiver must run before declaring done. Not "make sure tests pass" — the literal commands, with expected output.

```
1. `npm test` — exit 0
2. `npm run lint` — exit 0
3. `npm run typecheck` — exit 0
```

### 5. What this handoff does NOT include

The negative space. Critical for two reasons:

- Prevents scope creep from the receiver who might infer adjacent work.
- Protects the sender's intent (e.g., "do not refactor X — that's a separate task").

### 6. Definition of done

What concrete artifact / message / state signals "handoff complete":

- A commit on a specific branch with a specific message footer.
- A note appended to a session-memory file.
- A reply on a specific channel.

Without this, "done" is fuzzy and the next phase blocks on the wrong signal.

## Quality bar

A good brief:

- Is **complete enough to execute** without follow-up questions.
- Names what's **out of scope** as explicitly as what's in.
- Lists **verification commands** the receiver can copy-paste.
- References the **canonical sources** (architecture docs, ADRs, rules) the receiver should respect.
- Is **honest about ambiguity** — if a decision is undecided, say so and propose options.

A bad brief:

- Says "see the discussion in chat" instead of restating the relevant points.
- Mixes unrelated workstreams in one document.
- Assumes the receiver shares the sender's mental context.
- Has no verification section.
- Has no "out of scope" section, so the receiver does too much (or too little).

## Common patterns

### Plan-then-execute

The planner writes a brief enumerating tasks; the implementer executes them sequentially, committing each separately with a footer. Common in agent-pair workflows.

### Phase-handoff

A multi-phase initiative where each phase has its own brief and the receiver of phase N is the sender of phase N+1's verification.

### Cross-domain handoff

One agent / contributor owns one domain (e.g., docs, planning) and another owns a different domain (e.g., UI, DB). The brief crosses the boundary that ownership rules forbid editing across.

### Blocked-and-escalate

Mid-work, the receiver hits something out-of-scope or ambiguous. They drop a `BLOCKED.md` sibling next to the brief and stop, rather than improvise. The sender sees the BLOCKED.md and replies with guidance.

## Anti-patterns

- **"I'll just paste it in chat"** — chat is ephemeral; the brief is auditable.
- **"The receiver can figure it out"** — every minute the sender saves writing the brief costs the receiver ten minutes (and possibly a wrong-direction commit) executing.
- **Burying the verification commands** — they should be a copy-paste block, not prose.
- **Not naming what's out of scope** — receiver inflates scope and creates merge conflicts with the next phase.

## Composition with other skills

- **`pre-commit-gates`** — every brief's verification section should mandate the gates.
- **`cross-check-invariants`** — briefs should call out which invariant pairs the work touches.
- **`architecture-decision-records`** — briefs that introduce irreversible change reference (or include) an ADR.
