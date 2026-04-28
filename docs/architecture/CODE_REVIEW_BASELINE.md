# Code Review Baseline

**Audience:** CodeRabbit (auto-PR review) and human reviewers.
**Authority:** This file is the standing review prompt for this repo. It is a
*pointer document* — it links to canonical sources rather than restating them, so
it cannot drift. If a rule below contradicts the canonical file, the canonical
file wins.

---

## 1. Architectural spine (one screen)

H+ Analytics is a TypeScript monorepo split into five layers. Imports flow
**downward only** — never upward.

```
client/         React 19 + Vite 7 + wouter + TanStack Query + Tailwind v4
   │ HTTP/SSE
server/         Express 5 routes; thin handlers that delegate to storage/engine
   │
engine/         Domain orchestration (analyst/, watchdog/, property/, company/, …)
   │
calc/           Pure deterministic financial math (Decimal.js, no I/O, no LLM)
   │
shared/         Types, Drizzle schema, Zod, constants, country defaults
```

Cross-cutting:

- **The Analyst** — singular AI persona; two-tier internally (Surface
  Specialists → Cognitive Engine). User only ever sees "The Analyst".
  Spine: [`docs/architecture/ANALYST.md`](./ANALYST.md).
- **Constants vs Defaults vs Assumptions** — three tiers, never collapsed.
  Spine: [`docs/architecture/ARCHITECTURE.md`](./ARCHITECTURE.md) §2.
- **Dependencies atlas** — every external dep, env var, and provider:
  [`docs/architecture/DEPENDENCIES.md`](./DEPENDENCIES.md).
- **ADRs** — irreversible decisions:
  [`docs/architecture/decisions/`](./decisions/).
  New irreversible decisions must add an ADR; do not litigate them in PR review.

---

## 2. Non-negotiable invariants

Reviewers (human or CodeRabbit) must check these on every PR. Each links to
its enforcing rule or lint — defer to that source instead of re-deriving an
opinion.

| # | Invariant | Authority |
|---|---|---|
| 1 | **The Analyst persona** — singular voice in user-facing copy; never expose internal team vocabulary (Surface Specialist / Cognitive Engine / Surface Router / Voice Renderer / Quality Scorer). | [`.claude/rules/the-analyst-persona.md`](../../.claude/rules/the-analyst-persona.md), enforced by `eslint.config.mjs` (`ANALYST_INTERNAL_VOCAB_FORBIDDEN_IN_CLIENT`) |
| 2 | **Constants vs Defaults split** — Constants come from external authorities (IRS, GAAP, ISO, central banks), live in `shared/constants.ts` + `model_constant_overrides`, written only by AI specialists. Defaults are admin seeds. Assumptions are user working variables. | [`docs/architecture/ARCHITECTURE.md`](./ARCHITECTURE.md) §2, [`.claude/rules/no-hardcoded-values.md`](../../.claude/rules/no-hardcoded-values.md), [`.claude/rules/specialists-are-dev-defined-only.md`](../../.claude/rules/specialists-are-dev-defined-only.md) |
| 3 | **`Math.pow` ban** — financial math uses `dPow` from `calc/shared/decimal-helpers.ts`. | `eslint.config.mjs` (`FINANCIAL_RESTRICTED`) |
| 4 | **`\|\| 0` silent fallback ban** — use `??` with explicit `Number.isFinite` checks or `assertFinite`. | `eslint.config.mjs` (`FINANCIAL_RESTRICTED`) |
| 5 | **`as any` ban** — use a specific type or `as unknown as X` with a comment. | `eslint.config.mjs` (`FINANCIAL_RESTRICTED`) |
| 6 | **Bare `fetch()` ban** — must include an init object with an `AbortSignal`/timeout (use `fetchWithTimeout`). | `eslint.config.mjs` (`NEW_BUG_GUARDS`) |
| 7 | **Inflation cascade** — inflation rate flows `property → MC assumptions → Market & Macro fallback`. Hard-coded TS literal for inflation = defect. Constants row written exclusively by an AI Intelligence specialist. | [`.claude/rules/inflation-cascade.md`](../../.claude/rules/inflation-cascade.md) |
| 8 | **Steady-state naming** — admin sidebar group is "Steady State", never "Financial Defaults" / "Defaults" / "Model Defaults". Internal IDs and route slugs are exempt. | `.agents/skills/steady-state-naming/SKILL.md` |
| 9 | **Layer direction** — `calc → engine → server → client`. No upward imports. `calc/**` may not import from `engine/**`, `server/**`, or `client/**`. | [`docs/architecture/ARCHITECTURE.md`](./ARCHITECTURE.md), [`.claude/rules/domain-boundaries.md`](../../.claude/rules/domain-boundaries.md) |
| 10 | **No LLM math** — calc/engine never call an LLM. Financial outputs are deterministic. | [`.claude/rules/financial-engine.md`](../../.claude/rules/financial-engine.md), [`.claude/rules/deterministic-tools.md`](../../.claude/rules/deterministic-tools.md) |
| 11 | **Specialists are dev-defined** — Specialist persona/prompt/LLM config/field set is source-of-truth in code; users and admins cannot adjust at runtime. | [`.claude/rules/specialists-are-dev-defined-only.md`](../../.claude/rules/specialists-are-dev-defined-only.md) |
| 12 | **Replit independence** — no new `@replit/`, `process.env.REPL*`, or `replit.dev`/`replit.app` outside the allow-listed adapters in `server/replit_integrations/`, `server/providers/`, `vite.config.ts`, `vite-plugin-meta-images.ts`. | `script/check-replit-independence.ts` (CI), `.agents/skills/replit-independence/SKILL.md` |
| 13 | **ADR process** — irreversible decisions (schema choices, dependency choices, layer-boundary changes, new patterns) require an ADR under `docs/architecture/decisions/`. Use `ADR-template.md`. | [`docs/architecture/decisions/ADR-template.md`](./decisions/ADR-template.md) |
| 14 | **Per-tab save discipline** — Analyst + Save buttons live inside the tab strip, scoped to the active tab. Putting them in the page header silently flushes other tabs' dirty fields. | [`docs/architecture/ARCHITECTURE.md`](./ARCHITECTURE.md) §3, `script/check-no-header-analyst-save.ts` |
| 15 | **Storage URLs** — new writes use the relative `/objects/<key>` form; legacy `storage.googleapis.com`, `objectstorage.replit.com`, `*.repl.co/objects`, `/objects/uploads/` paths fail `audit:quick`. | `.github/workflows/ci.yml` (Quick Audit step) |

---

## 3. Ordered review checklist

Walk top-to-bottom. Stop and request changes at the first category with a
material issue; lower categories can be follow-ups.

1. **Correctness** — does the change do what its description says? Are edge
   cases (null, empty, zero, negative, currency mismatch, missing
   country/jurisdiction) handled? Will it break on a fresh tenant with no
   seeds?
2. **Architecture boundaries** — invariants #9, #10, #11, #13. Imports go
   downward only. Calc/engine stay deterministic. New irreversible choices
   need an ADR.
3. **Security & secrets** — no new secret logged, no secret committed, no
   broadened CORS / CSRF surface, no new unauthenticated mutation route.
   See [`.claude/rules/security.md`](../../.claude/rules/security.md).
4. **Financial math** — invariants #3–#6 plus the Constants/Defaults split
   (#2) and the inflation cascade (#7). Every numeric output should be
   traceable to a Decimal-safe path. No silent coercion.
5. **User-facing copy** — Analyst persona (#1), steady-state naming (#8),
   "assumption" vs "default" vocabulary (`docs/architecture/ARCHITECTURE.md`
   §2). No internal team vocabulary in JSX or strings rendered to the user.
6. **Tests & docs** — new behavior has at least one test; new exports have
   types; new env vars are added to `DEPENDENCIES.md` and `.env.example`;
   the relevant skill or rule is updated if the contract changed.

---

## 4. What CodeRabbit should *not* flag

To keep the signal high, ignore noise that locally-enforced gates already
cover:

- Style / formatting nits — Prettier and ESLint own these.
- Lint findings already failing CI (`pnpm run lint:strict`) — don't
  double-report.
- TypeScript errors already failing `pnpm run check` — same reason.
- Generated/binary/log files: `dist/`, `build/`, `node_modules/`,
  `*.tsbuildinfo`, `pnpm-lock.yaml`, `package-lock.json`,
  `attached_assets/`, `test-artifacts/`, `test-results*.json`,
  `migrations/0*.sql` snapshots, root-level `*.png` mockups, large logs
  (`memory.md`, `replit_waste.md`, `rewritetax.md`, `seed-manifest.json`).

---

## 5. How to enable CodeRabbit on this repo

1. Install the **CodeRabbit GitHub App** on the `Norfolk-Group` org and grant
   it access to this repository (org owner action; not a code change).
2. CodeRabbit reads `.coderabbit.yaml` at the repo root on first PR after
   install. No further configuration needed.
3. CodeRabbit comments are **advisory only**. CODEOWNERS
   ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)) continues to gate merges
   independently — Analyst-domain paths still require an architect approval
   regardless of what CodeRabbit says.
4. To re-trigger a review on an existing PR, comment `@coderabbitai review`.
5. To pause CodeRabbit on a PR, mark the PR as draft.
