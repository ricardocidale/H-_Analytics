# Documentation & Source of Truth

## Rule

All project knowledge lives exclusively inside `.claude/`. If there is ever a conflict between `.claude/` and any other file, `.claude/` wins.

## Hierarchy

| Priority | Location | Role |
|----------|----------|------|
| 1 | `.claude/claude.md` | Master doc — always loaded |
| 2 | `.claude/rules/*.md` | Binding rules |
| 3 | `.claude/skills/**` | Reference — load on demand |
| 4 | `.claude/phases.md` | **Single source of truth for live phase status across all workstreams** |
| 5 | `.claude/session-memory.md` | Session persistence |

## Phase status changes

When a phase's status changes (Pending → In progress → Shipped, etc.), update **`.claude/phases.md` only**. Do not add or update phase|status tables elsewhere — they will drift.

- Other docs may reference `.claude/phases.md` (pointer line: *"Live status: see `.claude/phases.md`"*).
- ADRs may list **planned** "Implementation phases" without live-status tokens (✅/⏳/🟡/⏸); the CI guard `npm run phases:check` exempts ADRs as long as they don't carry live tokens.
- `replit.md` Recent Changes may carry historical narrative entries with commit SHAs (✅ shipped X at commit Y) — that is permitted as audit trail. What's prohibited is **live tables** (Phase | Status | Owner …) outside `.claude/phases.md`.

Enforcement: `npm run phases:check` (script: `script/check-phase-status-uniqueness.ts`).

## After ANY Codebase Edit

1. Update `.claude/session-memory.md` — log what was done, key decisions, new/changed files
2. Update `.claude/claude.md` if architecture, features, or inventory changed
3. Update relevant `.claude/skills/` if behavior or file locations changed

## After Bug Fixes (additionally)

5. Run `npm run test:summary` — all tests must pass
6. Run `npm run verify:summary` — must show UNQUALIFIED
7. Update `mandatory-financial-tests.md` if a financial bug was fixed
8. Verify documentation counts match actual project state

## Prohibited

- Root-level `/CLAUDE.md` or `/instructions.md` (shadows `.claude/`)
- Architectural decisions or rules that exist outside `.claude/`

## Scope

Applies to: new features, refactors, schema/API changes, test count changes, architecture decisions, bug fixes. Does NOT apply to: typo fixes, comment-only changes, whitespace changes.

## Enforcement

`tests/proof/rule-compliance.test.ts` checks: `.claude/claude.md` exists, no root-level shadow files, no rule files outside `.claude/rules/`.
