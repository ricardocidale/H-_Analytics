# Migration from Replit — Developer Guide

**Status:** Infrastructure complete and the production container now bundles **all three frontend artifacts** (H+ Analytics, Property Slides, Mockup Sandbox); final Railway cut-over is a manual step the operator runs.

**Date:** 2026-05-02

---

## What ships in the production container

The single Docker image produced by `Dockerfile` serves three SPAs from the API server (single origin), each at the same sub-path used in development:

| Artifact | Mounted at | Source dir in image |
|---|---|---|
| `hospitality-business-portal` | `/` | `artifacts/api-server/dist/public` |
| `property-slides`             | `/property-slides/` | `artifacts/api-server/dist/property-slides` |
| `mockup-sandbox`              | `/__mockup/` | `artifacts/api-server/dist/mockup-sandbox` |

Each SPA is built with its own `BASE_PATH` so Vite emits the right asset URLs, and each gets its own `index.html` SPA fallback in `artifacts/api-server/src/static.ts`. The API itself remains under `/api/*`.

> **Note on Mockup Sandbox in production:** Mockup Sandbox is a designer/preview surface and is included in the production image only because the operator chose to ship it. If you decide to make it dev-only later, drop the `BASE_PATH=/__mockup/ pnpm --filter mockup-sandbox run build` line and the corresponding `COPY` in `Dockerfile`, and remove the `/__mockup` block in `static.ts`.

---

## Current state

The three infrastructure pieces required to run H+ Analytics outside Replit are now in place:

| Piece | Status | Location |
|---|---|---|
| S3 storage provider | Complete | `artifacts/api-server/src/providers/storage/s3-storage.ts` |
| Dockerfile (multi-stage, pnpm, Node 20) | Complete | `Dockerfile` |
| CI independence check | Complete | `scripts/src/check-replit-independence.ts` |

### S3 storage provider

Implements the same `StorageProvider` interface as the existing local and Replit Object Storage adapters.  Set `STORAGE_PROVIDER=s3` plus the variables below to activate it.

Required environment variables when `STORAGE_PROVIDER=s3`:

```
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
# Optional: custom endpoint for S3-compatible stores (MinIO, R2, etc.)
S3_ENDPOINT=
```

### Dockerfile

Multi-stage build.  The build stage installs all workspace packages via `pnpm install --frozen-lockfile` and runs `pnpm run build` (typecheck + per-package esbuild bundles).  The runtime stage carries only the bundled output, externalised native modules from `node_modules`, and the workspace lib sources.

```
docker build -t hplus-analytics .
docker run --env-file .env -p 5000:5000 hplus-analytics
```

Port `5000` is the default; override with `PORT=<n>` in the environment.

### CI independence check

```
pnpm run check:replit-independence
```

Walks every `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` file in the workspace (skipping `node_modules`, `dist`, `build`) and fails with exit code 1 if it finds any `@replit/` import or `process.env.REPL_*` / `process.env.REPLIT_*` read outside the allow-listed paths (see below).

Run this in CI before merging any PR that touches server code.

---

## Legitimate Replit touchpoints (the allow-list)

These five files/paths intentionally reference Replit and are excluded from the CI check.  They are the only seams that need to change when the final cut-over happens.

| Path | What it does |
|---|---|
| `artifacts/api-server/src/providers/config.ts` | Reads `REPL_ID`, `REPLIT_DOMAINS`, `REPLIT_DEPLOYMENT` to detect the Replit runtime and derive the public URL |
| `artifacts/api-server/src/providers/auth/replit-oidc-impl.ts` | Implements Replit OIDC SSO using `REPL_ID` as the OAuth client ID |
| `artifacts/hospitality-business-portal/vite.config.ts` | Loads Replit dev-environment plugins (`@replit/vite-plugin-*`) conditionally on `REPL_ID !== undefined` |
| `artifacts/hospitality-business-portal/vite-plugin-meta-images.ts` | Resolves the public hostname from `REPLIT_INTERNAL_APP_DOMAIN` / `REPLIT_DEV_DOMAIN` |
| `artifacts/mockup-sandbox/vite.config.ts` · `artifacts/property-slides/vite.config.ts` | Same Replit plugin pattern as the main portal |

None of these paths run inside a Docker container.  `vite.config.ts` and `vite-plugin-meta-images.ts` are dev-only; the OIDC and config providers are swapped via the provider index when `REPLIT_DEPLOYMENT` is absent.

---

## Final cut-over checklist

Run these steps when you are ready to stop using Replit entirely.  Do not do this incrementally — complete all steps in one deployment.

### Environment variables to add (new host)

```
NODE_ENV=production
PORT=5000
DATABASE_URL=<neon-or-postgres-connection-string>
SESSION_SECRET=<random-64-char-hex>
STORAGE_PROVIDER=s3
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
# Auth: replace Replit OIDC with your chosen provider
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
```

### Environment variables to delete (remove from Replit secrets)

```
REPL_ID
REPL_SLUG
REPLIT_DOMAINS
REPLIT_DEV_DOMAIN
REPLIT_INTERNAL_APP_DOMAIN
REPLIT_DEPLOYMENT
```

### Files to delete after migration

These files serve no purpose outside Replit and can be removed once the migration is confirmed stable:

- `.replit`
- `replit.nix`
- `replit.md`
- `artifacts/api-server/src/providers/auth/replit-oidc-impl.ts` (replace with your OIDC provider)

### Provider index update

In `artifacts/api-server/src/providers/index.ts` (or wherever the provider factory lives), remove the `isReplit()` branch and wire the S3 storage provider and your replacement auth provider as the defaults.

---

## Railway operator runbook (this task)

The infrastructure changes for Railway are complete in the repo (Dockerfile bundles all three SPAs, `railway.toml` is in place, healthcheck path `/api/health/live`). The remaining work is operator-only — it requires Railway account access, the dev DB connection string, and the chosen storage/auth credentials. Run these steps in order from your local machine.

### 1. Provision Railway Postgres

In the existing Railway project, click **+ New → Database → PostgreSQL**. Capture two connection strings from the Postgres service's **Connect** tab:

- `DATABASE_URL` (private, `*.railway.internal`) — used by the app service.
- The **public** connection string — used **once** for the data copy below, then forgotten.

### 2 & 3. Apply schema and copy data (one command)

The schema push, data-only `pg_dump` / `pg_restore`, and row-count sanity check
are wrapped by a single workspace script. From your machine, with `pg_dump`,
`pg_restore`, and `psql` on PATH:

```bash
pnpm --filter @workspace/scripts run sync-db-to-railway -- \
  --source '<dev-database-url>' \
  --target '<railway-public-url>'
```

What it does:

1. Runs `drizzle-kit push` against the target so the schema (through the latest
   migration in `lib/db/migrations/`) is in place.
2. Runs `pg_dump --data-only --no-owner --no-acl --disable-triggers
   --format=custom` against the source.
3. Runs `pg_restore --data-only --no-owner --no-acl --disable-triggers
   --single-transaction` into the target.
4. Prints a row-count diff for the major tables (`users`, `companies`,
   `properties`, `scenarios`, `scenario_results`, `financial_assumptions`,
   `model_constants`, `model_defaults`, `property_slide_decks`).

Useful flags: `--skip-schema`, `--skip-data` (e.g. for a periodic data-only
refresh of staging), `--keep-dump`, `--dump-file <path>`. You can also set
`SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL` in the environment instead of
passing the flags.

If you prefer to verify the schema state manually after the push:

```bash
psql '<railway-public-url>' -c "\\dt" | wc -l
psql '<railway-public-url>' -c "select count(*) from drizzle.__drizzle_migrations;"
```

### 4. Connect Railway service to the repo

In the Railway project, **+ New → GitHub Repo → this repo**. Railway picks up `railway.toml`, builds from `Dockerfile`, and probes `/api/health/live`. No build command override is needed.

### 5. Set production env vars in Railway

On the app service's **Variables** tab, set everything from the "Environment variables to add (new host)" section above. Two specifics for Railway:

- `DATABASE_URL` — paste the **internal** Railway connection string (the `*.railway.internal` one), not the public one.
- `PORT` — Railway injects this automatically; do **not** override it. The app reads `process.env.PORT` and the Dockerfile defaults to 5000 only as a build-time fallback.

Also set every AI provider key you actually use in production (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`), the Sentry DSN (`SENTRY_DSN`), and storage variables for the chosen provider (S3, R2, or GCS). Do **not** carry over `REPL_ID` / `REPL_SLUG` / `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` / `REPLIT_INTERNAL_APP_DOMAIN` / `REPLIT_DEPLOYMENT`.

If you intentionally want to keep Replit OIDC for the first cut-over (e.g. to avoid swapping auth providers in the same change), set `REPL_ID` and `ISSUER_URL=https://replit.com/oidc` and note that decision below.

### 6. Object storage cut-over

Provision the bucket on the chosen provider, set the env vars from step 5, then verify a round-trip after first deploy:

- Upload a property photo from the running app.
- Download a generated slide deck (`/api/properties/:id/slides`).

If existing dev assets must be present in production, mirror the bucket — e.g. for S3:

```bash
aws s3 sync s3://<dev-bucket> s3://<prod-bucket>
```

### 7. First deploy + smoke test

Trigger the deploy (push to the connected branch, or `railway up` via CLI). Watch the **Deployments → Logs** tab for the build and runtime stages. Once the healthcheck flips green, smoke-test the public Railway URL:

- `GET /api/health/live` returns 200.
- `/` loads the H+ Analytics login.
- `/property-slides/` loads the slides shell.
- `/__mockup/` loads the mockup sandbox shell (only if you kept it in the image — see the note in *What ships in the production container*).
- Log in, open the property list, open a property, generate a slide deck, view a chart.
- Confirm Sentry receives a test event (or that an intentional error appears in the Sentry project).

### 8. Record the result

After a successful deploy, fill in the placeholders below in this doc:

- **Railway public URL:** `https://<service>.up.railway.app` *(operator to fill)*
- **Storage provider chosen:** `s3` / `r2` / `gcs` *(operator to fill)*
- **OIDC provider chosen:** Replit (kept for cut-over) / `<new provider>` *(operator to fill)*
- **Cut-over date:** *(operator to fill)*
- **Deviations from this runbook:** *(operator to fill, or "none")*

---

## No ADR on file

There is no ADR for this portability work.  The decision to support Docker-based self-hosting was implicit in the product strategy.  If a formal record is needed, file a new ADR in `docs/architecture/decisions/` referencing this document.
