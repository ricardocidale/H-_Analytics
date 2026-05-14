# H+ Analytics — CLAUDE.md (Claude Code Agent Contract)

> **Canonical agent contract for Claude Code sessions in this repo.**
> Counterpart: `replit.md` (Replit Agent contract) — uses the **pointer model**: replit.md holds Replit-specific extras and a routing table; this file is the canonical source for all shared content. When touching either file, run a harmonization pass on the other before shipping (see § "Memory-file harmonization (mandatory shipping gate)" below).

These rules apply to every session, every agent, every plan and implementation unit.
They are non-negotiable. Skills (`no-magic-numbers`, `hplus-variable-taxonomy`) provide
full documentation; this file is the always-loaded enforcement reminder.

---


## 1. No Hardcoded Values — MANDATORY GATE

**Every implementation unit that touches any numeric literal MUST run:**

```
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
```

This is the hard gate. It must PASS before the unit is considered done.

**Numeric literal rule (one sentence):** Every numeric literal in source code must be either a named
constant, a math/physics derivation with its formula in a comment, a documented unit
conversion factor, or a structural index/length/clamp (`0`, `1`, `-1`). Anything else
is a violation.

**Integration identifier rule (one sentence):** LLM model names, API slugs, MCP slugs, and endpoint
URLs must never appear as TypeScript string literals or string constants anywhere in source code —
they live in `admin_resources` rows and are fetched at runtime. Wrapping a hardcoded string in a
`const` is the same violation with a disguise.

| Integration type | `admin_resources kind` | Runtime path |
|---|---|---|
| LLM models / providers | `model`, `llm_slot` | `GET /api/llm-providers` |
| External APIs (Exa, Perplexity, Tripadvisor…) | `api` | query by `config` flag |
| MCP servers | `mcp` | query filtered by `kind='mcp'` |
| Endpoint URLs | `config.endpoint` on the relevant row | read from the row |

**When to include in a plan's verification section:** Every unit. If the unit adds no
numeric literals or integration identifiers, the gate still runs to catch regressions.
There are no exceptions.

**Skill for full detail:** `.agents/skills/no-magic-numbers/SKILL.md`

---

## 2. Number Taxonomy — Category 2 is LEGACY DEBT (locked 2026-05-13)

Every number falls into exactly one category. Never invent a fifth.

| Category | Name | Pattern |
|---|---|---|
| 1 | TRUE CONSTANTS | Math/physics only. `DAYS_PER_MONTH = 30.5 // 365/12` |
| 2 | DEFAULT VARIABLES | **LEGACY** — Do NOT create new ones. See rule below. |
| 3 | ASSUMPTION VARIABLES | Per-entity DB values. Read from DB — no `?? DEFAULT_*` |
| 4 | TABLE-SOURCED VALUES | Authority rates. `getMarketRate()` or `getFactoryNumber()` |

**Category 2 superseding rule:** Business and financial values must NOT
exist as TypeScript constants — even named ones. `const BRACKET_DEFAULT_US_TERTIARY_EXIT_CAP = 0.0975`
is the same violation as writing `0.0975` inline — the name doesn't change
that it is hardcoded. These values belong in the database:
- `model_defaults` table — Layer-1 universal fallback (admin-editable in "Model Defaults" UI)
- `icp_brackets` rows — Layer-2 bracket overlay (applied at entity creation)
- `properties` / `companies` column — Layer-3 per-entity value (always populated by the three-layer resolver)

**The three-layer resolver guarantees Layer-3 is always set**, so engine code
reads `property.exitCapRate` directly — never `?? DEFAULT_EXIT_CAP_RATE`.

The DB schema enforces the invariant: new columns are added as
`NOT NULL DEFAULT <value>` in migration SQL. The literal in the SQL is
both the bootstrap value and the not-null enforcement — existing rows are
backfilled automatically by the DEFAULT clause. This makes TS fallback
constants structurally unnecessary, not just stylistically bad.

**The ONLY numbers allowed in TypeScript:**
- Category 1: math/physics absolutes (12, 365, 30.5, π, 86400, etc.)
- Structural clamps/indices: `0`, `1`, `-1`
- Algorithm calibration constants: non-financial, non-admin-configurable parameters (IRS/GAAP-derived engine parameters like `NOL_UTILIZATION_CAP = 0.8`; rule-ordering integers like `PRIORITY_* = 100`)
- `SEED_*` named constants in migration guard files (`artifacts/api-server/src/migrations/*.ts`) — bootstrap-only, source citation required, never imported by runtime code
- Test assertion / fixture values (`*.test.ts`, `*.spec.ts`) — checker skips these files entirely

**Three violation examples with correct fixes:**
```ts
// VIOLATION 1 — named constant for financial value
export const DEFAULT_EXIT_CAP_RATE = 0.085;
const exitCap = property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE; // WRONG

// CORRECT 1 — engine reads from DB (resolver guarantees it)
const exitCap = property.exitCapRate; // always set by three-layer resolver

// VIOLATION 2 — bracket default in TypeScript
const BRACKET_DEFAULT_US_TERTIARY_EXIT_CAP = 0.0975; // WRONG even with a name

// CORRECT 2 — value lives in icp_brackets row, bootstrapped by SQL:
// INSERT INTO icp_brackets (slug, default_exit_cap_rate)
// VALUES ('us-tertiary-boutique-resort', 0.0975); -- Source: CBRE 2024 + 75bp

// VIOLATION 3 — service template rates as TS array
export const DEFAULT_SERVICE_FEE_CATEGORIES = [
  { name: "Marketing & Brand", rate: 0.02 }, // 2% is DB data, not code
];
// CORRECT 3 — these rows live in a DB table (service_fee_templates),
// bootstrapped by migration SQL, editable by admin without a deploy.
```

Full taxonomy + legacy migration path: `.agents/skills/hplus-variable-taxonomy/SKILL.md`

---

## 3. Seed File Rule (updated 2026-05-13)

**Migration SQL is the canonical source for bootstrap values.** TypeScript
seed scripts invoke the resolver flow (`POST /api/properties`) and receive
DB-populated values — they do NOT carry financial literals or named constants.

```ts
// CORRECT — seed calls resolver; values come from icp_brackets Layer 2
await createProperty({ companyId, ...baseFields });
// exitCapRate arrives from bracket overlay, not a TS constant

// VIOLATION — TS constant in seed
const SEED_EXIT_CAP_RATE_US = 0.075;   // WRONG — still a hardcoded value
{ exitCapRate: SEED_EXIT_CAP_RATE_US }

// VIOLATION — raw literal in seed
{ exitCapRate: 0.075 }  // WRONG
```

When a per-entity confirmed override is required (e.g., Medellin Duplex
strategic exit at 7.5%), use a SQL migration or a one-off script that writes
a CONFIRMED-state DB row with a source comment — not a TS constant.

---

## 4. ADR-007 — DI Discipline in Calc/Engine

`lib/calc/src/` and `lib/engine/src/` MUST NOT import storage, DB, or logger.
All rate resolution happens in the **route/service layer** and is passed as parameters
to pure calc functions.

```ts
// CORRECT — route resolves, passes in
const rate = await getMarketRate('transfer_tax_us');
computeExitScenarios({ transferTaxRates: { transfer_tax_us: rate.value / 100 } });

// VIOLATION — calc imports storage
import { getMarketRate } from '../../storage/market-rates';
```

---

## 5. Plan Verification Gate Checklist

Every implementation unit's Verification section must include:

- [ ] `pnpm run typecheck` (or scoped `tsc --noEmit`) — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] Relevant test suite — PASS

Units that modify DB schema or seed files also need:
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

## 6. Institutional Knowledge Store

`docs/solutions/` contains documented solutions, architecture patterns, design decisions, and
workflow learnings accumulated across sessions. Search it before implementing features, debugging
issues, or making decisions in a documented area.

**Structure:** Organized by category subdirectory (`architecture-patterns/`, `design-patterns/`,
`best-practices/`, etc.). Each file has YAML frontmatter with searchable fields:
- `module` — the area affected (e.g., `rebecca-agent-native-architecture`, `admin-navigation`)
- `tags` — lowercase-hyphen keywords
- `problem_type` — category enum (`architecture_pattern`, `design_pattern`, `best_practice`, etc.)

**When to search:** Before starting any implementation unit, grep for relevant module names,
tags, or component names in `docs/solutions/`. Learnings may cover bugs, patterns, workflow
conventions, and architectural decisions that would otherwise be re-discovered.

---

## 7. Agent-Native Parity — Mandatory Discipline

Every UI action a user can take, Rebecca must be able to achieve through conversation.

**When adding any UI capability**, also add the corresponding Rebecca tool in the same PR
and update `docs/discipline/agent-native-parity-map.md`.

**Parity map status values:**
- ✅ Tool exists and is documented in Rebecca's system prompt
- ⚠️ UI action exists but no Rebecca tool — MUST be resolved before merging
- 🚫 N/A — user-only action (file picker, camera, biometric auth) or admin-only

**The parity audit skill:** run `/parity-audit` in any session to get a structured
gap analysis comparing the current UI action list against known Rebecca tools.

---

## 8. Market Rates Table — Admin Regenerates, Never Cell-Edits

The admin can only press the **Analyst button** to regenerate an entire table row.
Individual cell editing is not supported and must not be implemented. Tables show:
- Last-regenerated timestamp
- Freshness dot (green = fresh, yellow = aging, red = stale/overdue)

---

## 9. Financial Engine Authoring Authority — ONLY shell CC

**Only the Claude Code CLI session (shell CC) may edit code in the financial engine
surface.** Replit Agent, other AI agents, and execute-this-plan handoffs must NOT
touch this surface — neither directly nor via plan delegation.

**Protected surface:** `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`,
`lib/db/src/constants*.ts`, `artifacts/api-server/src/finance/`,
`artifacts/api-server/src/report/`, `artifacts/api-server/src/tests/proof/`,
`artifacts/api-server/src/tests/engine/`. Schema columns that feed these are
protected at the column level, not just the read site.

**The discipline:** when handing a plan to a non-shell-CC agent, the plan's file scope MUST exclude every path above. Saying "do not touch the engine" is insufficient — exclude it from scope. If the plan needs an engine change, carve that unit out and execute it as shell CC.

**Skill for full detail:** `.agents/skills/financial-engine/SKILL.md` — "Critical Invariant: Authoring Authority".

---

## 10. Agentic Member Naming Convention

All agents, minions, and orchestrators in H+ Analytics use human first names
from Brazilian or Italian naming traditions (male or female).

**Three roles — never conflate:**
- **Orchestrators** — route work across agents; never produce content directly
- **Agents** — do the substantive work (LLM or deterministic)
- **Minions** — deterministic helpers called by agents; no LLM, no judgment

### Canonical definitions

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples: Aldo (PDF/PPTX extractor), Dino (pixel-diff calculator), Carlo (Zod validator), Gaetano (vendor pass-through cost fetcher, `artifacts/api-server/src/ai/ambient/minions/vendor-passthrough-costs.ts`), Renato (Mgmt Co markup factor fetcher, `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts`).

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI as intelligence badges, conviction ranges, or cited copy. Examples: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format (e.g., Sofia-01, Lorenzo-03). When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline.

**Name formats:**
- **Swarm agents** (job-specific, only used in one pipeline): `Name-NN`
  zero-padded (e.g., Sofia-01, Lorenzo-03)
- **Cross-app specialists** (used in multiple surfaces): single name (e.g., Maya, Lucca)
- **Orchestrators and minions**: single name

**Every member has three fields:**
- `role` — one-line title (e.g., "Slide 1 Builder")
- `short_description` — 1-2 sentences for card/list views
- `long_description` — full capabilities, inputs, outputs, model tier

**Reserved names and full inventory:** `.agents/skills/slide-factory/SKILL.md`. Never use: Sergio, Milton.

---

## 11. Frontend Design Standards — DESIGN GATE

Every frontend unit (any `.tsx`, `.jsx`, `.ts`/`.js` that renders UI, `.css`, `.scss`, `.html`) MUST invoke `/post-coding-design-review` before declaring done. A design finding is a build-failure-equivalent — fix before marking complete.

**Full principles:** `.agents/skills/ce-frontend-design/SKILL.md`

---

## 12. Model Cost Optimization — PRE-CODING SUGGESTION

Suggest a model switch before starting work when there's a cost win without quality loss. **Haiku** — single-file/mechanical. **Sonnet** — multi-file feature work. **Opus** — financial engine (§9), cross-cutting refactors, deep debugging. Never switch silently — the user controls the model.

---

# Project Source of Truth

H+ Analytics is a hospitality-sector financial analytics platform. Asset managers use it to model scenarios, run portfolio projections, and generate property-level investor slide decks (HTML → PDF via Playwright, matched to the canonical L+B 6-slide design). Users are organised by organisation; access to scenarios and portfolios is governed by a share / permission model.

---

## Monorepo Structure

```
artifacts/
  hospitality-business-portal/   React + Vite frontend  (previewPath: /)
  api-server/                    Express 5 API          (previewPath: /api)
  mockup-sandbox/                Design sandbox         (previewPath: /__mockup/)
lib/
  shared/       Constants, types, Zod schemas shared across all packages
  db/           Drizzle ORM schema + migration runner
  engine/       Projection engine (pure; no Node I/O)
  calc/         Financial calculators
  analytics/    Analytics helpers
  domain/       Business-domain utilities
  api-spec/     OpenAPI spec + Orval codegen (hooks, Zod)
  api-client-react/  React Query wrappers generated from api-spec
  api-zod/      Zod schemas generated from api-spec
scripts/        Shared utility scripts (@workspace/scripts)
references/     ADRs and per-feature design notes
.local/tasks/   Task plans, audit documents, session notes
docs/solutions/ Documented solutions, organized by category with YAML frontmatter (module, tags, problem_type)
```

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Node | 24 |
| TypeScript | 5.9 |
| API | Express 5 |
| Database | PostgreSQL (Neon) + Drizzle ORM + pgvector |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (from OpenAPI spec in `lib/api-spec`) |
| Frontend build | Vite |
| Backend build | esbuild (ESM bundle, `dist/index.mjs`) |
| File storage | Cloudflare R2 |
| Auth | Google OAuth (primary, production) via `routes/google-auth.ts`, plus `AUTH_PROVIDER` adapter (`replit` OIDC default, `local` email+password) in `providers/auth/` |
| AI providers | OpenAI, Anthropic, Gemini (all called via direct SDKs with first-party API keys — not via a Replit broker) |
| Observability | Sentry |
| Project tracking | Linear (integration: `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG`) |
| Hosting (production) | **Railway** via `Dockerfile` + `railway.toml` — see "Production Deployment" below |
| Hosting (dev preview) | Replit Workspace (workflows + shared proxy on `localhost:80`) — **preview only**, not used to publish |

---

## Key Commands

```bash
pnpm run typecheck                              # full typecheck across all packages
pnpm run build                                 # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # regenerate API hooks + Zod schemas
pnpm --filter @workspace/db run generate       # generate a new Drizzle migration from schema changes
pnpm --filter @workspace/db run push           # push DB schema changes directly (dev only; skips migration files)
```

Health endpoint: `GET /api/health/live` (not `/api/healthz`).

---

## Environment Variables (api-server)

| Variable | Notes |
|---|---|
| `POSTGRES_URL` / `DATABASE_URL` | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2 |
| `STORAGE_PROVIDER` | Set to `r2` |
| `AUTH_PROVIDER` | Set to `replit` |
| `NODE_ENV` | Set to `production` in deployed env |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | Auth / session signing |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | AI providers (Claude used for LB Slides vision text) |
| `FRED_API_KEY` | FRED economic data |
| `GITHUB_PAT` | GitHub integration |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — **must be present in both Railway AND Replit secrets**; absence silently disables the `/api/auth/google` route (404) in whichever environment is missing it |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret — same dual-env requirement as above |
| `OPENAI_EMBEDDING_KEY` | Separate embedding key |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini AI provider |
| `RESEND_API_KEY` | Transactional email (Resend) |
| `SENTRY_DSN` | Error monitoring (Sentry) |

---

## Production Deployment

**Production runs on Railway, not on Replit.** Replit Publish (both `autoscale` and Reserved VM) failed for this app — see Task #942 history and `docs/solutions/integration-issues/dev-login-empty-body-edge-proxy-2026-05-02.md` for the edge-proxy / bundle-size root causes that pushed us off Replit Publish for good.

**Wiring (already in repo, do not duplicate):**

| File | Purpose |
|---|---|
| `Dockerfile` | Two-stage Node 24 + pnpm build. Builds all packages, ships the api-server bundle plus the two SPAs (H+ Analytics at `dist/public`, mockup-sandbox at `dist/mockup-sandbox`), runs `node artifacts/api-server/dist/index.mjs`. |
| `railway.toml` | `builder = "dockerfile"`, `healthcheckPath = "/api/health/live"`, `healthcheckTimeout = 300`, `restartPolicyType = "ON_FAILURE"`. |
| `artifacts/api-server/build.mjs` | Externalises heavy deps (AI SDKs, doc/media libs, country-state-city, Sentry, google-auth-library) so the bundle stays ~7.5 MB and pnpm installs the rest in the runtime container. |

**Single-container model:** the api-server serves `/api/*` plus both SPAs from one process on one port (`$PORT`). The Dockerfile builds every frontend and copies them next to the api-server bundle; `artifacts/api-server/src/static.ts` mounts them at:

- `/` → `artifacts/api-server/dist/public` (H+ Analytics — `hospitality-business-portal`)
- `/__mockup/` → `artifacts/api-server/dist/mockup-sandbox`

One Railway service, no separate frontend deployments.

**Required production env vars on Railway** — all variables in §Environment Variables above must be set as Railway service variables (no Replit broker is reachable in production). `PASSWORD_*` fallbacks are optional dev shortcuts and must be **omitted** in production.

**External services** (all user-owned, all reachable from Railway with secrets above): Neon Postgres (db + pgvector), Cloudflare R2 (objects), Google OAuth (auth, primary) + Replit OIDC (legacy/dev), OpenAI / Anthropic / Gemini (LLMs, direct SDKs), FRED (macro data), Resend (email), Sentry (errors), Linear (issues — connector `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG`, falls back to env vars), GitHub. Per-service secrets: see §"Environment Variables" above.

**Rule of thumb:** never provision Replit-managed equivalents (Replit Database, Object Storage, Auth) — they split the source of truth from production. Use the `prefer-external-dependencies` skill first.

**Replit's role going forward:** dev workspace and code-review surface only. Do **not** rely on `.replit` `[deployment]`, `artifact.toml [services.production]`, or `suggest_deploy()` for shipping. Those blocks may stay in the repo for the workflow tooling, but production ships through `git push` → Railway build via the `Dockerfile`.

---

## Architecture Notes

### Import discipline

- `lib/db/src/index.ts` initialises a `pg` Pool at module load. Frontend code **must** import schema from `@workspace/db/schema` (the subpath export), never from `@workspace/db` directly, to avoid pulling Node-only `pg` into the browser bundle.
- `lib/engine` follows this pattern correctly and is a reference.
- `artifacts/hospitality-business-portal/vite.config.ts` excludes `drizzle-orm/node-postgres`, `drizzle-orm/postgres-js`, `pg`, `postgres`, and `postgres-bytea` from `optimizeDeps`.
- Frontend path aliases: `@engine/*` → `lib/engine/src/*`, `@calc/*` → `lib/calc/src/*`, `@shared/*` → `lib/shared/src/*`. Always use these aliases — never use deep relative paths (`../../../../engine/...`).

### Zod compatibility

- `zod-validation-error` v5 defaults to Zod v4 types. Always import from `"zod-validation-error/v3"` for Zod v3 compatibility.
- When passing a compiled `@workspace/db` schema type to a Zod function that expects `ZodTypeAny`, cast `as any` — the compiled `.d.ts` types don't satisfy the current Zod structural check.
- Cast `.error as any` when calling `fromZodError(...)` in route files to avoid the `ZodError<SpecificType>` not assignable to `ZodError` mismatch.

### AI assistant — Rebecca only

This app has exactly one AI assistant: **Rebecca** — a semantic KB-search chatbot backed by pgvector + OpenAI embeddings. **Do not add voice agents, Convai, or ElevenLabs integrations.** Use the `embedded-ai-agent` skill for any Rebecca extension work.

### Specialists

Specialists are **dev-defined only** — see `.claude/rules/specialists-are-dev-defined-only.md`. Admins are operators, not authors. No admin UI should expose specialist creation or editing.

### Costantino — Data Custodian (Step 0)

Periodic agentic health-audit loop for all `admin_resources` rows with a `config.healthProbe` recipe. Runs side-by-side with legacy `resource-health-checker.ts` (Step 1 retires it). Admin-editable cadence via parameter row `costantino-health-cycle-interval-ms`. Full contract: `.agents/skills/costantino-data-custodian/SKILL.md`.

### Intelligence Display — specialist-sourced UI affordances

Every range badge, tip, severity signal, or suggestion must originate **100% from specialist/research-engine output**. No component may hard-code a range, write its own advice, or derive a suggestion locally.

**Canonical components:** `AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog`
**Severity:** ok=emerald, advisory=sky, warning=amber, block=red — no new levels.

Full contract, data flow, conviction floor, voice rule, anti-patterns: `.agents/skills/analyst-intelligence-display/SKILL.md`

### Roles and permissions

- `checker` and `investor` roles are still **live in the database** even though they have been removed from the `VALID_USER_ROLES` enum in code. Do not assume the enum is the full set of live roles.
- `canManageScenarios` is a boolean orthogonal to role — see the architecture audit at `.local/tasks/task-800.md`.
- Dual share tables exist: `scenario_access` (enforcement) and `scenario_shares` (admin tracking). Both must be kept in sync.

### Number taxonomy — the permanent law (never re-derive)

Full taxonomy + code patterns: `.agents/skills/hplus-variable-taxonomy/SKILL.md`. Three recurring violations: (1) raw literal fallback `?? 0.03` — the fix is NOT `?? DEFAULT_X` (also a violation); use `getFactoryNumber(key, country)` for country-specific rates or rely on the three-layer resolver guarantee (no fallback needed); (2) wrong constant (e.g., `DEFAULT_COST_RATE_MARKETING` 1% S&M vs `DEFAULT_MARKETING_RATE` 5% company); (3) masked literal `const DEFAULT_X = 0.03` — a named constant doesn't fix the violation.

**Confirmed exceptions (2026-05-13):** Algorithm calibration constants (non-financial ordering / IRS-derived parameters like `NOL_UTILIZATION_CAP`, `PRIORITY_*`) stay in TypeScript. `SEED_*` named constants in migration guard files (`artifacts/api-server/src/migrations/*.ts`) are acceptable bootstrap-only values with source citations. Test files (`*.test.ts`, `*.spec.ts`) are fully exempt from the checker.

Slide Deck Factory rule: `artifacts/api-server/src/slides/` is a pure consumer — sources every assumption from `storage.getGlobalAssumptions()`, never defines local assumption constants.

### Inflation policy (USD-base calculations) — supersedes prior cascade

All H+ engine calculations use the **US inflation rate** for every property. Country-level inflation tables are display-only. Engine cascade always passes `'US'` as the country argument to `getFactoryNumber`. Full policy and supersession notes: `.agents/skills/inflation-cascade/SKILL.md`.

### LB Slides — investor PDF decks (Playwright HTML→PDF)

6-slide property deck (slide 7 "The Ask" always excluded). One pipeline: React pages at `features/internal-deck/` → headless Chromium (Playwright) → PDF → R2 → `GET /api/properties/:id/deck.pdf`. **Playwright is the only renderer — do not add Puppeteer; legacy Python/satori tracks are removed.** Full reference: `docs/slide-system/lb-slides-implementation-reference.md`.

### `reference_brands` AI pipeline wiring

DI pattern (route layer fetches, calc/engine DB-import-free): `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.

### Inviolable login / auth rules

1. **Railway ↔ Replit secrets must stay in parity.** Any env var the api-server reads must exist in *both* Railway service variables *and* Replit secrets. Absence in either silently disables the feature (`GOOGLE_CLIENT_ID` missing → Google auth 404). After adding a var to Railway, add it to Replit secrets immediately.

2. **Never gate UI behaviour on a silent async fetch.** `useState(false)` flags flipped by fire-and-forget fetches are banned — any network hiccup leaves the feature permanently disabled with no visible error. The server is the authority; the client always attempts and surfaces server errors as toasts.

3. **Dev-login is dev-only by server gate, not client gate.** `/api/auth/dev-login` is blocked by `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT`). The client never pre-checks — the server returns 403 in production.

4. **Auth navigations must use `window.location`, never `window.top`.** `window.top` is cross-origin in the Replit canvas iframe. Use `window.location.href` / `window.location.replace()`. Google OAuth uses `window.open("/api/auth/google", "_blank")` (Google pages send `X-Frame-Options: DENY`); poll `refetch()` until session is established.

5. **`DEV_SKIP_AUTH` must remain `false`.** Never edit `artifacts/api-server/src/dev-flags.ts`. Real auth is always active in development.

### Known issues to address

See `docs/issues/known-issues.md`.


### Migration system architecture

Three folders. `lib/db/migrations/` is the Drizzle-generate output target; `artifacts/api-server/migrations/` is what the api-server's `migrate()` actually reads at boot (slots past 0052 have drifted from `lib/db/migrations/` — new migrations must be mirrored with non-colliding slot numbers); `artifacts/api-server/src/migrations/*.ts` are runtime guards that re-apply idempotent `IF NOT EXISTS` DDL on every boot. Full topology + workflow: `docs/runbooks/schema-migrations.md`.

Schema changes always use `pnpm --filter @workspace/db run generate` — never hand-craft SQL (except complex backfills). `lib/db/migrations/meta/0042_snapshot.json` is the canonical baseline; `0000_snapshot.json` stays as the historical root. The new `Three folders` paragraph above is the authoritative pointer to the full runbook.

### Shared proxy routing

All traffic is routed by path through a shared reverse proxy. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.

---

## Canonical Page Archetypes

Two archetypes cover ~95% of pages: **Report/Presentation** (read-only, tabs + export — canonical `PropertyDetail.tsx`) and **Form/Editor** (tabs + per-tab Save + AnalystButton — canonical `CompanyAssumptions.tsx`). Read the canonical page before building. Full conventions: `ui-page-patterns` skill.

---

## Reference Documents

| Path | Contents |
|---|---|
| `references/openapi.md`, `references/server.md` | OpenAPI codegen + route conventions |
| `docs/runbooks/schema-migrations.md` | Schema + migration + seed runbook (three-folder topology, runtime guards, drift recovery) |
| `.local/tasks/task-800.md` | Architecture audit (scenarios, portfolios, sharing, roles) |
| `attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf` | LB slides canonical visual — every rebuild must pixel-match |
| `attached_assets/canonical/json/slide_analysis_agent_report.precise_1777824741855.json` | LB slides layout extract — text/fonts/colors authoritative; chrome/z-order not |
| `docs/slide-system/lb-slides-implementation-reference.md` | LB Slides full reference (routes, schema, finance, slots, Admin UI) |
| `docs/slide-system/canonical/coding-agent-instructions.md` | Slide agent workflow — §15 mandates canonical PNG comparison (PNG > JSON) |
| `.agents/status/cc.md` | CC current session status (active branch, owned files, handoff notes) |
| `.agents/status/replit.md` | Replit current session status (active branch, owned files, handoff notes) |

---

## Agent & Skill System

Full directory layout, core workflow (brainstorm → plan → work → review → compound), CC/Replit lane split, and key skill index: see `replit.md` § "Agent & Skill System" and § "Key project-specific skills". Full index: `.agents/skills/README.md`.

**Invocation:** `Skill("skill-name")` in Claude Code; type the skill name as a command in Replit.

### CC branch hygiene — Replit agent staging risk

The Replit agent commits to whatever branch is checked out in the shared workspace. When CC creates a branch, pushes it, and leaves it open while waiting for CI, the Replit agent often lands unrelated commits onto it. Those commits then ship under the CC PR title, bypassing review scope.

**Mandatory workflow before merging any CC PR:**

```bash
git log origin/main..origin/<branch> --oneline
# Verify every commit is a CC commit (Author: ricardocidale with no Replit-Commit-Author header)
# OR verify the squash diff only contains the intended files:
git diff origin/main...origin/<branch> --name-only
```

If Replit agent commits are present:
1. Note their SHAs
2. Create a fresh branch from `origin/main`
3. Cherry-pick only the CC commits: `git cherry-pick <sha1> <sha2>`
4. Push the clean branch and create the PR from that

Never merge a PR whose diff contains files outside the stated scope without explicitly acknowledging them in the PR description.

---

### Agent coordination — CC ↔ Replit (mandatory session gate)

Two status files prevent work collisions between CC and Replit Agent:

| File | Owner | Counterpart reads |
|---|---|---|
| `.agents/status/cc.md` | CC (sole writer) | Replit |
| `.agents/status/replit.md` | Replit (sole writer) | CC |

**Session start (mandatory):**
1. Read `.agents/status/replit.md` — note `Active Branch` and `Files Replit Owns Right Now`.
2. If Replit has an active branch that overlaps files you need, coordinate before touching them.
3. Update `.agents/status/cc.md`: set `Status: active`, record branch, set `Updated` timestamp.

**Session end (mandatory):**
1. Set `Status: idle` (or `handoff-pending` if handing off to Replit).
2. Fill `Handoff to Replit` section with specific pickup instructions if applicable.
3. Commit the status file as part of your final commit (or standalone `chore(status)` commit).

**Staleness clause:** if `Updated` is >24h old, treat as `idle` regardless of `Status` field.

Full protocol, format spec, and surface restrictions: `agent-collab-status` skill.

---

### Memory-file harmonization (mandatory shipping gate)

`CLAUDE.md` and `replit.md` are dual memory files covering identical ground for two different agents. They drift by default. **Every session that modifies either file must harmonize the other before shipping.** This applies equally when `ce-work` ships code that affects `CLAUDE.md` content (architecture rules, skill routing, known issues, recent changes).

Rule: **if you touch `CLAUDE.md`, scan `replit.md` for related content and sync it. If you touch `replit.md`, do the same to `CLAUDE.md`.** Use the `agent-memory-files` skill for the full discipline (drift inventory, mirror-not-fork, per-session harmonize pass, TODO list format and cadence). Shared sections (architecture rules, inviolable rules, vocabulary, skill table) must have identical wording in both files. File-specific extras (Replit environment overrides, CC-specific tooling) stay only in their respective file.

---

## Open TODOs — CC

<!-- Check off when done · Add when identified · Prune [x] rows at next session start -->
<!-- Discipline: agent-memory-files skill → "TODO Lists" section -->
| | Item | Scope |
|---|---|---|
| [x] | U6: bracket-default seeding pathway at `POST /api/properties` — `applyBracketLayerDefaults` in `defaults.ts`, wired before `hydratePropertyFinancials` in `createPropertyRecord` ✓ | Plan 2026-05-13-001 |
| [ ] | U1: re-seed demo properties + Duplex per-entity CONFIRMED overrides via SQL migration | Plan 2026-05-13-001 |
| [ ] | U8: verification — portfolio IRR in 25–30% band + docs | Plan 2026-05-13-001 |
| [ ] | Migrate remaining `DEFAULT_*` constants in `lib/shared/src/constants*.ts` to `model_defaults` DB rows (incremental — check off each constant as cleaned up) | Taxonomy cleanup |

---

## Recent Significant Changes

<!-- keep ≤ 3 entries; remove oldest when adding new ones -->
| Date | Change |
|---|---|
| 2026-05-13 | **Financial defaults integrity + IRR calibration shipped (Plan 2026-05-13-003, Phases 1–5).** Five root causes of broken IRR fixed: (1) exit cap rate 0.062→0.085 for luxury tier (`SEED_EXIT_CAP_RATE_LUXURY`); (2) `refinanceLtv`→`refinanceLTV` casing bug fixed on 3 SYNC properties; (3) `refiMaxLtvToOriginal` cap wired in both engine refi paths (`refinance-pass.ts` + `loanCalculations.ts`) to prevent equity stripping; (4) null assertions added for fail-fast behavior (Phase 4); (5) `withFinancialHydration` wired at all compute routes (Phase 2). DB migration adds `refi_max_ltv_to_original` column to `properties` (Drizzle 0058/0064, runtime guard `properties-refi-ltv-cap-001.ts`). Startup guard `assertRequiredModelDefaults()` fails boot if model_defaults seed rows are missing. |
| 2026-05-13 | **Slide factory UI design sweep shipped (Plan 2026-05-13-004).** Two new shared components: `FactoryProgressPill` (fixed-position floating progress rectangle with indeterminate CSS bar + expandable minion details) and `FactoryErrorPill` (floating error pill). All five pipeline tabs rewritten: Lorenzo, Lucca, Agents, Download, and `SlideFactoryPanel` outer loading state. Embedded `<Card>` loading/error containers eliminated across the board — skeleton shimmer (`Skeleton`) replaces spinner-cards for pipeline-wait states; pills float at `bottom: 24px` for active pipeline feedback. Design gates pass: typecheck ✅, lint ✅, spinner-contrast ✅. |
| 2026-05-11 | **Range-badge quality contract memorized.** Range badges across the entire app must show two independent signals: (1) a small green/yellow/red **range-quality dot** at the right edge of the range value chip indicating whether the *range itself* is plausible per DB-stored guardrails (e.g. cost of equity outliers ∉ [6%, 25%]), and (2) when the user's value falls outside the range, a separate terse chip with one icon (`AlertCircle`) + the lowercase words **"out of range"** — no severity word, no "Med/Low/High" tail, no second dot. The old `Outside suggested range · ● Med` composition in `RangeIndicator.tsx` is deprecated. Guardrails live in a new codebase-seeded `assumption_guardrails` table surfaced under Admin → AI → Intelligence → Knowledge & Resources → Tables (read-only, vector-indexed). A new minion **Fabio** (deterministic range-quality validator, `lib/engine/src/analyst/minions/fabio.ts`) owns the dot color. Full contract + first-cut seed table + rollout list in the SUPERSEDING CONTRACT block at the top of `analyst-intelligence-display`. |
