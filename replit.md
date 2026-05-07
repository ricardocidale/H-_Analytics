# H+ Analytics — replit.md (Replit Agent Contract)

> **Canonical agent contract for Replit Agent sessions in this repo.**
> Counterpart: `CLAUDE.md` (Claude Code Agent Contract). Shared sections (architecture, rules, vocabulary, skill table) must stay verbatim-identical between the two files. See § "Memory-file harmonization (mandatory shipping gate)" in `CLAUDE.md`.

H+ Analytics is a hospitality-sector financial analytics platform that helps asset managers model scenarios, run portfolio projections, and generate property-level investor slide decks.

## Run & Operate

- **Run:** Use `restart_workflow <artifact_name>` (e.g., `restart_workflow hospitality-business-portal`). Never run `pnpm dev` at the workspace root.
- **Key secrets** (must exist in both Replit secrets AND Railway): `POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Full list: `CLAUDE.md` § "Environment Variables (api-server)".
- **Health check:** `GET /api/health/live`

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Node.js 24 |
| API | Express 5 |
| Database | Neon Postgres + Drizzle ORM (`@workspace/db`) + pgvector |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (OpenAPI spec in `lib/api-spec`) |
| Frontend build | Vite |
| Backend build | esbuild ESM bundle via `build.mjs` |
| File storage | Cloudflare R2 |
| Auth | Google OAuth (production) + Replit OIDC (dev/legacy) |

## Where things live

| What | Where |
|---|---|
| Frontend | `artifacts/hospitality-business-portal/` |
| API server | `artifacts/api-server/` |
| Mockup sandbox | `artifacts/mockup-sandbox/` |
| DB schema (Drizzle tables) | `lib/db/src/schema/` (`@workspace/db`) |
| DB SQL migrations (applied at boot) | `artifacts/api-server/migrations/` + journal at `…/meta/_journal.json` |
| DB runtime guards (belt-and-suspenders) | `artifacts/api-server/src/migrations/*.ts` — idempotent TS, run every boot |
| Shared constants | `lib/shared/src/constants*.ts` |
| OpenAPI spec | `lib/api-spec/`; generated hooks in `lib/api-client-react/` |
| API routes | `artifacts/api-server/src/routes/` |
| Production config | `Dockerfile`, `railway.toml` |
| Canonical docs | `CLAUDE.md` (source of truth for architecture, stack, rules) |
| LB slide visual spec | `attached_assets/L+B_Property_6-Slide_Cannonical_*.pdf/png`, R2 `canonical/lb-6-slide/slides/slide-{1..6}.png` |

## Product

- **Hospitality Financial Analytics:** Scenario modeling, portfolio projections, financial engine.
- **Investor Slide Decks:** Property-level PDF decks via Playwright HTML→PDF (`GET /api/properties/:id/deck.pdf`).
- **LB Slide Deck Factory:** Canonical 6-slide portfolio deck (admin-only `/lb-slides`). The **Slide Factory V2 UI** (`SlideFactoryPanel.tsx` in `features/slide-factory/`) manages the pipeline: Tab 1 = brief upload (PDF/PPTX → R2), Tab 3 = property assignment (slides 1/2/3/5); status-driven tab lock.
- **Rebecca AI Assistant:** Semantic KB search (pgvector + OpenAI embeddings). The only AI assistant — do not add others.
- **AI Intelligence (Analyst):** Specialist-driven research surfacing range badges, verdict cards, and contextual tips. All intelligence is 100% specialist-sourced — never hard-coded.

## Inviolable Rules

> Full rationale in `CLAUDE.md` § "Inviolable login / auth rules" and § "Architecture Notes".

1. **Secrets parity.** Every env var must exist in both Railway AND Replit secrets. Absence silently disables features (`GOOGLE_CLIENT_ID` is the canonical example).
2. **No silent async-fetch gates.** Never `useState(false)` gated by a fire-and-forget fetch. Client always attempts; server surfaces errors as toasts.
3. **Dev-login is server-gated.** Client never pre-checks; server returns 403 in production via `isPublishedDeployment()`.
4. **Auth navigations: `window.location`, not `window.top`.** `window.top` is cross-origin in the Replit iframe.
5. **`DEV_SKIP_AUTH` is permanently `false`.** Never edit `artifacts/api-server/src/dev-flags.ts`.
6. **Intelligence display is 100% specialist-sourced.** No component may hard-code a range, write its own advice, or derive a suggestion locally. See `analyst-intelligence-display` skill.
7. **No Replit-managed infra.** Never provision Replit DB, Object Storage, or Auth. Run the `prefer-external-dependencies` skill first.
8. **Production ships via `git push` → Railway, not Replit Publish.** Replit Workspace is dev preview only.
9. **Financial assumptions from storage.** Never hardcode; source from `storage.getGlobalAssumptions(userId)` or `DEFAULT_*` constants in `lib/shared/src/constants*.ts`.

## Gotchas

- **Duplicate worktrees:** Old `.claude/worktrees/agent-*/` directories cause `DUPLICATE_PREVIEW_PATH` errors. Clean with `git worktree remove --force` + `git worktree prune`.
- **CE Skill Adaptation:** CE skills need Replit adaptation. Read `.agents/ce-agents/REPLIT-ADAPTATION.md` before following any CE skill.
- **Shared proxy only.** Never call service ports directly. Always route through `localhost:80/<path>` in curl and application code.
- **`executeSql` tool hits the wrong database.** The code-execution `executeSql()` callback connects to Replit's built-in PostgreSQL, NOT the app's Neon database. To audit or query the real DB: use admin API endpoints via `curl -b <auth-cookie>` (authenticate first with `POST /api/auth/dev-login`), or run a one-off Node.js script using `process.env.POSTGRES_URL` with the `pg` client from `artifacts/api-server/node_modules/pg`.
- **Drizzle migration state can lag the journal.** `drizzle.__drizzle_migrations` tracks what Drizzle's `migrate()` has applied. If new `.sql` files are added to `artifacts/api-server/migrations/` but the server's bootstrap (`bootstrapDrizzleMigrationState`) already set count > 0, `migrate()` may not apply them in dev (the runner uses hash matching). After manually applying DDL via Node.js script, mark the journal entries applied: compute SHA-256 of each `.sql` file's content and `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)`. The migration state was synced to 52 entries on 2026-05-07.

## Pointers

| Topic | Where |
|---|---|
| Architecture, auth rules, number taxonomy | `CLAUDE.md` (the canonical deep source) |
| Production deployment + env vars | `CLAUDE.md` § "Production Deployment" and § "Environment Variables (api-server)" |
| LB Slides pipeline + visual spec | `CLAUDE.md` § "LB Slides — investor PDF decks (Playwright HTML→PDF)" |
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

## Recent Significant Changes

| Date | Change |
|---|---|
| 2026-05-07 | **DB audit + 4 missing tables created.** `iris_runs`, `knowledge_registry`, `country_economic_data`, `slide_factory_runs` — all defined in schema + SQL migrations but never applied to Neon. Applied DDL directly; `drizzle.__drizzle_migrations` synced to 52 entries. Country economic data seeded (4 rows). Vector store healthy: 337 chunks, 8 namespaces. Known pre-existing: Iris agent errors with `temperature + top_p` conflict in its LLM call — table works, agent config needs fix. |
| 2026-05-07 | **Canonical slide assets reorganized.** `attached_assets/canonical/{pdf,png,json,pptx}/` — 10 canonical files, organized by format. 250MB → 106MB (144MB of stale PPTXs, old PDFs, session artifacts, test renders removed). All script, skill, doc, and `CLAUDE.md` references updated to new paths. |
| 2026-05-07 | **Slide Factory V2 UI — Tab 1 (Brief) + Tab 3 (Properties).** `SlideFactoryPanel.tsx` in `features/slide-factory/`. Tab 1: PDF/PPTX brief upload via presigned R2, accept flow, status-driven lock. Tab 3: 4-property selectors (slides 1/2/3/5). Tabs 2/4/5/6 are pipeline-stage placeholders. Polls every 5 s only in transitional states. |
| 2026-05-05 | **`analyst-intelligence-display` skill created.** Canonical display components (`AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog`), conviction floor, severity color system, voice rule, anti-patterns. |
| 2026-05-04 | **LB Slide Studio + auth hardening.** `LbSlides.tsx` → 7-tab Slide Studio with per-slide editor panels. Auth: `GOOGLE_CLIENT_ID` required in both envs; `devLoginAvailable` async-fetch gate removed; Google OAuth opens `_blank`; 5 inviolable auth rules locked in. |
| 2026-05-03 | **Playwright HTML→PDF pipeline.** Python/satori tracks removed. React `internal-deck/` → headless Chromium → R2. Property DB IDs verified (Belleayre=52, Loch Sheldrake=51, San Diego=55). |
| 2026-05-02 | **Production moved to Railway.** Ships via `Dockerfile` + `railway.toml`. Replit Workspace is dev preview only. |
