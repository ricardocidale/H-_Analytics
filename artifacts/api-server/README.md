# `@workspace/api-server`

Express 5 backend for H+ Analytics. Single Node process serving `/api/*`, with the SPA served by the `hospitality-business-portal` artifact at `/`.

## Production deployment

- **Target:** `vm` (Reserved VM) — set in `.replit` `[deployment].deploymentTarget`. Not `autoscale`. See `replit.md` § "Deployment target" for why.
- **Build:** `pnpm --filter @workspace/api-server run build` → `dist/index.mjs` (~20 MB) + `dist/pino-*.mjs` worker shims.
- **Run:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`.
- **Health probe:** `GET /api/health/live` (registered synchronously before `httpServer.listen()`). `GET /api/health/ready` only goes 200 once migrations have completed.

## Required production secrets

These must all be set in the Replit **Secrets** pane (global, available in both dev and prod) before publishing. Booting without them will either crash on startup or silently degrade core features.

| Secret | Why it's needed |
|---|---|
| `POSTGRES_URL` | Primary Postgres connection string. Migrations + every request use it. |
| `SESSION_SECRET` | Signs the express-session cookie. Must be stable across restarts or all sessions invalidate. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL_BASE` | Cloudflare R2 — the production storage backend (`STORAGE_PROVIDER=r2`). PPTX exports, generated images, KB documents, and user uploads all live here. |
| `OPENAI_API_KEY` | OpenAI chat completions used by the AI agent and several admin tools. |
| `OPENAI_EMBEDDING_KEY` | Embeddings for the Rebecca KB / semantic search index. Loaded at boot. |
| `ANTHROPIC_API_KEY` | Claude — used by the analyst pipeline and several specialists. |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini — used by the visual research path and a few specialists. |
| `RESEND_API_KEY`, `ADMIN_EMAIL` | Outbound email (admin notifications, weekly digests). |
| `SENTRY_DSN` | Server-side error capture. The Sentry SDK no-ops if missing, but production should always have it set. |
| `FRED_API_KEY` | Macro/market data ingestion. The market-rates worker fails closed if missing. |
| `PERPLEXITY_API_KEY`, `TAVILY_API_KEY` | Specialist research tools. |

Plus the per-user demo passwords (`PASSWORD_*`) used by the dev-style auth fallback when `AUTH_PROVIDER=replit` is bypassed.

## Production env vars (in `.replit` `[userenv.shared]`)

- `NODE_ENV=production`
- `STORAGE_PROVIDER=r2`
- `AUTH_PROVIDER=replit`
- `CI=true`

## Build externals

`build.mjs` keeps the bundle small by externalizing large doc/media libraries that are loaded lazily on a few routes:

- `@react-pdf/renderer`, `pptxgenjs`, `xlsx`, `docx`, `satori`, `jspdf`, `archiver`

If you add another heavy package and find the bundle growing, add it to the `external` array in `build.mjs` **and** make sure it is listed under `dependencies` (not `devDependencies`) so pnpm installs it in the deployed container.

## Migrations

Drizzle migrations run automatically on boot (immediately after `httpServer.listen()`, via `setImmediate`). There is no separate migrate step in the deploy pipeline. `/api/health/ready` blocks until they complete.
