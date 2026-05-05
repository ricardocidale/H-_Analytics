# Replit Workspace — H+ Analytics

H+ Analytics is a hospitality-sector financial analytics platform. Asset managers use it to model scenarios, run portfolio projections, and generate property-level investor slide decks (HTML → PDF via Playwright, matched to the canonical L+B 6-slide design).

A separate **LB Slide Deck** pipeline (also called the **Slide Factory**) produces ONE canonical 6-slide portfolio investor deck (not per-property). CC owns the Slide Factory codebase. Admin assigns properties to slides 1, 2, 3, 5; slides 4 (portfolio grid) and 6 (10-year USALI aggregate) are auto-generated. Route: `/lb-slides` (admin only). PDF route: `POST /api/lb-slides/render` → `GET /api/lb-slides/download/combined.pdf`. Playwright renders `/internal/lb-deck?token=<hmac-lb-token>` as a single 6-page PDF. DB table: `lb_slides_config` (single-row, id always = 1).

> **`claude.md` is the canonical source of truth** for architecture, stack, commands, environment variables, and all project rules. This file contains only Replit-platform-specific configuration that mirrors or routes back to `claude.md`. If wording diverges between the two files for a shared fact, that is a bug — fix it before any other commit lands. (See the `agent-memory-files` skill.)

---

## Artifacts

| Artifact | Dir | Preview path |
|---|---|---|
| H+ Analytics (React + Vite frontend) | `artifacts/hospitality-business-portal` | `/` |
| API Server (Express 5) | `artifacts/api-server` | `/api` |
| Mockup Sandbox (design sandbox) | `artifacts/mockup-sandbox` | `/__mockup/` |

## Workflows

Each artifact has a corresponding Replit workflow. To restart a service, use `restart_workflow` with the artifact name. Never run `pnpm dev` at the workspace root — workflows manage env vars (`PORT`, `BASE_PATH`) that the root script cannot wire up.

If old task-agent sessions leave behind `.claude/worktrees/agent-*/` directories, they get re-registered as duplicate artifacts (same `previewPath`) and pollute the workflow picker, which also breaks `verifyAndReplaceArtifactToml` with `DUPLICATE_PREVIEW_PATH`. Clean them up with `git worktree remove --force` (or `rm -rf` the dir + `git worktree prune`) so only the three canonical `artifacts/*` workflows above remain.

## Shared proxy routing

All traffic is routed by path through a shared reverse proxy on `localhost:80`. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.

## Deployment target — Railway (NOT Replit Publish)

**Production runs on Railway, not on Replit.** Replit Publish (both `autoscale` and `vm` / Reserved VM) failed for this app — see `claude.md` § "Production Deployment" for the full deploy contract, including the required Railway service env vars.

- Production wiring lives in `Dockerfile` (root) + `railway.toml` (root). Healthcheck is `GET /api/health/live` with a 300 s timeout.
- The legacy `.replit` `[deployment]` block and the `artifacts/api-server/.replit-artifact/artifact.toml` `[services.production]` block are kept for the workflow tooling but are **not** the production path. Do **not** add new code that depends on them, and do **not** call `suggest_deploy()` for this project.
- Replit Workspace is for **dev preview, code review, and task agents only**. Shipping happens via `git push` → Railway build.

## External services (none Replit-managed)

Every infrastructure dep this app uses is an external service the user already pays for. Do not provision Replit-managed equivalents (Replit Database, Replit Object Storage, Replit Auth) — they would split the source of truth from production Railway. Use the `prefer-external-dependencies` skill before any infrastructure-shaped tool call.

| Concern | Service | Secrets |
|---|---|---|
| Database + pgvector | **Neon Postgres** | `POSTGRES_URL` |
| Object storage | **Cloudflare R2** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` |
| User auth | **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| LLMs | **OpenAI, Anthropic, Gemini** (direct SDKs) | `OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_GEMINI_API_KEY` |
| Macro data | **FRED** | `FRED_API_KEY` |
| Email | **Resend** | `RESEND_API_KEY` |
| Error monitoring | **Sentry** | `SENTRY_DSN` |
| Project tracking | **Linear** | Replit connector `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG` (broker only — falls back to plain env vars) |
| Source control / API | **GitHub** | `GITHUB_PAT` |
| Hosting | **Railway** (Docker) | configured via `railway.toml` |

## Health endpoint

`GET /api/health/live` (not `/api/healthz`). This is the path Railway's `healthcheckPath` must point at (already configured in `railway.toml`). The server registers `/api/health/live` synchronously before `httpServer.listen()`, then defers migrations + seeds + vector indexing + scheduler boot to `setImmediate`, so liveness becomes reachable within seconds of process start. Drift in the probe path causes silent republish failures.

## Production bundle

`artifacts/api-server/build.mjs` externalizes large doc/media libraries (`@react-pdf/renderer`, `pptxgenjs`, `xlsx`, `docx`, `satori`, `jspdf`, `archiver`) **plus** the AI SDKs (`@ai-sdk/*`, `@anthropic-ai/sdk`, `@google/genai`, `@perplexity-ai/perplexity_ai`, `openai`, `ai`), `country-state-city`, `@sentry/*`, and `google-auth-library`. They are loaded from `node_modules` at runtime instead of being inlined into `dist/index.mjs`. Result: the bundle dropped from ~32 MB → ~7.5 MB. Each of these packages must remain in `dependencies` (not `devDependencies`) so pnpm installs them in the Railway runtime container. If you add another heavy package that is only used on a small number of code paths, externalize it the same way.

**Two SPAs in one image.** The Dockerfile builds both frontends and copies them next to the api-server bundle; `artifacts/api-server/src/static.ts` mounts them at `/` (H+ Analytics) and `/__mockup/`. One Railway service serves `/api/*` plus both SPAs from one process on one port. See `claude.md` § "Production Deployment" → "Single-container model" for the authoritative description.

## pnpm workspace

See the `pnpm-workspace` skill for workspace structure, TypeScript project references, and package conventions.

## Screenshot and image file conventions

- **Temporary / debug screenshots** → `screenshots/` (gitignored, never committed)
- **Permanent / referenced images** → `attached_assets/` (committed, tracked by git)
- Root-level `*.png`, `*.jpg`, `*.jpeg`, `*.webp` are blocked by `.gitignore` to keep the repo root clean.
- When using the `screenshot` tool, always pass `save_to: "screenshots/<descriptive-name>.jpg"` instead of writing to the project root.

## Compound Engineering (CE) skills — Replit adaptation

The CE plugin was vendored from upstream (Claude Code / Codex / Cursor). Many CE skills reference tools, git workflows, and directory structures that **do not exist on Replit Agent**. Before following any CE skill, read `.agents/ce-agents/REPLIT-ADAPTATION.md` — it is the authoritative override for all environment-specific instructions (no worktrees, no destructive git, no pre-commit hooks, no `.claude/` dirs, no `bun`, no `gh` CLI, no `Task` tool, no `TodoWrite`, workflows instead of `npm run dev`). See also `.agents/skills/ce-setup/SKILL.md` for the summary table.

## Skills

Skills are process documents that guide AI agents. See `claude.md` § "Agent & Skill System" for the full picture and `.agents/skills/README.md` for a complete index.

**How to invoke in Replit:** type the skill name as a text command. Example: *"use the ui-page-patterns skill"*.

> Note: the `advisor()` tool and the `Skill` tool are not available in Replit Agent. Skills work via plain-text invocation only.

### Key skills (mirrors `claude.md` § "Key project-specific skills" — keep wording identical)

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
| `hplus-admin-nav-ia` | Placing data sources, APIs, Specialists, LLMs, or AI agents in the Admin / AI Intelligence sidebar |
| `lb-slides-canonical-pngs` | Comparing any rendered slide output against the pixel-authoritative canonical PNGs — R2 keys, local paths, per-slide comparison checklist, re-upload workflow |
| `agent-memory-files` | Editing `claude.md` or `replit.md` — keep them harmonized |

> **AI assistant scope**: This app has one AI assistant — **Rebecca** (semantic KB search). Marcela was removed. See `claude.md` § "AI assistant — Rebecca only".

> **LB Slides** (DB schema, API routes, Playwright HTML→PDF pipeline, admin UI): see `claude.md` § "LB Slides — investor PDF decks (Playwright HTML→PDF)". Visual spec source-of-truth = canonical PDF (`attached_assets/L+B_Property_6-Slide_Cannonical_1777775653617.pdf`) + **6 pixel-authoritative canonical PNGs** (`attached_assets/L+B_Property_6-Slide_Cannonical_Page_{1..6}_*.png`, also at R2 `canonical/lb-6-slide/slides/slide-{1..6}.png`) + per-slide briefs (`attached_assets/Pasted-SLIDE-N-…txt`) + machine-readable layout extract (`slide_analysis_agent_report.precise_1777824741855.json`). **PNG wins over JSON spec when they disagree.** Use `lb-slides-canonical-pngs` skill for comparison checklist; see `coding-agent-instructions.md` §15 for the mandatory generation workflow (Step 0: load canonical PNG). The legacy Python + `python-pptx` track has been removed — do not reintroduce it.

> **LB Slides rebuild canon** (locked 2026-05-03, see `claude.md` Recent Changes for full rationale): canonical = visual spec only; body text + every numeric from seed/engine; CSS `#FFFFFF` page background; consistent font stack with exceptions only after strong-LLM design review; six-slide multi-property deck (Slide 1 Belleayre = DB id **52** (was thought to be 32), Slide 2 Loch Sheldrake = DB id **51**, Slide 3 San Diego = DB id **55**, Slides 4–6 property-agnostic). **Property nicknames** (user-confirmed 2026-05-03): canonical "Sul Monte" / "Su Monte" = the owner's nickname for **Belleayre Mountain** — same property; the canonical Sul Monte copy is therefore valid Belleayre source material, not filler. "Hazelnis Retreat" (matches Loch Sheldrake's street address 59 Hazelnis Drive) and "Cartagena Duplex" (matches San Diego's Cartagena location) are likely analogous owner/location nicknames but **not yet user-confirmed** — treat as probable nicknames pending confirmation. Seed-canonical names remain `Belleayre Mountain`, `Loch Sheldrake`, `San Diego`. Provisional pending user preview of v1.

> **Canonical page archetypes**: see `claude.md` § "Canonical Page Archetypes".

## Secrets present in this Repl (dev)

`POSTGRES_URL` (Neon), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (Cloudflare R2), `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

These point at the **same external services** the production Railway deployment uses (Neon, Cloudflare R2, Google OAuth, OpenAI). Do not swap any of them for a Replit-managed equivalent — that would split dev from prod.

For the **full** env-var contract used by the api-server (including `DATABASE_URL`, `STORAGE_PROVIDER`, `AUTH_PROVIDER`, `NODE_ENV`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `R2_PUBLIC_URL`, `SENTRY_DSN`, `RESEND_API_KEY`), see `claude.md` § "Environment Variables (api-server)" and § "Production Deployment".

## Inviolable login / auth rules

These rules are identical to `claude.md` § "Inviolable login / auth rules" — keep wording in sync.

1. **Railway ↔ Replit secrets must stay in parity.** Any env var the api-server reads at runtime must exist in *both* Railway service variables *and* Replit Repl secrets. Absence in either environment silently disables the dependent feature (Google auth 404, AI routes dead, etc.). After adding a var to Railway, add it to Replit secrets immediately in the same session. `GOOGLE_CLIENT_ID` was absent from Replit until 2026-05-04 — that is the canonical example of what this rule prevents.

2. **Never gate UI behaviour on a silent async fetch.** A `useState(false)` flag that only flips `true` if a fire-and-forget `fetch()` succeeds is banned. Silent `.catch(() => {})` means any network hiccup (iframe context, canvas preview, proxy quirk) leaves the feature permanently disabled with no visible error. **The server is the authority; the client should always attempt the action and surface server-returned errors as toasts.**

3. **Dev-login is dev-only by server gate, not client gate.** `/api/auth/dev-login` is blocked server-side by `isPublishedDeployment()`. The login logo always fires the request unconditionally; the server returns 403 if called in production. No client pre-check needed or allowed.

4. **Auth navigations must use `window.location`, never `window.top`.** The Replit canvas wraps the app in a `workspace_iframe.html` shell, making `window.top` the cross-origin Replit Agent UI — setting `window.top.location.href` is blocked by the browser's same-origin policy. Use `window.location.href` / `window.location.replace()` directly: the app iframe navigates itself, and `window.location` works identically in a standalone browser tab (where `window.top === window`). Applies to dev-login success in `Login.tsx` and logout in `lib/auth.tsx` (`onSuccess`). Google OAuth uses `window.open("/api/auth/google", "_blank")` to escape the iframe (Google pages send `X-Frame-Options: DENY`); `Login.tsx` polls `refetch()` until the session is established. Corrected 2026-05-04.

5. **`DEV_SKIP_AUTH` must remain `false`.** The flag in `artifacts/api-server/src/dev-flags.ts` must never be set back to `true`. Real auth is always active in development — this prevents masked auth bugs from reaching production. Decided 2026-05-04.
