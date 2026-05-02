# Replit Workspace — H+ Analytics

> **`claude.md` is the canonical source of truth** for architecture, stack, commands, environment variables, and all project rules. This file contains only Replit-platform-specific configuration.

---

## Artifacts

| Artifact | Dir | Preview path |
|---|---|---|
| H+ Analytics (frontend) | `artifacts/hospitality-business-portal` | `/` |
| API Server | `artifacts/api-server` | `/api` |
| Mockup Sandbox | `artifacts/mockup-sandbox` | `/__mockup/` |
| Property Slides | `artifacts/property-slides` | `/slides` |

## Workflows

Each artifact has a corresponding Replit workflow. To restart a service, use `restart_workflow` with the artifact name. Never run `pnpm dev` at the workspace root — workflows manage env vars (`PORT`, `BASE_PATH`) that the root script cannot wire up.

## Shared proxy routing

All services are path-routed through a single reverse proxy on `localhost:80`. Always use `localhost:80/<path>` for ad-hoc requests (e.g. curl). Never call service ports directly.

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

### Key skills for Replit UI work

| Skill | Use when |
|---|---|
| `ui-page-patterns` | Building or revising any page — finds canonical examples, enforces loading/empty/error states, action-button discipline, tab URL sync |
| `embedded-ai-agent` | Adding or extending Rebecca (the only AI assistant in this app) |
| `replit-independence` | Adding any npm package, env var, or host-specific call — ensures the codebase stays portable |
| `norfolk-code-review` | Before opening a PR — runs project-tuned review personas |
| `hplus-pptx-generator` | Extending or debugging the LB Slides PPTX generator |
| `hplus-slide-mapping` | Shape-name ↔ data-field mapping for all 6 LB Slides template slides |

> **AI assistant scope**: This app has one AI assistant — **Rebecca** (semantic KB search). Marcela was removed. See `claude.md` § "AI assistant — Rebecca only".

> **LB Slides** (DB schema, API routes, image rendering, Python generator, admin UI): see `claude.md` § "LB Slides — per-property PPTX + image-PPTX generator".

> **Canonical page archetypes**: see `claude.md` § "Canonical Page Archetypes".

## Secrets configured in this Repl

`POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_SECRET`
