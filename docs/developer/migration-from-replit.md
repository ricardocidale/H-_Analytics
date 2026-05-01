# Migration from Replit — Developer Guide

**Status:** Infrastructure complete; final cut-over is a manual step the operator runs when moving to a self-hosted environment.

**Date:** 2026-05-01

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

## No ADR on file

There is no ADR for this portability work.  The decision to support Docker-based self-hosting was implicit in the product strategy.  If a formal record is needed, file a new ADR in `docs/architecture/decisions/` referencing this document.
