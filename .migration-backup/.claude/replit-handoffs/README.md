# Replit Handoff Directory

This directory holds structured packets written by the Claude Code audit
agent, intended for execution by Replit Agent.

> **2026-04-22 update:** All new packets must follow `_TEMPLATE.md`. Replit
> Agent codes by default; Claude Code only writes code via the
> [explicit-delegation lane](../rules/claude-replit-split.md#explicit-delegation-lane).
> No new phase opens until its governing ADR has cleared the
> [Doctrine Freeze Gate](../rules/claude-replit-split.md#doctrine-freeze-gate).

## Division of labor

- **Claude Code (offline, this repo)** — audits code, writes plans and
  ADRs, decomposes work into atomic execution packets. Documents decisions
  in `.claude/`. Writes code only by explicit delegation request from
  Replit (see `claude-replit-split.md`).
- **Replit Agent (in the running dev container)** — executes packets,
  runs UI/DB/migration work, verifies the app works by launching it,
  clicking through flows, and running the test suite. Has access to the
  live Postgres instance and Object Storage sidecar.

## Workflow

1. Claude Code writes a handoff file under `.claude/replit-handoffs/`
   describing a batch of tasks (or a verification request) with enough
   specificity that Replit Agent can execute without further clarification.
2. Claude Code commits the handoff to `main` so Replit sees it on pull.
3. The user pastes a short prompt into Replit Agent: _"read
   `.claude/replit-handoffs/<name>.md` and execute the tasks in order.
   Commit each task separately. Run verification after each."_
4. Replit Agent reads the file, executes, runs verification, commits.
5. Claude Code picks up the next audit pass from the updated state.

## File-naming convention

`<phase>-<scope>.md` — e.g. `phase-3-4-pending-tasks.md`,
`phase-2-verification.md`, `phase-6-db-migration.md`. One file per logical
batch; don't cram unrelated work together.

## What every packet must contain

See `_TEMPLATE.md` — every section marked **MANDATORY** is binding.
Quick summary:

1. **Title** matching the filename.
2. **Doctrine Freeze Gate check** — governing ADR is `Accepted` and stable.
3. **Context** — ≤200 words, with links to ADR + skills + audit inventory.
4. **Atomic-budget check** — ≤7 sub-steps, ≤3 files, ≤2 capability domains.
   Split the packet otherwise.
5. **Tasks** — each sub-step has files, change, surfaces, cross-check
   invariants, objective acceptance criteria, test impact, rollback notes.
6. **Verification** — gate commands + behavioral verification + surface-
   specific verification, all as checklists.
7. **Out of scope** — explicit list of what this packet does NOT do.
8. **Surfaces footer** template for every commit.
9. **Completion report** — filled by Replit on exit.

A packet missing any mandatory section must be returned for revision
before execution.

## Shared references Replit should always have loaded

- `.claude/claude.md` — master project doc
- `.claude/audit-inventory.md` — dependency surface map (S1–S13)
- `.claude/session-memory.md` — session log
- `.claude/rules/*.md` — 25 binding rules
- `.claude/rules/branding-vocabulary-enforcement.md` — vocabulary hard-rule
- `.claude/rules/no-hardcoded-values.md` — constants rule
- `.claude/rules/financial-safety.md` — NaN / Math.pow / dDiv patterns
