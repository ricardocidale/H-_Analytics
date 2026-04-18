# Claude Code / Replit Agent — Division of Labor

## Rule

This project uses two AI coding agents. Each owns specific categories of
work. **Claude Code plans; Replit Agent executes** when the work touches
running UI, the live database, or deployment config.

## Hard split

| Category | Owner | Reason |
|---|---|---|
| Audits, reviews, architectural decisions, plans | **Claude Code** | Static analysis + multi-file context + authoritative rule checks |
| Pure refactors (type-only, docstring-only, constant-substitution across files) | **Claude Code** | Zero-risk mechanical changes |
| `.claude/**` docs, rules, session memory, skill files, handoff packages | **Claude Code** | Single source of truth for project knowledge |
| UI changes (React components, CSS, page layouts, user-facing text) | **Replit Agent** | Needs the running dev server to verify visually |
| Database schema changes (new columns, migrations, indexes) | **Replit Agent** | Needs the live Postgres instance to apply migrations |
| Seed data edits, seed backfill scripts | **Replit Agent** | Needs the live DB to verify no data loss |
| Environment variables, Replit Secrets, `.replit`, `replit.nix` | **Replit Agent** | Deployment-affecting; owned by the running container |
| Package-level changes (`package.json`, `npm install`) | **Replit Agent** | Changes the build/runtime |
| End-to-end verification (clicking through flows, checking exports, browser smoke tests) | **Replit Agent** | Has the running browser session |

## How handoffs work

1. Claude Code writes a package under `.claude/replit-handoffs/<phase>-<scope>.md`
   with per-task file paths, line numbers, expected diffs, affected
   dependency surfaces (S1–S13 — see `.claude/audit-inventory.md`), and
   verification steps.
2. Claude Code commits the handoff to `main`.
3. The user pastes a short prompt into Replit Agent: _"read
   `.claude/replit-handoffs/<name>.md` and execute the tasks in order. Commit
   each task separately with the `Surfaces:` footer. Run verification after
   each."_
4. Replit Agent reads the file, executes, verifies, commits, pushes.
5. Claude Code picks up the next audit pass from the updated `main`.

## Why

- **Safety** — UI and DB changes have hard-to-predict runtime effects.
  Claude can't click a button or run a migration; it can only read state
  snapshots. Replit has the running environment.
- **Speed** — Claude can plan 10 tasks across 20 files in parallel;
  Replit executes one at a time but can verify each before the next.
- **Auditability** — the handoff MD file is the contract. Every change
  has a reviewable spec.

## Guardrails (both agents must respect)

1. **Claude never pushes UI or DB migrations to `main`.** If Claude finds
   such a change is needed mid-audit, it writes a handoff and stops.
2. **Replit never silently diverges from the handoff.** If Replit sees
   a problem during execution, it must file a comment on the handoff
   (or a `BLOCKED.md` sibling file) and stop — not improvise.
3. **Every commit gets a `Surfaces: S?, S?, …` footer** so the reviewer
   can confirm dependency-surface coverage.
4. **Type-check + test suite must pass after every commit** — both
   agents enforce this. No deferred fixes.

## When Claude CAN edit UI/DB files directly

Only when the change is one of:

- **Type-only** (e.g., changing `any[]` → `PropertyResponse[]` in a
  component props interface, with zero runtime behavior change).
- **Docstring-only** in a `.tsx`/`.ts` file (comments above the code,
  no logic).
- **Constant renaming** where the value is exactly identical (e.g.,
  replacing a literal `"2026-06-01"` with `DEFAULT_COMPANY_OPS_START_DATE`
  whose value is `"2026-06-01"`).

Even these should be verified by Replit afterward via the phase-N-verification
handoff pattern.

## When Replit CAN edit `.claude/` docs directly

Only when:

- Appending to `.claude/session-memory.md` with session-end notes (≤5 lines).
- Adding a `BLOCKED.md` sibling to a handoff file when stuck.

All other `.claude/**` content is Claude Code's authoritative domain.

## How to detect violations

- Commit author + Surfaces footer tell you who did what.
- `git log --author="Agent"` shows Replit auto-commits.
- A commit that modifies `.claude/rules/*.md` by Replit = violation.
- A commit that modifies `.replit` or `package.json` by Claude = violation.

## Session-start checklist (both agents)

On every session start:

1. Read `.claude/claude.md` (loaded automatically).
2. Read `.claude/session-memory.md` for recent context.
3. Read this rule (`claude-replit-split.md`) if the task spans both domains.
4. Check `.claude/replit-handoffs/` for pending work packages.
5. Check `.claude/audit-inventory.md` for the active dependency surface map.

## Scope

Applies to every code change in this repo made by either agent. If a human
commits directly (e.g., via the GitHub UI), this rule does not bind them —
but they should still prefer the handoff pattern for any UI/DB work.
