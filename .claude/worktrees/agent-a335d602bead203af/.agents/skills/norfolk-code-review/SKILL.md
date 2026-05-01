---
name: norfolk-code-review
description: "Project-specific code review for the Norfolk hospitality real-estate analytics platform. Wraps ce-code-review with pre-selected personas tuned for this codebase: financial model correctness, Drizzle/Postgres migration safety, TypeScript quality, schema-seed-engine coherence, and scope discipline. Use instead of plain ce-code-review for any PR on this repo."
argument-hint: "[blank to review current branch, PR number, or mode:report-only / mode:autofix]"
---

# Norfolk Code Review

A thin wrapper over `ce-code-review` that pre-activates the reviewer personas most relevant to this codebase before dispatching the multi-agent review pipeline.

## What this codebase is

**Norfolk** is a TypeScript monorepo for hospitality private-equity analytics:

- **Engine** (`lib/engine/`) — property cash-flow pro forma, IRR, exit valuation, waterfall
- **Calc** (`lib/calc/`) — analytics primitives: IRR, waterfall, cap-rate, exit valuation
- **DB** (`lib/db/`) — Drizzle ORM schema + Neon/Postgres migrations
- **Seeds** (`artifacts/api-server/src/seeds/`) — property seeds that mirror the DB schema
- **AI Specialists** (`artifacts/api-server/src/ai/specialists/`) — LLM-backed analyst agents (Gaspar, Ana, Bia, Cecília, Daniela, Eloá, Fernanda, Giovanna, Helena…)
- **UI** (`artifacts/client/src/`) — React/Vite frontend

Key invariants reviewers must watch:
- Schema columns ↔ Drizzle schema ↔ seeds ↔ engine inputs — all four surfaces must stay in sync
- `lib/calc/` functions are pure math; any behavioral change needs a test verifying the new numeric output
- Waterfall tiers (once ADR-011 lands): `WaterfallInput` ↔ schema columns ↔ `computeWaterfall` — any shape change cascades to all three
- AI Specialist personas are named (Gaspar, Ana, etc.) — never use role-strings like "Risk Intelligence" in user-facing copy (`specialist-persona-naming` skill)
- Admin routes must never be reachable by non-admin roles (`front-of-app-admin-isolation` skill)

## Execution

### Step 1 — Announce

Tell the user: "Running Norfolk code review (ce-code-review + project-specific persona hints)."

### Step 2 — Build the context block

Prepend this context to the `ce-code-review` invocation so the persona dispatcher knows which reviewers to prioritise:

```
Norfolk project context for reviewer selection:
- Always activate: ce-data-integrity-guardian (schema/migration safety), ce-coherence-reviewer (schema↔seed↔engine drift)
- Activate if diff touches lib/calc/ or lib/engine/: ce-correctness-reviewer (financial math)
- Activate if diff touches lib/db/migrations/ or schema.ts: ce-data-migrations-reviewer (Drizzle migration safety)
- Activate if diff touches src/ai/ or any Specialist file: ce-security-lens-reviewer (prompt injection, admin isolation)
- Activate for any PR >10 files: ce-scope-guardian-reviewer (scope discipline)
- Always activate: ce-kieran-typescript-reviewer (TypeScript quality)
```

### Step 3 — Invoke ce-code-review

Read `.agents/skills/ce-code-review/SKILL.md` and execute it in full, passing:
- The context block above as additional reviewer-selection guidance
- Any arguments the user provided (`$ARGUMENTS`) forwarded as-is

The CE code review pipeline owns all further orchestration (diff scope detection, persona dispatch, merge/dedup, reporting).

### Step 4 — Post-review

After the review completes, if any P0 or P1 findings touch the engine or DB layer, remind the user:

> "Consider running `ce-compound` to document the finding as institutional knowledge if it reveals a non-obvious invariant."

## Priority personas for this repo

| Persona | When to activate | Why it matters here |
|---|---|---|
| `ce-data-integrity-guardian` | Always | Financial column drift (seeds, schema, engine) is the #1 bug class in this repo |
| `ce-coherence-reviewer` | Always | Schema ↔ seeds ↔ engine ↔ UI must stay in sync across 4 surfaces |
| `ce-correctness-reviewer` | lib/calc/, lib/engine/ | IRR / waterfall / cap-rate math — a wrong number silently mis-prices a $10M deal |
| `ce-data-migrations-reviewer` | lib/db/migrations/, schema.ts | Drizzle has known interactive-TUI + 42P02 bugs; migrations need extra scrutiny |
| `ce-kieran-typescript-reviewer` | Always | TypeScript monorepo with loose `any` spots in engine inputs |
| `ce-security-lens-reviewer` | src/ai/, admin routes | Admin isolation is a hard invariant; prompt injection risk in LLM specialist routes |
| `ce-scope-guardian-reviewer` | PRs > 10 files | This codebase tends toward large PRs; scope creep is a real risk |

## Composition with other skills

- **`cross-check-invariants`** — run before review; this review catches what it misses.
- **`ce-compound`** — run after review if a non-obvious invariant was surfaced.
- **`architecture-decision-records`** — if a review finding warrants a schema or pattern change, write an ADR.
- **`agent-handoff-briefs`** — when this review surfaces work for a different agent/session, write a brief.
