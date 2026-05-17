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

See `CLAUDE.md` §§ 1–13 (no hardcoded values — numeric literals AND integration identifiers; number taxonomy **[Category 2 DEFAULT_* is legacy — ALL DEFAULT_* are violations, remove entirely; `?? DEFAULT_X` fallback is a violation; algorithm calibration constants like `NOL_UTILIZATION_CAP` / `PRIORITY_*` stay in TS; `SEED_*` in migration guards OK; test files exempt from checker — see §2 + `hplus-variable-taxonomy` skill]**; seed rules; ADR-007; plan verification; institutional knowledge; agent parity; market rates; financial engine authoring; naming convention; frontend design; model cost; **UI canonical enforcement — Rule A "Analyst" CTA + Rule B `CurrentThemeTab` horizontal tabs, mechanically gated by `scripts/src/check-ui-canonical.ts`**) and § "Inviolable login / auth rules" (5 auth rules) for the full set.

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

All agents, minions, and orchestrators in H+ Analytics use human first names from Brazilian or Italian naming traditions (male or female).

**Three roles — never conflate:**
- **Orchestrators** — route work across agents; never produce content directly
- **Agents** — do the substantive work (LLM or deterministic)
- **Minions** — deterministic helpers called by agents; no LLM, no judgment

### Canonical definitions

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples: Aldo (PDF/PPTX extractor), Dino (pixel-diff calculator), Carlo (Zod validator), Gaetano (vendor pass-through cost fetcher, `artifacts/api-server/src/ai/ambient/minions/vendor-passthrough-costs.ts`), Renato (Mgmt Co markup factor fetcher, `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts`), Otavio (report PDF pagination pre-pass, `artifacts/api-server/src/report/minions/otavio-pagination.ts`).

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI as intelligence badges, conviction ranges, or cited copy. Examples: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format (e.g., Sofia-01, Lorenzo-03). When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline.

**Name formats:**
- **Swarm agents** (job-specific, only used in one pipeline): `Name-NN` zero-padded (e.g., Sofia-01, Lorenzo-03)
- **Cross-app specialists** (used in multiple surfaces): single name (e.g., Maya, Lucca)
- **Orchestrators and minions**: single name

**Every member has three fields:**
- `role` — one-line title (e.g., "Slide 1 Builder")
- `short_description` — 1-2 sentences for card/list views
- `long_description` — full capabilities, inputs, outputs, model tier

**Reserved names and full inventory:** `.agents/skills/slide-factory/SKILL.md`. Never use: Sergio, Milton.

---

## Pointers

| Topic | Where |
|---|---|
| Architecture, auth rules, number taxonomy | `CLAUDE.md` (canonical deep source) |
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
| 2026-05-17 | **Brand Assets admin restructure (4-tab layout).** `BrandAssetsPage.tsx` rebuilt with tabs: App Logo (super-admin only, hidden for non-super-admins) · Logos (unchanged) · Animations (NEW — collapsible Rebecca/Analyst families via Card+Collapsible, read-only) · Other Graphics (renamed from "Brand Assets"). Backend: `PATCH /api/app-branding` upgraded to `requireSuperAdmin`. Shared `animationCatalog.tsx` is single source of truth for both Brand Assets and Intelligence Animations page. Gates: typecheck ✅, portal lint ✅. |
| 2026-05-17 | **Agent roster probe fixes.** (a) Gustavo's probe no longer returns 404 — `runtime.ts` now early-returns a pass for `ORCHESTRATOR_SPECIALIST_ID` (gaspar) since he's an in-process router absent from `SPECIALIST_CATALOG`. (b) `humanizeProbeMessage()` added to `AgentRosterAccordion.tsx` — strips HTTP codes and internal error codes, uses correct class label (Agent/Specialist/Helper). Toast title changed from "probe failed" to "check failed". Solution doc: `docs/solutions/ui-patterns/agent-roster-probe-messages-2026-05-17.md`. Gates: typecheck ✅. |
| 2026-05-17 | **Agent roster rows → collapsible pills.** `AgentRosterAccordion.tsx` rebuilt — Radix Accordion replaced with shadcn Collapsible per-row. Collapsed state: compact pill; expanded: card body drops below. Icon import fixed to `@/components/icons/themed-icons`. All three roster pages pick up the change. Gates: typecheck ✅, lint ✅. |
| 2026-05-17 | **UI canonical enforcement gate shipped (Plan 2026-05-16-004; CLAUDE.md §13).** Mechanical zero-tolerance gate added at `scripts/src/check-ui-canonical.ts` covering Rule A (canonical `Analyst` CTA) and Rule B (canonical `<CurrentThemeTab>` wrapper). `CurrentThemeTab` rebuilt on Radix internals. Meta-checker `check:gate-health`. Gates: typecheck ✅, check:ui-canonical ✅, check:gate-health ✅, scripts vitest ✅ (17/17 new tests). |
