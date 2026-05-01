# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## H+ Analytics Hospitality App

Ported from `.migration-backup/` into the pnpm workspace:

- **Frontend**: `artifacts/hospitality-business-portal/` — React + Vite, previewPath `/`
- **Backend**: `artifacts/api-server/` — Express on port 8080, paths `/api`
- **Shared libs**: `lib/shared`, `lib/db`, `lib/engine`, `lib/calc`, `lib/analytics`, `lib/domain`
- **External services**: Neon PostgreSQL + pgvector, Cloudflare R2, Linear, Sentry, OpenAI/Anthropic/Gemini

### Required env vars (api-server)

- `POSTGRES_URL` (and `DATABASE_URL`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- `STORAGE_PROVIDER=r2`, `AUTH_PROVIDER=replit`, `NODE_ENV=production`
- `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

### Notes for future work

- `lib/db/src/index.ts` initializes a `pg` Pool at module load. Frontend code must import schema from `@workspace/db/schema` (the subpath export), never from `@workspace/db`, to avoid pulling Node-only `pg` into the browser bundle. `lib/engine` already follows this pattern.
- `artifacts/hospitality-business-portal/vite.config.ts` excludes `drizzle-orm/node-postgres`, `drizzle-orm/postgres-js`, `pg`, `postgres`, and `postgres-bytea` from `optimizeDeps` to prevent Vite from auto-pre-bundling Node adapters.
- Health endpoint is `/api/health/live` (not `/api/healthz`).
- Linear integration is configured via `addIntegration("connection:conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG")`.
- `PROJECTION_YEARS` is exported from `lib/shared/src/constants.ts` as an alias of `DEFAULT_PROJECTION_YEARS`.
