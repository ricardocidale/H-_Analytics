---
name: nai-code-review
description: "Project-specific code review for all NAI (Norfolk AI) apps, including the H+ Hospitality Business Portal monorepo. Wraps ce-code-review with pre-selected reviewer personas tuned for this codebase: financial model correctness, Drizzle/Postgres migration safety, TypeScript quality, schema-seed-engine coherence, design system compliance (nai-design-system), accessibility (nai-web-guidelines), and scope discipline. Use instead of plain ce-code-review for any PR or branch change on NAI repos."
argument-hint: "[blank to review current branch, PR number, or mode:report-only / mode:autofix]"
---

# NAI Code Review

A thin wrapper over `ce-code-review` that pre-activates reviewer personas most relevant to NAI codebases before dispatching the multi-agent review pipeline.

## What NAI apps are

NAI (Norfolk AI) builds TypeScript monorepos for data-intensive professional tools. The H+ Hospitality Business Portal is the primary app:

- **Engine** (`lib/engine/`) — property cash-flow pro forma, IRR, exit valuation, waterfall
- **Calc** (`lib/calc/`) — analytics primitives: IRR, waterfall, cap-rate, exit valuation
- **DB** (`lib/db/`) — Drizzle ORM schema + Neon/Postgres migrations
- **Seeds** (`artifacts/api-server/src/seeds/`) — property seeds that mirror the DB schema
- **AI Specialists** (`artifacts/api-server/src/ai/specialists/`) — LLM-backed analyst agents
- **UI** (`artifacts/hospitality-business-portal/src/`) — React/Vite frontend

Deployed on **Railway** (not Vercel).

## Key Invariants

Reviewers must watch these cross-cutting invariants:

- **Schema ↔ Drizzle ↔ seeds ↔ engine** — all four surfaces must stay in sync on any column add/change
- **`lib/calc/` functions are pure math** — any behavioral change needs a test verifying the new numeric output
- **Waterfall tiers**: `WaterfallInput` ↔ schema columns ↔ `computeWaterfall` — shape changes cascade to all three
- **AI Specialist personas are named** (Gustavo, Ana, Bia, Cecília, Daniela, Eloá, Fernanda, Giovanna, Helena…) — never use role-strings like "Risk Intelligence" in user-facing copy (`specialist-persona-naming` skill)
- **Admin routes never reachable by non-admin roles** (`front-of-app-admin-isolation` skill)
- **Icons must route through `@/components/icons/`** — never import directly from `lucide-react` or `@tabler/icons-react` in page/component code
- **Financial figures must use `font-mono tabular-nums`** — Money component and all KPI displays
- **No raw hex/rgba in JSX style props** — exception: isolated thumbnail/canvas renderers with named constants and a comment

## Design System Compliance

Before approving any UI change, check against:
- `nai-design-system` skill — font usage, color tokens, component patterns, accessibility
- `nai-web-guidelines` skill — form rules, animation, ARIA, anti-patterns
- `hbg-design-philosophy` skill — H+ portal specific visual identity and hospitality vocabulary

## Execution

### Step 1 — Announce

Tell the user: "Running NAI code review (ce-code-review + project-specific persona hints)."

### Step 2 — Build the context block

Prepend this to the `ce-code-review` invocation so the persona dispatcher knows which reviewers to prioritise:

```
NAI project context for reviewer selection:

PRIORITIZE these reviewer personas:
1. Financial Model Correctness — verify any calc/ or engine/ change against expected numeric output; check that USALI waterfall identities hold (Revenue - Expenses = GOP, GOP - Fees = AGOP, AGOP - Fixed = NOI, NOI - FF&E = ANOI)
2. Drizzle/Postgres Migration Safety — verify new migrations don't drop columns without a fallback; check that seeds stay in sync with schema; verify boot gates in index.ts
3. TypeScript Quality — no `any` unless justified; strict null checks respected; proper discriminated unions for status enums
4. Schema-Seed-Engine Coherence — cross-check: lib/db schema ↔ artifacts/api-server/src/seeds ↔ lib/engine input types ↔ API response types
5. Design System Compliance — icons must go through @/components/icons/; no raw hex in JSX; font-mono on all financial figures; PageHeader on all pages; aria-label on icon buttons
6. Scope Discipline — no features added beyond what the task requires; no cleanup that wasn't asked for; no half-finished implementations

ALSO CHECK:
- Admin routes: verify role middleware (requireAdmin) present on any /admin route
- Specialist persona names: no role-strings ("Risk Intelligence") in user-facing copy
- Magic number ratchet: run scripts/src/check-magic-numbers.ts if numeric literals were added
```

### Step 3 — Dispatch

Invoke `ce-code-review` with the context block prepended. Pass any user-supplied arguments (PR number, mode flag) through unchanged.

### Step 4 — Surface Results

Present findings grouped by severity:
1. **Blocking** — must fix before merge (financial identity breaks, schema/seed drift, security bypass, raw hex in visible UI)
2. **High** — should fix this PR (missing aria-label, missing data-testid on key elements, direct lucide-react import)
3. **Medium** — fix in follow-up (nested ternaries, inline style that could be a token)
4. **Low / Info** — noted for awareness

## Common Regressions to Watch

From project history, these patterns regress frequently:

| Regression | Where it appears |
|---|---|
| Python script path depth (`../../../` vs `../../../../`) | `artifacts/api-server/src/routes/property-slides.ts` |
| Replit checkpoint hook reverting committed changes | Any file touched by Replit auto-commit |
| `lucide-react` direct import added by Replit/autocomplete | New admin components |
| Missing `ts: number` field on turn cast | `artifacts/api-server/src/routes/rebecca.ts` |
| Boot gate forgotten for new migration | `artifacts/api-server/src/index.ts` |
| Magic number ratchet exceeding baseline | `scripts/src/_magic-numbers-baseline.json` |
