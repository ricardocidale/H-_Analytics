# H+ Analytics

H+ Analytics is a hospitality-sector financial analytics platform that helps asset managers model scenarios, run portfolio projections, and generate property-level investor slide decks.

## Run & Operate

- **Run:** Use `restart_workflow <artifact_name>` (e.g., `restart_workflow hospitality-business-portal`) for services. Never run `pnpm dev` at the workspace root.
- **Environment Variables:**
    - `POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` must be present in Replit secrets and Railway.
    - Full list in `claude.md` § "Environment Variables (api-server)".
- **Health Check:** `GET /api/health/live`

## Stack

- **Frontend:** React, Vite
- **Backend:** Express 5
- **Runtime:** Node.js (via pnpm workspace)
- **Database:** Neon Postgres (with pgvector)
- **ORM:** _Populate as you build_
- **Validation:** _Populate as you build_
- **Build Tool:** Vite (frontend), `build.mjs` (backend)

## Where things live

- **Frontend App:** `artifacts/hospitality-business-portal/`
- **API Server:** `artifacts/api-server/`
- **Mockup Sandbox:** `artifacts/mockup-sandbox/`
- **DB Schema:** `lib/db/schema.ts` (implied, not explicitly stated but typical for Drizzle)
- **API Contracts:** Defined within `artifacts/api-server/src/routes/` and related files.
- **Canonical Docs:** `claude.md` (source of truth for architecture, stack, rules)
- **Replit Config:** `.replit`, `artifacts/*/.replit-artifact/artifact.toml`
- **Production Deployment Config:** `Dockerfile`, `railway.toml`
- **Shared Constants:** `lib/shared/src/constants.ts`
- **LB Slide Deck Visual Spec:** `attached_assets/L+B_Property_6-Slide_Cannonical_1777775653617.pdf`, `attached_assets/L+B_Property_6-Slide_Cannonical_Page_{1..6}_*.png`, R2 `canonical/lb-6-slide/slides/slide-{1..6}.png`

## Architecture decisions

- **Single-container Model:** Both frontends (H+ Analytics, Mockup Sandbox) and the API server are served from a single Docker container, with `artifacts/api-server/src/static.ts` mounting SPAs.
- **Externalized Dependencies:** Large/heavy Node.js modules are externalized from the API server bundle and loaded from `node_modules` at runtime to reduce bundle size.
- **Shared Proxy Routing:** All internal service communication must go through `localhost:80/<path>` rather than direct port access, ensuring consistent routing and base path handling.
- **Production on Railway:** Production deployments explicitly use Railway via `git push`, not Replit Publish, due to past issues.
- **External Services Only:** No Replit-managed infrastructure (DB, storage, auth) is used; all services are external (Neon, Cloudflare R2, Google OAuth, etc.) to maintain parity with production.

## Product

- **Hospitality Financial Analytics:** Core platform for scenario modeling and portfolio projections.
- **Investor Slide Deck Generation (H+ Analytics):** Property-level slide decks (HTML to PDF via Playwright).
- **LB Slide Deck Factory:** Canonical 6-slide portfolio investor deck generation (admin-only route `/lb-slides`).
- **Rebecca AI Assistant:** Semantic knowledge base search.

## User preferences

- _Populate as you build_

## Gotchas

- **Duplicate Artifacts:** Old `.claude/worktrees/agent-*/` directories can cause `DUPLICATE_PREVIEW_PATH` errors. Clean them with `git worktree remove --force` or `rm -rf` + `git worktree prune`.
- **Assumption-class Constants:** Never hardcode financial assumption values; always source from `storage.getGlobalAssumptions(userId)` or `DEFAULT_*` fallbacks from canonical constants files.
- **CE Skill Adaptation:** CE skills need adaptation for the Replit environment; refer to `.agents/ce-agents/REPLIT-ADAPTATION.md` before following any CE skill.
- **Secrets Parity:** Railway and Replit secrets must always be in sync.
- **UI Behavior on Async Fetch:** Never gate UI behavior on silent, fire-and-forget async fetches; clients should always attempt actions and surface server errors.
- **Auth Navigations:** Use `window.location.href` or `window.location.replace()` for auth navigations, never `window.top`.
- **`DEV_SKIP_AUTH`:** Must always remain `false` in `artifacts/api-server/src/dev-flags.ts`.

## Pointers

- **Agent & Skill System:** `claude.md` § "Agent & Skill System", `.agents/skills/README.md`
- **Replit Adaptation for CE Skills:** `.agents/ce-agents/REPLIT-ADAPTATION.md`
- **pnpm Workspace:** `pnpm-workspace` skill
- **UI Page Patterns:** `ui-page-patterns` skill
- **Embedded AI Agent:** `embedded-ai-agent` skill
- **Replit Independence:** `replit-independence` skill
- **External Dependencies:** `prefer-external-dependencies` skill
- **Code Review:** `nai-code-review` skill
- **Architecture Decisions:** `architecture-decision-records` skill
- **H+ Vision Templates:** `hplus-vision-templates` skill
- **H+ Renovation Benchmarks:** `hplus-renovation-benchmarks` skill
- **H+ Admin Nav IA:** `hplus-admin-nav-ia` skill
- **LB Slides Canonical PNGs:** `lb-slides-canonical-pngs` skill
- **Agent Memory Files:** `agent-memory-files` skill
- **Production Deployment Contract:** `claude.md` § "Production Deployment"
- **Environment Variables (API Server):** `claude.md` § "Environment Variables (api-server)"
- **Inviolable Login/Auth Rules:** `claude.md` § "Inviolable login / auth rules"
- **LB Slides Visual Spec:** `claude.md` § "LB Slides — investor PDF decks (Playwright HTML→PDF)"