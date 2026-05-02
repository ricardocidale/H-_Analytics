# Replit Workspace — H+ Analytics

H+ Analytics is a hospitality-sector financial analytics platform. Asset managers use it to model scenarios, run portfolio projections, and generate property-level PPTX investor slide decks using the L+B template.

> **`claude.md` is the canonical source of truth** for architecture, stack, commands, environment variables, and all project rules. This file contains only Replit-platform-specific configuration that mirrors or routes back to `claude.md`. If wording diverges between the two files for a shared fact, that is a bug — fix it before any other commit lands. (See the `agent-memory-files` skill.)

---

## Artifacts

| Artifact | Dir | Preview path |
|---|---|---|
| H+ Analytics (React + Vite frontend) | `artifacts/hospitality-business-portal` | `/` |
| API Server (Express 5) | `artifacts/api-server` | `/api` |
| Mockup Sandbox (design sandbox) | `artifacts/mockup-sandbox` | `/__mockup/` |
| L+B Property Slides (slide deck viewer) | `artifacts/property-slides` | `/property-slides/` |

## Workflows

Each artifact has a corresponding Replit workflow. To restart a service, use `restart_workflow` with the artifact name. Never run `pnpm dev` at the workspace root — workflows manage env vars (`PORT`, `BASE_PATH`) that the root script cannot wire up.

If old task-agent sessions leave behind `.claude/worktrees/agent-*/` directories, they get re-registered as duplicate artifacts (same `previewPath`) and pollute the workflow picker, which also breaks `verifyAndReplaceArtifactToml` with `DUPLICATE_PREVIEW_PATH`. Clean them up with `git worktree remove --force` (or `rm -rf` the dir + `git worktree prune`) so only the four canonical `artifacts/*` workflows above remain.

## Shared proxy routing

All traffic is routed by path through a shared reverse proxy on `localhost:80`. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.

## Deployment target

`.replit` `[deployment].deploymentTarget = "vm"` (the UI calls this **Reserved VM**). The api-server is a long-running Express process with a heavy boot path (migrations, vector index warm-up, scheduler) and an in-memory cache layer, so autoscale's per-request lifecycle does not fit. Reserved VM is also the only target that cleanly serves the published H+ Analytics SPA + `/api` from a single container without scale-to-zero cold starts.

Do **not** flip this back to `autoscale` without:
1. Moving all in-memory caches to Postgres / Redis.
2. Confirming the api-server bundle stays under autoscale's image limit (~32 MB compressed).
3. Switching the startup probe from `/api/health/live` to a path that responds before migrations run, or migrations will time out the probe.

## Health endpoint

`GET /api/health/live` (not `/api/healthz`). This is the path the deployment startup probe must point at — see `[services.production.health.startup]` in `artifacts/api-server/.replit-artifact/artifact.toml`. The server registers `/api/health/live` synchronously before `httpServer.listen()`, then defers migrations + seeds + vector indexing + scheduler boot to `setImmediate`, so liveness becomes reachable within seconds of process start. Drift in the probe path causes silent republish failures.

## Production bundle

`artifacts/api-server/build.mjs` externalizes large doc/media libraries (`@react-pdf/renderer`, `pptxgenjs`, `xlsx`, `docx`, `satori`, `jspdf`, `archiver`) so they are loaded from `node_modules` at runtime instead of being inlined into `dist/index.mjs`. Result: the bundle dropped from ~32 MB → ~20 MB. Each of these packages must remain in `dependencies` (not `devDependencies`) so pnpm installs them in the deployed container. If you add another heavy package that is only used on a small number of code paths, externalize it the same way.

## pnpm workspace

See the `pnpm-workspace` skill for workspace structure, TypeScript project references, and package conventions.

## Screenshot and image file conventions

- **Temporary / debug screenshots** → `screenshots/` (gitignored, never committed)
- **Permanent / referenced images** → `attached_assets/` (committed, tracked by git)
- Root-level `*.png`, `*.jpg`, `*.jpeg`, `*.webp` are blocked by `.gitignore` to keep the repo root clean.
- When using the `screenshot` tool, always pass `save_to: "screenshots/<descriptive-name>.jpg"` instead of writing to the project root.

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
| `norfolk-code-review` | Before opening a PR — wraps `ce-code-review` with hospitality/Drizzle personas |
| `architecture-decision-records` | Any irreversible technical decision future contributors might re-litigate |
| `hplus-pptx-generator` | Extending or debugging the LB Slides PPTX generator |
| `hplus-slide-mapping` | Shape-name ↔ data-field mapping for all 6 LB Slides template slides |

> **AI assistant scope**: This app has one AI assistant — **Rebecca** (semantic KB search). Marcela was removed. See `claude.md` § "AI assistant — Rebecca only".

> **LB Slides** (DB schema, API routes, image rendering, Python generator, admin UI): see `claude.md` § "LB Slides — per-property PPTX + image-PPTX generator".

> **Canonical page archetypes**: see `claude.md` § "Canonical Page Archetypes".

## Secrets present in this Repl

`POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_SECRET`.

For the **full** env-var contract used by the api-server (including `DATABASE_URL`, `STORAGE_PROVIDER`, `AUTH_PROVIDER`, `NODE_ENV`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `R2_PUBLIC_URL`), see `claude.md` § "Environment Variables (api-server)".
