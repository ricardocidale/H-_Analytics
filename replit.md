# H+ Analytics — replit.md (Replit Agent Contract)

> **Replit Agent contract for this repo.** Canonical deep source: `CLAUDE.md`. All architecture rules, stack details, env vars, and inviolable constraints live there — this file holds only what is Replit-specific plus a routing table.

H+ Analytics is a hospitality-sector financial analytics platform built by **Norfolk AI**. Norfolk AI is the software company; H+ Analytics is the product. Full product description: `CLAUDE.md` § "Project Source of Truth".

---

## Run & Operate

- **Run:** `restart_workflow <artifact_name>` (e.g., `restart_workflow hospitality-business-portal`). Never run `pnpm dev` at the workspace root.
- **Key secrets** (must exist in both Replit secrets AND Railway): `POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Full list: `CLAUDE.md` § "Environment Variables (api-server)".
- **Health check:** `GET /api/health/live`

---

## Inviolable Rules

See `CLAUDE.md` §§ 1–14 (no hardcoded values — numeric literals AND integration identifiers; number taxonomy **[Category 2 DEFAULT_* is legacy — ALL DEFAULT_* are violations, remove entirely; `?? DEFAULT_X` fallback is a violation; algorithm calibration constants like `NOL_UTILIZATION_CAP` / `PRIORITY_*` stay in TS; `SEED_*` starter-portfolio seeds (Category 5, added 2026-05-18) OK in dedicated bootstrap surfaces — migration guards, `artifacts/api-server/src/seeds/**`, `syncHelpers.ts`, plus cross-package `SEED_*` in `lib/shared/src/constants.ts`; mandatory SEED_ prefix + source-citation comment; never imported by runtime engine/calc/route code; prod DB row wins on conflict via `onConflictDoNothing()`; test files exempt from checker — see §2 + `hplus-variable-taxonomy` skill]**; seed rules; ADR-007; plan verification; institutional knowledge; agent parity; market rates; financial engine authoring; naming convention; frontend design; model cost; **UI canonical enforcement — Rule A "Analyst" CTA + Rule B `CurrentThemeTab` horizontal tabs, mechanically gated by `scripts/src/check-ui-canonical.ts`**; **retirement campaign discipline (§14, locked 2026-05-18) — never delete a TS constant or named symbol participating in an active retirement campaign until (a) its replacement destination is wired and reading green in the same PR, and (b) every CI ratchet it touches has been re-baselined at ≤ current count; applies to §2 numeric, §1 integration IDs, §13 UI canonical, and all future retirement campaigns**) and § "Inviolable login / auth rules" (5 auth rules) for the full set.

**Quick-ref auth rules (also in CLAUDE.md):**
1. **Secrets parity.** Every env var must exist in both Railway AND Replit secrets.
2. **No silent async-fetch gates.** Client always attempts; server surfaces errors as toasts.
3. **Dev-login is server-gated.** Server returns 403 in production via `isPublishedDeployment()`.
4. **Auth navigations: `window.location`, not `window.top`.** `window.top` is cross-origin in the Replit iframe.
5. **`DEV_SKIP_AUTH` is permanently `false`.** Never edit `artifacts/api-server/src/dev-flags.ts`.

---

## Gotchas

- **Duplicate worktrees:** Old `.claude/worktrees/agent-*/` directories cause `DUPLICATE_PREVIEW_PATH` errors. Clean with `git worktree remove --force` + `git worktree prune`.
- **CE Skill Adaptation:** CE skills need Replit adaptation. Read `.agents/ce-agents/REPLIT-ADAPTATION.md` before following any CE skill.
- **Shared proxy only.** Never call service ports directly. Always route through `localhost:80/<path>` in curl and application code.
- **`executeSql` tool hits the wrong database.** The code-execution `executeSql()` callback connects to Replit's built-in PostgreSQL, NOT the app's Neon database. To query the real DB: use admin API endpoints via `curl -b <auth-cookie>` (authenticate with `POST /api/auth/dev-login`), or run a one-off Node.js script using `process.env.POSTGRES_URL` with the `pg` client from `artifacts/api-server/node_modules/pg`.
- **Drizzle migration state can lag the journal.** After manually applying DDL, sync `drizzle.__drizzle_migrations`: compute SHA-256 of each unapplied `.sql` file and `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)`. Synced to 53 entries on 2026-05-08 (after migration 0042 — `rebecca_chat_prefs`). Full migration + seed runbook (three-folder topology, runtime guards, drift recovery, Helium-vs-Neon `executeSql` gotcha): `docs/runbooks/schema-migrations.md`.
- **Replit Agent commits land on whatever branch is currently checked out.** When CC leaves a PR branch open (waiting for CI / CodeRabbit), Replit Agent commits will accumulate there under the CC PR title. Before merging any CC PR, run `git log origin/main..origin/<branch> --oneline` and verify every commit belongs to the intended scope. If Replit Agent commits are mixed in, cherry-pick the CC-only commits onto a fresh branch. Full workflow + orphan-commit recovery (reflog): `CLAUDE.md` § "CC branch hygiene" and `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`.

---

## Agent Coordination — Replit ↔ CC (mandatory session gate)

Two status files prevent work collisions between Replit Agent and CC:

| File | Owner | Counterpart reads |
|---|---|---|
| `.agents/status/replit.md` | Replit (sole writer) | CC |
| `.agents/status/cc.md` | CC (sole writer) | Replit |

**Session start (mandatory):**
1. Read `.agents/status/cc.md` — note `Active Branch` and `Files CC Owns Right Now`.
2. If CC has an active branch that overlaps files you need, do NOT commit to that branch.
3. Update `.agents/status/replit.md`: set `Status: active`, record branch, set `Updated` timestamp.

**Session end (mandatory):**
1. Set `Status: idle` (or `handoff-pending` if handing off to CC).
2. Fill `Handoff to CC` section if applicable.
3. Commit the status file as part of your final commit.

**Staleness clause:** if `Updated` is >24h old, treat as `idle` regardless of `Status` field.

**Surfaces permanently off-limits to Replit (even when CC is idle):**
- `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`
- `lib/db/src/`, `artifacts/api-server/src/finance/`, `artifacts/api-server/src/report/`
- `artifacts/api-server/src/migrations/*.ts`, `artifacts/api-server/src/tests/proof/`, `tests/engine/`

Full protocol + format spec: `agent-collab-status` skill.

---

## Agent Taxonomy (verbatim from `CLAUDE.md` § 10)

All agents, minions, and orchestrators in H+ Analytics use human first names from Brazilian or Italian naming traditions.

**Three roles — never conflate:**
- **Orchestrators** — route work across agents; never produce content directly
- **Agents** — do the substantive work (LLM or deterministic)
- **Minions** — deterministic helpers called by agents; no LLM, no judgment

**Name formats:**
- Swarm members (job-specific, single pipeline): `Name-NN` zero-padded (e.g., Sofia-01, Lorenzo-03)
- Cross-app specialists, orchestrators, minions: single name

**Every member declares three fields:** `role` (one-line title), `short_description` (1-2 sentences), `long_description` (capabilities, I/O, model tier).

### Canonical definitions

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples in this factory: Aldo, Bruno, Carlo, Dino, Enzo.

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI. Examples in this factory: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format. When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline. Examples in this factory: Lorenzo-01..05, Sofia-01..03, Felix-01..05.

**Reserved names and full inventory:** `.agents/skills/slide-factory/SKILL.md`. Never use: Sergio, Milton.

---

## Pointers

| Topic | Where |
|---|---|
| Architecture, auth rules, number taxonomy | `CLAUDE.md` (canonical deep source) |
| Numeric rule — readable explainer (start here) | `docs/concepts/numeric-values-explained.md` |
| Numeric architecture brainstorm + Phase 2 decisions | `docs/brainstorms/numeric-architecture-requirements.md` |
| Stack, monorepo structure, key commands | `CLAUDE.md` §§ "Stack", "Monorepo Structure", "Key Commands" |
| Production deployment + env vars | `CLAUDE.md` §§ "Production Deployment", "Environment Variables (api-server)" |
| LB Slides implementation detail | `docs/slide-system/lb-slides-implementation-reference.md` |
| Known issues | `docs/issues/known-issues.md` |
| Agent & skill system | `CLAUDE.md` § "Agent & Skill System", `.agents/skills/README.md` |
| CE Replit adaptation | `.agents/ce-agents/REPLIT-ADAPTATION.md` |
| Large-repo Shell + CodeRabbit + Compound operating mode (off by default; toggle: `.local/opmode/active`) | `.agents/operating-modes/large-repo-shell-coderabbit-compound.md` |
| pnpm workspace | `pnpm-workspace` skill |
| UI pages | `ui-page-patterns` skill |
| Rebecca (AI assistant) | `embedded-ai-agent` skill |
| Replit portability | `replit-independence` skill |
| External infra (never Replit-managed) | `prefer-external-dependencies` skill |
| Code review | `nai-code-review` skill |
| Architecture decisions | `architecture-decision-records` skill |
| Slide text + char limits | `hplus-vision-templates` skill |
| Reno cost ranges | `hplus-renovation-benchmarks` skill |
| Admin nav placement (incl. Knowledge & Resources canonical tree, accordion contract, read-only rule) | `hplus-admin-nav-ia` skill |
| Front-of-app resource isolation (no Tables/APIs/URL cards on product pages) | `front-of-app-admin-isolation` skill |
| Canonical slide PNGs | `lb-slides-canonical-pngs` skill |
| Slide renderer contract | `lb-slides-renderer` skill |
| Research trigger buttons | `analyst-research-buttons` skill |
| Intelligence display components | `analyst-intelligence-display` skill |
| Memory file harmonization + TODO list discipline | `agent-memory-files` skill |
| CC ↔ Replit coordination (status files, session gate, collision avoidance) | `agent-collab-status` skill |
| Inflation policy (USD-base calc) | `inflation-cascade` skill — **supersedes prior country cascade** |
| Integration-health audit (Costantino) | `costantino-data-custodian` skill |
| Agent naming + reserved names | `slide-factory` skill |

---

## User Preferences

- **File storage:** All project files stay local to this MacBook. Do not use Google Drive or Dropbox for any project files, assets, or outputs.
- **Plain language:** When explaining design or technical decisions, translate variable names and code terms into normal human language and industry terms. Say "card shadow" not `shadow-lg`, "border color" not `hsl(var(--border))`, "rounded corners" not `border-radius: 8px`, etc. Standard hospitality terms like ADR and RevPAR are fine as-is. Less universal abbreviations (e.g. STR the benchmarking company, USALI, DSCR) should be spelled out or described plainly.

---

## Open TODOs — Replit Agent

<!-- Check off when done · Add when identified · Prune [x] rows at next session start -->
<!-- Discipline: agent-memory-files skill → "TODO Lists" section -->
| | Item | Scope |
|---|---|---|
| [ ] | (nothing pending) | — |

## Agent Roster Probe — Rules

> See `docs/solutions/ui-patterns/agent-roster-probe-messages-2026-05-17.md` for full context.

- Probe messages must use the entity's class label — never say "Specialist" for an Agent or Minion.
- Never show raw HTTP codes or internal error codes (`[ASRT-NNN]`) in admin-facing UI — use `humanizeProbeMessage()` in `AgentRosterAccordion.tsx`.
- Gustavo (`gaspar`) routes through the specialist probe endpoint by design — handled by early-return in `runtime.ts`.
- Any new agent absent from `SPECIALIST_CATALOG` needs a dedicated probe endpoint or early-return in `runtime.ts`.

---

## Recent Significant Changes

<!-- keep ≤ 3 entries; remove oldest when adding new ones -->
| Date | Change |
|---|---|
| 2026-05-19 | **§2 T1-4 campaign complete — `DEFAULT_ADR_GROWTH_RATE` confirmed retired (session 27).** Constant absent from codebase; replaced by `SEED_ADR_GROWTH_RATE = 0.03` (Cat 5). Engine reads `adrGrowthRate` from `modelDefaultsInput` (route layer → DB). All `DEFAULT_*` financial constants from the T1-4 target list are now gone. |
| 2026-05-19 | **Phase 2 shipped — Valentina research specialist + engine wiring (session 27).** `computePropertyDefaults` reads `adrGrowthRate`, `maxOccupancy`, `adrByTier` from `ModelDefaultsInput`. Valentina: pure LLM specialist batches eligible `model_defaults` rows, writes `proposed_*` columns. Admin route + Rebecca tool `trigger_model_defaults_research` wired. |
| 2026-05-19 | **`DEFAULT_PROPERTY_INCOME_TAX_RATE` + `DEFAULT_LAND_VALUE_PERCENT` retired (§2 T1-4, session 24).** Commit A (`7f8c6fd57`) rewired all ~16 consumers. `RESEARCH_TAX_RATE_25_PCT = 0.25` added; `hold-vs-sell.ts` `land_value_pct` tightened to required. All `?? DEFAULT_*` chains removed. Commit B (`8c133659c`) deleted both definitions with tombstone comments. |
