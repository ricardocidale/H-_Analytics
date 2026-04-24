# Claude Code / Replit Agent — Division of Labor

> **Revised 2026-04-22** — Tightens CC's coding lane after observed rewrite churn. CC now codes only by explicit delegation. See [Revision history](#revision-history) at the bottom for the full delta vs. the prior version.

## Rule

This project uses two AI coding agents. Each owns specific categories of
work. **Claude Code advises and plans; Replit Agent executes by default.**
Claude Code may write code only when Replit Agent explicitly delegates the
work, and only against an atomic execution packet that Claude Code itself
authored.

## Hard split

| Category | Owner | Reason |
|---|---|---|
| Audits, reviews, architectural decisions, plans, ADRs | **Claude Code** | Static analysis + multi-file context + authoritative rule checks |
| `.claude/**` docs, rules, session memory, skill files, handoff packages | **Claude Code** | Single source of truth for project knowledge |
| Atomic execution packets (the contract Replit consumes) | **Claude Code** | Decomposition is the load-bearing work; large audits without atomic packets cause rework |
| Pure refactors (type-only, docstring-only, constant-substitution across files) | **Replit Agent by default; Claude Code by explicit delegation only** | See [§ Explicit-delegation lane](#explicit-delegation-lane) |
| UI changes (React components, CSS, page layouts, user-facing text) | **Replit Agent** | Needs the running dev server to verify visually |
| Database schema changes (new columns, migrations, indexes) | **Replit Agent** | Needs the live Postgres instance to apply migrations |
| Seed data edits, seed backfill scripts | **Replit Agent** | Needs the live DB to verify no data loss |
| Environment variables, Replit Secrets, `.replit`, `replit.nix` | **Replit Agent** | Deployment-affecting; owned by the running container |
| Package-level changes (`package.json`, `npm install`) | **Replit Agent** | Changes the build/runtime |
| Feature implementation against an accepted ADR | **Replit Agent** | Default executor for all production code |
| End-to-end verification (clicking through flows, checking exports, browser smoke tests) | **Replit Agent** | Has the running browser session |

## How handoffs work

1. Claude Code writes a packet under `.claude/replit-handoffs/<phase>-<scope>.md`
   following the [packet template](../replit-handoffs/_TEMPLATE.md). The packet
   is **atomic** (one logical task per file, ≤7 sub-steps), with mandatory
   acceptance criteria per sub-step.
2. Claude Code commits the packet to `main`.
3. The user pastes a short prompt into Replit Agent: _"read
   `.claude/replit-handoffs/<name>.md` and execute the tasks in order. Commit
   each task separately with the `Surfaces:` footer. Run verification after
   each."_
4. Replit Agent reads the file, executes, verifies, commits, pushes.
5. Claude Code picks up the next audit pass from the updated `main`.

If a packet exceeds the atomic-task budget (>7 sub-steps, >3 files, or
mixes capability domains), it must be **split** into multiple packets
before being handed off. Long monolithic packets are the failure mode this
revision is designed to prevent.

## Explicit-delegation lane

Replit Agent may ask Claude Code to write code directly when one of the
following is true:

- The change is **cross-cutting** (touches >5 files in a way that requires
  whole-codebase context — e.g., a financial-engine constant rename, a
  vocabulary sweep, a deterministic type narrowing across surfaces).
- The change is **type-only** (interface widening/narrowing with zero
  runtime behavior change) and Replit has determined static-analysis
  context is the bottleneck.
- The change is **constant substitution** where the literal value is
  exactly identical (e.g., replacing `"2026-06-01"` with
  `DEFAULT_COMPANY_OPS_START_DATE`).
- The change is **docstring-only** in a `.tsx`/`.ts` file (comments only,
  no logic).

To invoke the lane, Replit Agent writes a `DELEGATE.md` sibling next to
the active packet (or session plan) naming the request: scope, files
expected to change, why CC's context is the right tool. Claude Code reads
it on the next pass and either executes (committing with a `Delegated-by:
Replit-Agent` trailer) or declines with a written reason. Even
delegated changes are verified by Replit afterward via the
`<phase>-verification.md` packet pattern.

**The lane is not the default.** If Replit can do the work itself within
the existing rules, it should. Each delegation is a budget item; track
them in `.claude/session-memory.md`.

## Doctrine Freeze Gate

No implementation phase begins until the doctrine governing it has been
**stable for one full session** (no edits to the relevant ADR, skill, or
architecture doc).

Concretely:

1. Before opening any `.claude/replit-handoffs/<phase>-*.md` packet for a
   new phase, the active ADR for that phase must have status `Accepted`
   (not `Proposed`, not `Draft`) and must have had no content edits since
   the prior session-memory entry.
2. If the ADR is still moving, the phase work is **paused** and the
   session pivots to doctrine stabilization.
3. If a packet uncovers a doctrine gap mid-execution, Replit files a
   `BLOCKED.md` sibling on the packet, and the session pivots to ADR
   revision before resuming code work.

Why: the rewrite tax in this codebase has historically come from coding
against unstable specs (ADR-006 went v0 → v1 → v2 in <24h while P5 was
mid-build). Freezing doctrine before coding eliminates the largest
single source of rework.

The gate is **off** for: bugfixes against shipped code, gate-failure
remediation, and `BLOCKED.md` resolution. It is **on** for: any new
phase, any net-new feature, any architectural refactor.

## Why

- **Safety** — UI and DB changes have hard-to-predict runtime effects.
  Claude can't click a button or run a migration; it can only read state
  snapshots. Replit has the running environment.
- **Decomposition is load-bearing** — the value Claude Code adds is not
  the LOC it writes, it's the atomic packet it produces. A 5,000-line
  audit doc handed to Replit without sub-task slicing produces
  improvisation, not execution. Keep the packet contract; reduce the
  direct-commit surface.
- **Doctrine stability is upstream of code stability** — code written
  against a moving spec is rework waiting to happen. The Freeze Gate puts
  the cost of doctrine churn in the doctrine phase, not the code phase.
- **Auditability** — the packet MD file is the contract. Every change
  has a reviewable spec.

## Guardrails (both agents must respect)

1. **Claude never pushes UI or DB migrations to `main`.** If Claude finds
   such a change is needed mid-audit, it writes a packet and stops.
2. **Replit never silently diverges from the packet.** If Replit sees
   a problem during execution, it must file a comment on the packet
   (or a `BLOCKED.md` sibling file) and stop — not improvise.
3. **Every commit gets a `Surfaces: S?, S?, …` footer** so the reviewer
   can confirm dependency-surface coverage.
4. **Pre-commit verification is BLOCKING, not optional.** Every commit
   (Claude or Replit) must pass all five gates in
   `.claude/rules/pre-commit-verification.md`: `tsc --noEmit`, `npm run
   lint`, vocabulary test, `npm run test:summary`, `npm run
   verify:summary` (UNQUALIFIED). No `--no-verify`. No "I'll fix the
   failing test in a follow-up." A failing gate means the commit does
   not land — either root-cause it now or file a BLOCKED.md and escalate.
5. **Before editing any file, read `cross-check-invariants.md`.** Every
   edit touches multiple surfaces. The rule lists the invariant pairs
   (change type X → also check Y) drawn from real failures we've hit.
6. **Every packet's "Verification" section is a checklist, not a
   suggestion.** Replit must run every step listed in a packet's
   verification block. If a step is skipped, it must be explicitly
   flagged in the completion report with the reason.
7. **Doctrine Freeze Gate is on by default for new phases.** See
   [§ Doctrine Freeze Gate](#doctrine-freeze-gate).
8. **Atomic packet budget.** No packet exceeds 7 sub-steps or 3 files
   without being split. If split is required, packets get suffixes
   (`-a`, `-b`, …) and a parent index file lists them in dependency
   order.

## When Replit CAN edit `.claude/` docs directly

Only when:

- Appending to `.claude/session-memory.md` with session-end notes (≤5 lines).
- Adding a `BLOCKED.md` sibling to a packet file when stuck.
- Adding a `DELEGATE.md` sibling to a packet to request the
  [explicit-delegation lane](#explicit-delegation-lane).

All other `.claude/**` content is Claude Code's authoritative domain.

## How to detect violations

- Commit author + Surfaces footer tell you who did what.
- `git log --author="Agent"` shows Replit auto-commits.
- A commit that modifies `.claude/rules/*.md` by Replit = violation.
- A commit that modifies `.replit` or `package.json` by Claude = violation.
- A commit that lands feature code while its governing ADR has changed in
  the same session = Doctrine Freeze Gate violation.
- A packet exceeding 7 sub-steps that wasn't split = atomicity violation.

## Session-start checklist (both agents)

On every session start:

1. Read `.claude/claude.md` (loaded automatically).
2. Read `.claude/session-memory.md` for recent context.
3. Read this rule (`claude-replit-split.md`) if the task spans both domains.
4. Check `.claude/replit-handoffs/` for pending work packages.
5. Check `.claude/audit-inventory.md` for the active dependency surface map.
6. Check the active ADR(s) for the current phase — if any has been edited
   this session, the [Doctrine Freeze Gate](#doctrine-freeze-gate) applies.

## Scope

Applies to every code change in this repo made by either agent. If a human
commits directly (e.g., via the GitHub UI), this rule does not bind them —
but they should still prefer the packet pattern for any UI/DB work.

---

## Revision history

### 2026-04-22 — Tightened CC coding lane after rewrite-churn review

Triggered by the project owner's observation that "the current dynamic is
producing a lot of rewrites" + an architect (Opus) evaluation that
identified the root cause as **doctrine instability + packet-decomposition
gaps**, not CC code quality.

Three deltas vs. the prior version:

1. **Pure refactors moved out of CC's automatic lane** into the new
   [Explicit-delegation lane](#explicit-delegation-lane). Replit codes by
   default; CC codes by request only. The four legacy auto-categories
   (type-only, docstring-only, constant-substitution, cross-cutting) all
   still permitted, but now require a `DELEGATE.md` to invoke.
2. **Doctrine Freeze Gate added** as Guardrail #7. New phases cannot start
   until the governing ADR has been stable for one session. Direct response
   to ADR-006 going v0→v1→v2 mid-P5-build.
3. **Atomic packet budget added** as Guardrail #8 + the [How handoffs
   work](#how-handoffs-work) section. Packets capped at 7 sub-steps / 3
   files; long packets must be split. The packet template at
   `.claude/replit-handoffs/_TEMPLATE.md` codifies the mandatory fields.

The previous version's permissive "When Claude CAN edit UI/DB files
directly" section was removed — its three categories (type-only,
docstring-only, constant renaming) are now subsumed under the
explicit-delegation lane.
