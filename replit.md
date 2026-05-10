# H+ Analytics — replit.md (Replit Agent Contract)

> **Replit Agent contract for this repo.** Canonical deep source: `CLAUDE.md`. All architecture rules, stack details, env vars, and inviolable constraints live there — this file holds only what is Replit-specific plus a routing table.

H+ Analytics is a hospitality-sector financial analytics platform. Full product description: `CLAUDE.md` § "Project Source of Truth".

---

## Run & Operate

- **Run:** `restart_workflow <artifact_name>` (e.g., `restart_workflow hospitality-business-portal`). Never run `pnpm dev` at the workspace root.
- **Key secrets** (must exist in both Replit secrets AND Railway): `POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Full list: `CLAUDE.md` § "Environment Variables (api-server)".
- **Health check:** `GET /api/health/live`

---

## Inviolable Rules

See `CLAUDE.md` §§ 1–12 (no hardcoded values — numeric literals AND integration identifiers; number taxonomy; seed rules; ADR-007; plan verification; institutional knowledge; agent parity; market rates; financial engine authoring; naming convention; frontend design; model cost) and § "Inviolable login / auth rules" (5 auth rules) for the full set.

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
- **Drizzle migration state can lag the journal.** After manually applying DDL, sync `drizzle.__drizzle_migrations`: compute SHA-256 of each unapplied `.sql` file and `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)`. Synced to 53 entries on 2026-05-08 (after migration 0042 — `rebecca_chat_prefs`).

---

## Agent Taxonomy (verbatim from `CLAUDE.md` § 10)

Four core concepts — keep definitions consistent across all docs:

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples: Aldo (PDF/PPTX extractor), Dino (pixel-diff calculator), Carlo (Zod validator).

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI as intelligence badges, conviction ranges, or cited copy. Examples: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format (e.g., Sofia-01, Lorenzo-03). When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline.

Canonical source: `CLAUDE.md` § 10. Do not edit this block here — update `CLAUDE.md` first, then mirror verbatim.

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
| pnpm workspace | `pnpm-workspace` skill |
| UI pages | `ui-page-patterns` skill |
| Rebecca (AI assistant) | `embedded-ai-agent` skill |
| Replit portability | `replit-independence` skill |
| External infra (never Replit-managed) | `prefer-external-dependencies` skill |
| Code review | `nai-code-review` skill |
| Architecture decisions | `architecture-decision-records` skill |
| Slide text + char limits | `hplus-vision-templates` skill |
| Reno cost ranges | `hplus-renovation-benchmarks` skill |
| Admin nav placement | `hplus-admin-nav-ia` skill |
| Canonical slide PNGs | `lb-slides-canonical-pngs` skill |
| Slide renderer contract | `lb-slides-renderer` skill |
| Research trigger buttons | `analyst-research-buttons` skill |
| Intelligence display components | `analyst-intelligence-display` skill |
| Memory file harmonization | `agent-memory-files` skill |
| Inflation policy (USD-base calc) | `inflation-cascade` skill — **supersedes prior country cascade** |
| Integration-health audit (Costantino) | `costantino-data-custodian` skill |
| Agent naming + reserved names | `slide-factory` skill |

---

## User Preferences

- **File storage:** All project files stay local to this MacBook. Do not use Google Drive or Dropbox for any project files, assets, or outputs.

---

## Recent Significant Changes

<!-- keep ≤ 3 entries; remove oldest when adding new ones -->
| Date | Change |
|---|---|
| 2026-05-10 | **App renamed: "H+ Analytics" → "H+ Analysis".** `APP_BRAND_NAME` / `APP_FULL_BRAND` updated in `lib/shared` and `lib/db` constants. All 41 hardcoded occurrences across frontend (15 files) and backend (25 files) updated. Also fixed logo-click dev-login: `handleAdminLogin` now uses `window.location.href = "/"` (hard navigation) instead of wouter `setLocation` to avoid race condition where the auth guard reads stale `user=null` before React re-renders after the refetch. |
| 2026-05-09 | **Agent-native Wave 0 (W0.1–W0.4).** `rebeccaResponseMode` from DB now used as default when chat body omits `responseMode` (W0.1). Portfolio verification opinion injected into Rebecca's system prompt when a property is in scope (W0.2). Parity map updated with 4 missing tools (`list_scenarios`, `get_scenario`, `patch_property`, `get_tripadvisor_hotels`) + CI guard test (W0.3). Dino constants already extracted — W0.4 confirmed done (W0.4). |
| 2026-05-09 | **Costantino — Data Custodian (Step 0).** New periodic agentic scheduler that audits every `admin_resources` row of kind {api, source, mcp} with a `config.healthProbe` recipe. 8-tool loop, findings persist in new `costantino_findings` table (migration 0048), cadence admin-editable via parameter row `costantino-health-cycle-interval-ms` (default 5d, clamp 60s–30d), self-rescheduling `setTimeout` chain, Phase 3l boot hook. Runs side-by-side with legacy `resource-health-checker.ts` — Step 1 retires it. Skill: `costantino-data-custodian`. |
