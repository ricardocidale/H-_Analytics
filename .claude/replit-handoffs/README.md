# Replit Handoff Directory

This directory holds structured task packages written by the Claude Code
audit agent, intended for execution by Replit Agent.

## Division of labor

- **Claude Code (offline, this repo)** — audits code, writes plans, makes
  pure-code refactors that don't touch running UI or DB state. Commits and
  pushes to `main` on its own. Documents decisions in `.claude/`.
- **Replit Agent (in the running dev container)** — executes UI changes,
  database migrations, seed updates, and verifies the app works by
  launching it, clicking through flows, and running the test suite. Has
  access to the live Postgres instance and Object Storage sidecar.

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

## What every handoff must contain

1. **Context** — one paragraph plus a link to `.claude/audit-inventory.md`
   for the full surface map.
2. **Task list** — each task with: file path, line numbers, exact
   before/after or precise instruction, affected dependency surfaces
   (S1–S13 — see inventory), expected test impact.
3. **Verification steps** — concrete commands (`npm run …`), URLs to hit
   in the dev server, things to look for in the UI.
4. **Rollback notes** — any task that touches DB or deployment config
   includes how to back out if something breaks.

## Shared references Replit should always have loaded

- `.claude/claude.md` — master project doc
- `.claude/audit-inventory.md` — dependency surface map (S1–S13)
- `.claude/session-memory.md` — session log
- `.claude/rules/*.md` — 25 binding rules
- `.claude/rules/branding-vocabulary-enforcement.md` — vocabulary hard-rule
- `.claude/rules/no-hardcoded-values.md` — constants rule
- `.claude/rules/financial-safety.md` — NaN / Math.pow / dDiv patterns
