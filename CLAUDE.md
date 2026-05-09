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

## 2. Number Taxonomy — FOUR CATEGORIES ONLY

Every number falls into exactly one category. Never invent a fifth.

| Category | Name | Pattern |
|---|---|---|
| 1 | TRUE CONSTANTS | Math/physics only. `DAYS_PER_MONTH = 30.5 // 365/12` |
| 2 | DEFAULT VARIABLES | Admin-controlled starting values. `DEFAULT_*` in `constants*.ts` |
| 3 | ASSUMPTION VARIABLES | Per-entity DB values. Read from DB, fallback `?? DEFAULT_*` |
| 4 | TABLE-SOURCED VALUES | Authority rates (tax, inflation, depreciation). `getMarketRate()` or `getFactoryNumber()` |

Full law, violations, and canonical constants files: § "Number taxonomy — the permanent law" in Architecture Notes. Skill: `.agents/skills/hplus-variable-taxonomy/SKILL.md`

---

## 3. Seed File Rule

Seed files MUST import and reference `DEFAULT_*` constants or named `SEED_*` constants.
**Never write a raw numeric literal in a seed file.** Raw literals break the
single-source-of-truth chain and cause silent drift.

```ts
// CORRECT
const SEED_EXIT_CAP_RATE_US = 0.075;
{ exitCapRate: SEED_EXIT_CAP_RATE_US }

// VIOLATION
{ exitCapRate: 0.075 }
```

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
| Auth | Two parallel sign-in paths: (1) `AUTH_PROVIDER` adapter in `artifacts/api-server/src/providers/auth/` selects `replit` (Replit OIDC, default) or `local` (email + password); (2) Google OAuth routes at `/api/auth/google` + `/api/auth/google/callback` (`artifacts/api-server/src/routes/google-auth.ts`) run alongside whichever provider is selected. Production users sign in with Google. |
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

**External services this app depends on** (all owned by the user, all reachable from Railway with the secrets above — none are Replit-managed):

| Concern | Service | Secrets |
|---|---|---|
| Primary database + pgvector | **Neon Postgres** | `POSTGRES_URL` |
| Object storage (uploads, generated PPTX, photo assets) | **Cloudflare R2** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` |
| User auth | **Google OAuth** (primary), Replit OIDC (legacy / dev) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| LLMs | **OpenAI, Anthropic, Gemini** (direct SDKs) | `OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_GEMINI_API_KEY` |
| Macro economic data | **FRED (St. Louis Fed)** | `FRED_API_KEY` |
| Transactional email | **Resend** | `RESEND_API_KEY` |
| Error monitoring | **Sentry** | `SENTRY_DSN` |
| Project / issue tracking | **Linear** | `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG` (Replit connector — broker only, falls back to plain env vars) |
| Source control / API | **GitHub** | `GITHUB_PAT` |
| Hosting | **Railway** (Docker) | configured via `railway.toml` |

**Rule of thumb:** every infrastructure dependency this app uses is an **external service the user already pays for**. Do not provision Replit-managed equivalents (Replit Database, Replit Object Storage, Replit Auth) — they would split the source of truth from production and break Railway. Use the `prefer-external-dependencies` skill before reaching for any Replit setup tool.

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

Every number in H+ falls into exactly one of four categories. The full taxonomy with code patterns lives in `.agents/skills/hplus-variable-taxonomy/SKILL.md`. Summary:

**Category 1 — TRUE CONSTANTS.** Values fixed by mathematics or physics identical everywhere in the universe. Extremely rare. Examples: `DAYS_PER_MONTH = 30.5` (365/12), `MONTHS_PER_YEAR = 12`. NOT constants: tax rates, inflation, depreciation lives, interest rates, cap rates, occupancy rates, management fees — anything that could vary by country, market, or time.

**Category 2 — DEFAULT VARIABLES.** Admin-set starting values (Admin → Steady State). Prefix: `DEFAULT_`. Location: `lib/shared/src/constants*.ts` ONLY. Used as null-coalescing fallbacks: `property.field ?? DEFAULT_FIELD`. Never use the raw literal when the named constant exists. Never define `DEFAULT_*` in route handlers, engine files, or any non-constants file.

**Category 3 — ASSUMPTION VARIABLES.** Per-entity user-confirmed values. Start from defaults when created; confirmed (written to DB) when the user presses Save. Once confirmed, admin default changes do NOT override them. Save button is NEVER disabled. Navigate-away triggers a "Confirm your values" prompt.

**Category 4 — TABLE-SOURCED VALUES.** Country/financial data in DB tables. Accessed via `getFactoryNumber(key, country)`. Admin must be able to regenerate every such table from **Admin → Sources & Resources** without a code deploy.

**The three violations that recur most often:**

1. Raw literal fallback: `?? 0.03` — must be `?? getFactoryNumber('inflationRate', country)` (country-specific) or `?? DEFAULT_X` (flat default)
2. Wrong constant: `ga.marketingRate ?? DEFAULT_COST_RATE_MARKETING` (1% property S&M) when the intent is company marketing — must be `?? DEFAULT_MARKETING_RATE` (5%)
3. Masked literal: `const DEFAULT_INFLATION_RATE = 0.03` in a non-constants file — this is the same violation as `0.03` itself; the name just hides it

**Canonical constants files** (where `export const DEFAULT_* = <number>` IS allowed):
- `lib/shared/src/constants*.ts`
- `lib/db/src/constants.ts`

In all other files, ALL_CAPS const definitions with numeric literals are flagged by `scripts/src/check-magic-numbers.ts`. The full UX lifecycle (Save button rules, seeding pipeline, confirm-on-navigate-away) is in `.agents/skills/hplus-assumption-lifecycle/SKILL.md`.

**Slide Deck Factory rule:** The LB investor deck pipeline (`artifacts/api-server/src/slides/`) is a pure consumer. It sources every financial assumption from `storage.getGlobalAssumptions()` → `buildGlobalInput()` → the finance engine. It never defines its own projection years, interest rates, or cap rates. After every change to the Slide Deck Factory, verify no local assumption constants were introduced.

### Inflation policy (USD-base calculations) — supersedes prior cascade

All H+ financials are reported in USD. Therefore the inflation rate used in **every calculation** is the **US inflation rate**, for every property in every country. Country-level inflation tables remain populated with true local-currency inflation per country, but they are **display-only** (research panels, country pages, informational tooltips) and **never read by `calc/` or `engine/`**.

- Engine cascade: `company.inflationRate ?? property.inflationRate ?? getFactoryNumber('inflationRate', 'US') ?? marketMacroFallback`. The country argument is **always `'US'`** for engine use.
- Property-level inflation overrides only become meaningful if reporting currency ≠ USD; today no property is in this state.
- User/admin **can** still edit the inflation rate in the assumptions pages — that user-override path is preserved.
- The Management page and every Property page must **disclose the inflation rate being applied to the calculations** (e.g. "Inflation used in calculations: 3.1% (US, source: BLS CPI-U via [specialist])"). Not tooltip-only — keep it visible in-context.
- Analyst-button table regeneration still applies to every inflation-bearing table (Constants, country tables, Market & Macro defaults). Refresh repopulates the underlying values; what flows into the engine is still gated by the rule above.
- The Number-taxonomy hint that recommends `?? getFactoryNumber('inflationRate', country)` for inflation specifically must be read as `country = 'US'`. For all other Category-4 values (tax, depreciation), the country-aware lookup remains correct.

Authoritative skill: `.agents/skills/inflation-cascade/SKILL.md`. Older "country cascade into engine" notes are **superseded** by this policy.

### LB Slides — investor PDF decks (Playwright HTML→PDF)

Generates a 6-slide investor deck per property as a PDF matched to the canonical L+B reference deck. Slide 7 ("The Ask") is always excluded.

**One pipeline:** React pages at `features/internal-deck/` → api-server opens headless Chromium (Playwright) → prints to PDF → uploads to R2 → serves back. Route: `GET /api/properties/:id/deck.pdf`.

**Do not add Puppeteer.** Playwright is the single renderer. Legacy Python and satori tracks are removed.

**Full implementation reference** (routes, schema, finance calls, slot logic, visual spec paths, Admin UI, Slide Factory V2): `docs/slide-system/lb-slides-implementation-reference.md`

### `reference_brands` AI pipeline wiring

`reference_brands` feeds three AI surfaces (research orchestrator, Funding Specialist, Rebecca KB) via the DI pattern — route layer fetches, calc/engine layers are DB-import-free (ADR-007 §1). Full pattern: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.

### Inviolable login / auth rules

1. **Railway ↔ Replit secrets must stay in parity.** Any env var the api-server reads must exist in *both* Railway service variables *and* Replit secrets. Absence in either silently disables the feature (`GOOGLE_CLIENT_ID` missing → Google auth 404). After adding a var to Railway, add it to Replit secrets immediately.

2. **Never gate UI behaviour on a silent async fetch.** `useState(false)` flags flipped by fire-and-forget fetches are banned — any network hiccup leaves the feature permanently disabled with no visible error. The server is the authority; the client always attempts and surfaces server errors as toasts.

3. **Dev-login is dev-only by server gate, not client gate.** `/api/auth/dev-login` is blocked by `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT`). The client never pre-checks — the server returns 403 in production.

4. **Auth navigations must use `window.location`, never `window.top`.** `window.top` is cross-origin in the Replit canvas iframe. Use `window.location.href` / `window.location.replace()`. Google OAuth uses `window.open("/api/auth/google", "_blank")` (Google pages send `X-Frame-Options: DENY`); poll `refetch()` until session is established.

5. **`DEV_SKIP_AUTH` must remain `false`.** Never edit `artifacts/api-server/src/dev-flags.ts`. Real auth is always active in development.

### Known issues to address

See `docs/issues/known-issues.md`.

### Migration system architecture

Two-layer system — know both before touching the DB:

| Layer | Location | When it runs |
|---|---|---|
| Drizzle SQL migrations | `lib/db/migrations/*.sql` + journal at `lib/db/migrations/meta/_journal.json` | Once, at server boot via `migrate()` from `drizzle-orm/node-postgres/migrator` |
| Runtime TypeScript guards | `artifacts/api-server/src/migrations/*.ts` | Every boot — idempotent `IF NOT EXISTS` DDL, belt-and-suspenders |

**Drizzle migration state** is tracked in `drizzle.__drizzle_migrations` on Neon. If it drifts from the journal (e.g. after manually applying DDL), sync it: compute SHA-256 of each unapplied `.sql` file and `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)`. Synced to 53 entries on 2026-05-08 (after migration 0042 — `rebecca_chat_prefs`).

**Drizzle snapshot baseline:** `lib/db/migrations/meta/0042_snapshot.json` is the canonical up-to-date snapshot (added Task #1199, May 2026), describing all 112 tables as of `0044_users_rebecca_history_open`. The original `0000_snapshot.json` (8 tables) is kept as the historical root and must not be replaced — it anchors the snapshot chain. Run `pnpm --filter @workspace/db run generate` to produce a new migration from the current TypeScript schema; drizzle-kit will automatically write a new numbered snapshot alongside the SQL file.

#### Schema change workflow

Always use `pnpm --filter @workspace/db run generate` to produce migrations; never craft SQL by hand (except complex backfills). Full step-by-step runbook with bash scripts: `.local/skills/pnpm-workspace/references/db.md`.

**Querying the real DB in dev:** The Replit code-execution `executeSql()` callback connects to Replit's built-in PostgreSQL, NOT the app's Neon database. To query the real DB: use admin API endpoints via `curl -b <cookie>` (authenticate with `POST /api/auth/dev-login`), or run a one-off Node.js script with `process.env.POSTGRES_URL` and the `pg` client at `artifacts/api-server/node_modules/pg`.

### Shared proxy routing

All traffic is routed by path through a shared reverse proxy. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.

---

## Canonical Page Archetypes

Two archetypes cover ~95% of app pages. Always read the relevant canonical page before building a new one.

| Archetype | Use when | Canonical file |
|---|---|---|
| **Report / Presentation** | Tabs + export actions, read-only data display | `artifacts/hospitality-business-portal/src/pages/PropertyDetail.tsx` |
| **Form / Editor** | Tabs + per-tab Save + AnalystButton, user edits structured data | `artifacts/hospitality-business-portal/src/pages/CompanyAssumptions.tsx` |

Use the `ui-page-patterns` skill before building or revising any page.

---

## Reference Documents

| Path | Contents |
|---|---|
| `references/openapi.md` | OpenAPI spec + codegen setup |
| `references/server.md` | Route conventions, logging, tips |
| `.local/skills/pnpm-workspace/references/db.md` | Schema additions + migration runbook (generate workflow, push commands, pitfalls) |
| `.local/tasks/task-800.md` | Full architecture audit (scenarios, portfolios, sharing, roles) |
| `.local/db-audit-phase-c-inventory.md` | DB migration inventory (Phase C) |
| `attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf` | Canonical visual reference for all 6 LB slides — every rebuild must pixel-match this |
| `attached_assets/canonical/pptx/belleayre-mountain-slides_1777774635693.pptx` | Canonical PPTX source — original design file; canonical photos extracted from here |
| `attached_assets/canonical/json/slide_analysis_agent_report.precise_1777824741855.json` | Machine-readable layout extract (~650 KB). Per-span bbox/font/color and per-image bbox. Authoritative for text positions, fonts, colors. Not authoritative for card chrome/backgrounds (rasterized) or z-order. |
| `docs/slide-system/lb-slides-implementation-reference.md` | LB Slides full implementation reference — routes, schema, finance calls, slot logic, visual spec paths, Admin UI |
| `docs/slide-system/canonical/coding-agent-instructions.md` | Agent generation workflow — §15 = mandatory canonical PNG comparison (PNG wins over JSON spec) |

---

## Agent & Skill System

Skills are reusable process documents that guide AI agents through complex tasks. They live in `.agents/skills/` and are invoked via the `Skill` tool (Claude Code) or by name in Replit.

### Directory layout

```
.agents/
  skills/              Individual skill directories (each has SKILL.md)
    ce-*/              Compound Engineering core loop skills
    norfolk-*/         Project-specific skills for this repo
    embedded-ai-agent/ Reusable: streaming AI chatbot pattern (the "Rebecca" pattern)
    ui-page-patterns/  Reusable: consistent UI page building for any React+Tailwind app
    brainstorming/     Reusable: collaborative design before implementation
    architecture-decision-records/  Reusable: writing ADRs
    replit-independence/ Reusable: keeping the codebase off-Replit-portable
    README.md          Full index of all available skills
  ce-agents/           Compound Engineering persona definitions
  COMPOUND-ENGINEERING.md  CE plugin documentation
vendor/
  compound-engineering-plugin/  CE plugin source (v3.3.2) — registered via `.claude/settings.json` using `extraKnownMarketplaces` + `enabledPlugins`
```

### Core workflow (Compound Engineering loop)

| Step | Skill | Purpose |
|---|---|---|
| 1 | `ce-brainstorm` | Explore requirements, produce a requirements doc |
| 2 | `ce-plan` | Break the requirements doc into an implementation plan |
| 3 | `ce-work` | Execute the plan step-by-step |
| 4 | `ce-code-review` / `nai-code-review` | Review before merging |
| 5 | `ce-compound` | Capture new knowledge as a skill or ADR |

### CC / Replit lane split

| Work type | Owner | Notes |
|---|---|---|
| DB migrations | Claude Code | Run `pnpm --filter @workspace/db run generate` first; fall back to manual SQL only for complex backfills |
| UI pages / components | Replit Agent | Use `ui-page-patterns` skill |
| AI/chatbot features | Either | Use `embedded-ai-agent` skill |
| Architecture decisions | Claude Code | Use `architecture-decision-records` skill |

### Key project-specific skills

> Wording in this table is mirrored in `replit.md` § "Pointers". Keep them identical — drift here is a bug per the `agent-memory-files` skill.

| Skill | When to use |
|---|---|
| `ui-page-patterns` | Building or fixing any UI page — enforces canonical archetypes, loading/empty/error states, action-button discipline, tab URL sync |
| `embedded-ai-agent` | Adding or extending Rebecca (the only AI assistant in this app) |
| `replit-independence` | Adding any dependency, env var, or deployment-affecting change |
| `prefer-external-dependencies` | Before any infrastructure-shaped tool call — the project uses Neon Postgres, Cloudflare R2, Google OAuth, direct OpenAI/Anthropic/Gemini SDKs; never provision Replit-managed equivalents |
| `nai-code-review` | Before opening a PR — wraps `ce-code-review` with hospitality/Drizzle personas |
| `architecture-decision-records` | Any irreversible technical decision future contributors might re-litigate |
| `hplus-vision-templates` | Filling in any slide text field — sourcing pipeline (DB → benchmarks → LLM with web research → templates), per-field char-limit enforcement, and budget-realism guardrails for transformation proposals |
| `hplus-renovation-benchmarks` | Per-key cost ranges and transformation cost lines used by the budget-realism check above |
| `hplus-admin-nav-ia` | Placing data sources, APIs, Specialists, LLMs, or AI agents in the Admin / Intelligence sidebar |
| `lb-slides-canonical-pngs` | Comparing any rendered slide output against the pixel-authoritative canonical PNGs — R2 keys, local paths, per-slide comparison checklist, re-upload workflow |
| `analyst-research-buttons` | Any button that triggers a research job — canonical label, icon, voice, and guard rules |
| `analyst-intelligence-display` | Any UI component that **displays** specialist research results — range badges, verdict cards, contextual tips, action dialogs. Complements `analyst-research-buttons` (the input side) with the display side |
| `agent-memory-files` | Editing `CLAUDE.md` or `replit.md` — keep them harmonized |
| `external-data-source-integration` | Adding any new external data source (API, MCP, scraper) — five-layer FRED template: admin_resources row + minion fetcher + DB cache + Rebecca tool + parity map entry |
| `hplus-resource-catalog` | Listing all H+ data resources (APIs, MCPs, research URLs, prompt templates) — inventory of the platform's data moat; use before planning features that need market or financial data |

### How to invoke

**Claude Code:** Use the `Skill` tool with the skill name. Example: `Skill("ui-page-patterns")`.

**Replit Agent:** Type the skill name as a command. Example: `use the ui-page-patterns skill`.

**Full index:** See `.agents/skills/README.md`.

### Memory-file harmonization (mandatory shipping gate)

`CLAUDE.md` and `replit.md` are dual memory files covering identical ground for two different agents. They drift by default. **Every session that modifies either file must harmonize the other before shipping.** This applies equally when `ce-work` ships code that affects `CLAUDE.md` content (architecture rules, skill routing, known issues, recent changes).

Rule: **if you touch `CLAUDE.md`, scan `replit.md` for related content and sync it. If you touch `replit.md`, do the same to `CLAUDE.md`.** Use the `agent-memory-files` skill for the full discipline (drift inventory, mirror-not-fork, per-session harmonize pass). Shared sections (architecture rules, inviolable rules, vocabulary, skill table) must have identical wording in both files. File-specific extras (Replit environment overrides, CC-specific tooling) stay only in their respective file.

---

## Recent Significant Changes

<!-- keep ≤ 3 entries; remove oldest when adding new ones -->
| Date | Change |
|---|---|
| 2026-05-09 | **Agent-native Wave 0 (W0.1–W0.4).** `rebeccaResponseMode` from DB now used as default when chat body omits `responseMode` (W0.1). Portfolio verification opinion injected into Rebecca's system prompt when a property is in scope (W0.2). Parity map updated with 4 missing tools (`list_scenarios`, `get_scenario`, `patch_property`, `get_tripadvisor_hotels`) + CI guard test (W0.3). Dino constants already extracted — W0.4 confirmed done (W0.4). |
| 2026-05-08 | **Schema change workflow documented (Task #1201).** Added "Schema change workflow" runbook to CLAUDE.md § Migration system architecture and to `.local/skills/pnpm-workspace/references/db.md`. Updated Key Commands to include `generate`. Updated CC/Replit lane split to drop the manual-SQL fallback instruction. |
| 2026-05-09 | **Costantino — Data Custodian (Step 0).** New periodic agentic scheduler that audits every `admin_resources` row of kind {api, source, mcp} that has a `config.healthProbe` recipe. 8-tool loop (`list_admin_resources`, `get_probe_recipe`, `probe_integration_endpoint`, `update_admin_resource_health`, `write_finding`, `list_findings`, `resolve_finding`, `complete_task`). Findings persist in new `costantino_findings` table (migration 0048). Cadence is admin-editable at runtime via parameter row `costantino-health-cycle-interval-ms` (default 5d, clamp 60s–30d). Self-rescheduling `setTimeout` chain. Phase 3l boot hook in `index.ts`. Runs side-by-side with `resource-health-checker.ts` — Step 1 retires it. Skill: `costantino-data-custodian`. Verified via smoke + dry-cycle (stubbed callLlm + fetch). |
