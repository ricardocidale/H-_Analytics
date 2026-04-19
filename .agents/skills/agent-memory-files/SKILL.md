---
name: agent-memory-files
description: Maintain persistent agent memory files (CLAUDE.md, AGENTS.md, replit.md, .cursorrules, copilot-instructions.md) so they stay accurate, scoped, and consistent. Use when a project has one or more such files and you are about to add facts, fix drift between them, or decide what belongs where. Replaces the "just dump everything in CLAUDE.md" reflex with a deliberate scope and harmonization discipline.
---

# Agent Memory Files

Most modern repos carry one or more persistent files that are auto-loaded into an agent's context every session: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `replit.md`, `.github/copilot-instructions.md`, and so on. They are the cheapest, highest-leverage way to make an agent reliable across sessions — and the easiest place to accumulate stale, contradictory, or bloated content. This skill is the discipline for treating them as engineering artifacts, not scratchpads.

## When to use

- Adding a new architectural fact, rule, or convention that the agent must know in *every* future session.
- A project carries two or more agent memory files and they are starting to disagree.
- Onboarding a project that already has one of these files and you need to know whether to extend it or create a sibling.
- Auditing why an agent keeps making a mistake the project clearly knows better than to make — usually the rule is buried, contradicted, or simply absent from memory.

## When NOT to use

- One-off task notes — those belong in a session memory file (`.claude/session-memory.md`) or a session plan, not the always-loaded memory.
- Detailed how-to content that only matters when a specific task is active — that's a *skill*, not a memory file. Memory files should *route to* skills, not duplicate them.
- Personal scratchpads — those are not memory files and should not be checked in.

## What belongs in an agent memory file

Five categories, in priority order:

1. **Identity** — what the project is, who it serves, what it must never become.
2. **Inviolable rules** — invariants that, if broken, cause production losses. The kind of thing where "the agent should have known" is the post-mortem.
3. **Vocabulary** — terms the project uses with precision and the forbidden alternatives. (Often the source of the worst recurring agent mistakes.)
4. **Routing** — pointers to deeper docs, skills, ADRs, or rule files. The memory file is the *index*, not the *content*.
5. **Recent significant changes** — the last few notable shifts, dated, so the agent doesn't act on stale assumptions.

What does **not** belong:

- Long tutorials or how-tos (link to a doc/skill instead).
- Per-feature implementation details (link to a skill or the source).
- Session-by-session decisions (use a session memory file).
- Anything that changes weekly (it will go stale and contradict newer truth).

## The drift problem (and how to prevent it)

When a project has more than one memory file (e.g., `CLAUDE.md` for Claude, `AGENTS.md` for OpenAI/Codex, `replit.md` for Replit Agent, `.cursorrules` for Cursor), drift is the default state. Fixes:

### Designate one canonical source

Pick one file as authoritative for shared facts. The others reference it explicitly: "When in doubt, X is authoritative." Pick the file owned by the agent that does the most heavy code work.

### Mirror, don't fork

Shared sections (Identity, Inviolable Rules, Vocabulary, Routing) should appear in both files with **identical wording**. Each file gets to add agent-specific extras. If the wording diverges, that's a bug — fix it before any other commit lands.

### A drift inventory before any edit

Before adding to one memory file, search the others for related content. If the new content overlaps existing content elsewhere, harmonize first, add second.

### A "harmonize" pass per session

When a session touches any memory file, end with a quick scan: do all memory files agree on the things they're each making claims about? If not, fix it in the same commit.

## Common drift sources

- **Counts** (file counts, test counts, skill counts). Use approximations (`~1,200 source files`) rather than precise numbers that go stale within a week, or back the number with a script that the gates regenerate.
- **Commit / verification rules**. The single highest-impact mistake — one file says "always run the gates", the other says "use `--no-verify`". The agent picks the lazier rule.
- **Vocabulary tiers**. Two-tier vs three-tier explanations of the same concept (e.g., constants/defaults/assumptions) cause real production bugs because the agent collapses tiers it doesn't know exist.
- **Routing tables** (skill catalogs, rule indices). Add a skill in one file, forget the other, and the agent stops finding it.
- **Persona / voice rules**. The same persona described two different ways across files produces inconsistent user-facing copy.

## Anti-patterns

- **"Just append"** — every new fact appended to the bottom, no harmonization, no de-duplication. After 6 months the file is 1,500 lines and contradicts itself.
- **One file per agent with zero shared structure** — drift is guaranteed. At minimum, agree on section headers across files so a sync diff is possible.
- **Deep how-to content inline** — the file becomes too long to load efficiently. Move it to a skill and link.
- **Undated "recent changes"** — without dates, every entry looks current, so stale entries are trusted as if they're new.
- **Editing one memory file without checking the others** — the most common cause of drift. Make the cross-check mandatory.

## A workable structure

Both (or all) files share a header and these sections in this order:

1. Project summary (1 paragraph)
2. Identity — who builds it, who it serves, what it is not
3. Business model / domain model (only if non-obvious)
4. Inviolable rules (numbered, terse)
5. Vocabulary (canonical terms + forbidden alternatives)
6. Routing — links to docs, skills, ADRs, rules
7. Recent significant changes (dated, last 3–6 entries, prune old)

Agent-specific extras go *after* this shared core, clearly demarcated.

## Maintenance cadence

- **Per task**: if you added a rule the agent must always honor, add it to memory.
- **Per session end**: if any architectural shift landed, update Recent Changes (dated) and trim entries older than ~6 weeks.
- **Per quarter**: full audit — re-read every line, prune stale routing, collapse duplicate rules, verify counts.

## Composition with other skills

- **`pre-commit-gates`** — a memory-file edit is a commit and the gates apply.
- **`agent-handoff-briefs`** — handoffs reference the canonical memory file; never duplicate its content into the brief.
- **`architecture-decision-records`** — when a memory rule encodes an irreversible decision, an ADR is the source of truth and the memory file routes to it.
- **`cross-check-invariants`** — the cross-check discipline applies inside the memory file too: every rule in one section may have an invariant pair somewhere else.
