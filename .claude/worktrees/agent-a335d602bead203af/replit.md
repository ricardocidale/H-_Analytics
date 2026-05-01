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

## Secrets configured in this Repl

`POSTGRES_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_EMBEDDING_KEY`, `FRED_API_KEY`, `GITHUB_PAT`, `GOOGLE_CLIENT_SECRET`
