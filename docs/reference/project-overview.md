# H+ Analytics — Project Overview

Canonical project reference for H+ Analytics: what the product is, how the monorepo is structured, the tech stack, and the most-used commands. CLAUDE.md and replit.md point at this doc rather than carrying the content inline, so the always-loaded memory files stay focused on enforcement rules and discipline.

---

# Project Source of Truth

H+ Analytics is a hospitality-sector financial analytics platform **built and maintained by Norfolk AI**, a software company that builds intelligent financial tools for the hospitality sector. Asset managers use it to model scenarios, run portfolio projections, and generate property-level investor slide decks (HTML → PDF via Playwright, matched to the canonical L+B 6-slide design). Users are organized by organization; access to scenarios and portfolios is governed by a share / permission model.

**Norfolk AI** is the software company. H+ Analytics is the product. Never conflate the two.

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
| Auth | Google OAuth (primary, production) via `routes/google-auth.ts`, plus `AUTH_PROVIDER` adapter (`replit` OIDC default, `local` email+password) in `providers/auth/` |
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
