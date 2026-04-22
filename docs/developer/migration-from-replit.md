# Migration from Replit to Standalone Deployment

This guide covers removing all Replit-managed integrations and deploying H+ Analytics as a standalone Node.js application.

## Current Status (April 22, 2026)

**Phase 8 (Platform Independence) — Code path COMPLETE.**

All business logic now goes through `server/providers/` — zero direct Replit imports outside the provider wrappers and a small allow-list (CSP headers, Linear connector bridge, one-off backfill scripts). The app runs on Replit unchanged (defaults to `STORAGE_PROVIDER=replit`, `AUTH_PROVIDER=replit`).

A CI guardrail (`script/check-replit-independence.ts`, run in `.github/workflows/ci.yml`) fails the build if any new direct `@replit/`, `process.env.REPL*`, or `replit.dev`/`replit.app` reference lands outside the allow-listed locations.

### What's Done

| Item | Status | Details |
|------|--------|---------|
| `StorageProvider` interface | ✅ Done | 10 methods in `server/providers/storage/types.ts` |
| `ReplitStorageProvider` | ✅ Done | Wraps existing `ObjectStorageService` |
| `S3StorageProvider` | ✅ Done | Full implementation (AWS S3 / Cloudflare R2 / MinIO) |
| `AuthProvider` interface | ✅ Done | `server/providers/auth/types.ts` |
| `ReplitAuthProvider` | ✅ Done | Wraps existing OIDC |
| `LocalAuthProvider` | ✅ Done | Password-only, works without Replit |
| Consumer rewiring | ✅ Done | All consumers route through `server/providers/` |
| `getAppUrl()` / `isProductionDeployment()` | ✅ Done | Standardized env reads in `server/providers/config.ts` |
| `.env.example` | ✅ Done | Complete template for standalone deployment |
| `Dockerfile` + `.dockerignore` | ✅ Done | Multi-stage Node 22 build at repo root |
| Independence CI guardrail | ✅ Done | `script/check-replit-independence.ts` |
| Image routes location | ⬜ Cosmetic | Still under `server/replit_integrations/image/`; not Replit-specific (uses OpenAI/Gemini directly). Move alongside the storage provider extraction. |

### What YOU Need To Do When Ready To Move

**Step 1 — Get accounts and keys (30 min)**
1. Create a [Neon](https://console.neon.tech) project (or use existing — it's the same provider Replit uses)
2. Get API keys: [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), [Google AI](https://aistudio.google.com)
3. pgvector is enabled on the DATABASE_URL Postgres instance — no separate account needed
4. Pick an object storage: [Cloudflare R2](https://dash.cloudflare.com) (recommended, no egress fees) or AWS S3
5. Pick a host: [Railway](https://railway.app) (easiest), [Fly.io](https://fly.io), [Render](https://render.com), or any Docker host

**Step 2 — Set env vars and deploy (1-2 hours)**
- Copy `.env.example` to `.env`
- Fill in all keys
- Set `AUTH_PROVIDER=local` and `STORAGE_PROVIDER=s3`
- Set the S3 credentials: `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. For Cloudflare R2 / MinIO also set `S3_ENDPOINT` (and `S3_FORCE_PATH_STYLE=true` for MinIO).
- Optionally set `S3_PUBLIC_URL_BASE` for a CDN / custom domain in front of the bucket.
- Set `APP_URL=https://your-domain.com`
- Build and run: `docker build -t hbg . && docker run -p 5000:5000 --env-file .env hbg`
  - Or push the image to your host's registry and let it run there.
- Run `npm run db:push` against the new database
- Run `npm run health` to verify everything passes

**Step 3 — Cleanup (10 min, optional)**
- Delete `replit.md`, `.replit`, `replit.nix`
- Delete `server/replit_integrations/` (after verifying nothing imports it — the independence guardrail will catch leftovers)
- Remove the `*.replit.dev` / `*.replit.app` entries from the `frame-ancestors` CSP directive in `server/index.ts`
- Remove `REPL_ID` / `REPLIT_DOMAINS` / `REPLIT_DEPLOYMENT` fallbacks from `server/providers/config.ts`
- Drop `server/integrations/linear.ts` from the independence allow-list (replace `@replit/connectors-sdk` with a direct Linear OAuth flow)

---

## Replit Integrations Overview

All Replit-specific code lives in `server/replit_integrations/` with four modules:

| Module | Directory | What It Does |
|--------|-----------|--------------|
| Object Storage | `object_storage/` | GCS-backed file storage via Replit sidecar (`127.0.0.1:1106`) |
| Auth | `auth/` | OpenID Connect login via Replit identity provider |
| Image | `image/` | OpenAI image generation (thin wrapper) |
| Batch | `batch/` | Rate-limited batch processing utilities |

**Files that import from `replit_integrations/`** (5 total — all inside the provider abstraction):
- `server/providers/storage/replit-storage.ts` — wraps `ObjectStorageService` for the storage provider
- `server/providers/auth/replit-auth.ts` — wraps the OIDC flow for the auth provider
- `server/index.ts` — registers image routes and forwards storage init
- `server/routes.ts` — registers image and object storage routes
- `server/replit_integrations/batch/utils.ts` — internal helper

Everything else routes through `server/providers/`.

---

## Integration 1: Database (PostgreSQL/Neon)

**Current:** `DATABASE_URL` auto-configured by Replit, backed by Neon PostgreSQL.

**Migration:** Use Neon directly (same provider) or any PostgreSQL instance.

**Steps:**
1. Create a Neon project at `console.neon.tech` (or provision PostgreSQL elsewhere)
2. Set `DATABASE_URL` in your `.env` to the new connection string
3. Run `npx drizzle-kit push` to apply schema

**Risk: LOW** — Drizzle ORM is database-agnostic. Zero code changes required.

---

## Integration 2: AI Services

**Current:** Replit provisions AI API keys automatically via environment.

**Migration:** Obtain direct API keys from each provider.

**Steps:**
1. Get keys from: [Anthropic Console](https://console.anthropic.com), [OpenAI Platform](https://platform.openai.com), [Google AI Studio](https://aistudio.google.com)
2. Set in `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...
   GOOGLE_AI_API_KEY=AIza...
   ```
3. The `image/` module already uses the OpenAI SDK directly — just ensure `OPENAI_API_KEY` is set

**Risk: LOW** — client initialization already reads from env vars.

---

## Integration 3: Authentication

**Current:** `server/replit_integrations/auth/` implements OpenID Connect via Replit as the identity provider, wrapped by `server/providers/auth/replit-auth.ts`.

**Important:** The app already has Express sessions with `connect-pg-simple`, password-based login, and a `LocalAuthProvider`. Replit Auth is an *additional* login method, not the only one.

**Migration options:**

**Option A — Password-only (works today):**
1. Set `AUTH_PROVIDER=local` in `.env`
2. The provider abstraction will skip the Replit OIDC routes and only mount the password flow
3. No code changes required

**Option B — Add OAuth via Auth.js (recommended for production):**
1. Install `@auth/express`
2. Configure Google/GitHub OAuth providers
3. Map OAuth claims to the existing user table using the same `upsertUser` pattern
4. Add a new `OAuthProvider` implementation in `server/providers/auth/`

**Risk: MEDIUM** — but Option A works immediately without Replit Auth.

---

## Integration 4: Object Storage

**Current:** `server/replit_integrations/object_storage/objectStorage.ts` uses `@google-cloud/storage` via a Replit sidecar proxy at `127.0.0.1:1106` for credential exchange and URL signing. Wrapped by `server/providers/storage/replit-storage.ts`.

**Status:** ✅ `S3StorageProvider` is fully implemented at `server/providers/storage/s3-storage.ts`. Switch by setting `STORAGE_PROVIDER=s3` and the S3 credentials.

**Behaviors preserved across providers:**
- Upload via presigned PUT URLs (15-min TTL)
- Download via streaming
- Public/private cache-control on `downloadToResponse`
- Path normalization (URL → key)
- Delete + exists semantics

**Recommended backends (all S3-compatible):**
- **Cloudflare R2** — no egress fees. Set `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`.
- **AWS S3** — leave `S3_ENDPOINT` unset.
- **MinIO** — self-hosted. Set `S3_ENDPOINT=https://minio.example.com`, `S3_FORCE_PATH_STYLE=true`.
- **DigitalOcean Spaces** — set `S3_ENDPOINT=https://<region>.digitaloceanspaces.com`.

**Risk: LOW** (code) / **MEDIUM** (data migration) — code path is done; you still need to copy any existing objects from the Replit bucket to the new bucket using `aws s3 sync` or `rclone`.

---

## Integration 5: Domains & Hosting

**Current:** `.replit.app` domain with auto-TLS from Replit.

**Migration:** Build the included `Dockerfile` and deploy to any container host.

**Recommended hosts:**
- **Railway** — `railway up` deploys from git, auto-builds the Dockerfile
- **Fly.io** — `fly launch` reads the Dockerfile, global edge
- **Render** — managed Docker service
- **VPS (Hetzner/DigitalOcean)** — `docker run` + Caddy for auto-TLS

**Steps:**
1. `docker build -t hbg .` to verify the image builds locally
2. Set all env vars on the new host
3. Configure custom domain + TLS
4. Update any hardcoded URLs (CORS origins, OAuth callbacks)

**Risk: LOW** — standard Docker deployment.

---

## Files to Delete After Migration

| File | Purpose |
|------|---------|
| `replit.md` | Replit Agent project doc |
| `.replit` | Workspace config (nix, workflows, run commands) |
| `replit.nix` | Nix package definitions |
| `server/replit_integrations/` | Entire directory (4 modules) |

**Env vars to remove:** `REPL_ID`, `REPLIT_DB_URL`, `REPLIT_DOMAINS`, `REPLIT_DEPLOYMENT`, `REPLIT_DEV_DOMAIN`, `ISSUER_URL`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`

**Allow-list cleanup:** After deleting `server/replit_integrations/`, also remove from `script/check-replit-independence.ts`'s `ALLOW_LIST`: `server/replit_integrations/`, `server/integrations/linear.ts` (port to direct Linear OAuth), `server/scripts/` (drop hard-coded `replit.app` URLs), and the `server/index.ts` CSP entry.

---

## Recommended Migration Order

| Phase | Task | Effort | Blocking? |
|-------|------|--------|-----------|
| 1 | Database — update `DATABASE_URL` | 5 min | No |
| 2 | AI keys — set direct API keys | 10 min | No |
| 3 | Auth — set `AUTH_PROVIDER=local` | 1 min | No (password works) |
| 4 | Object Storage — set `STORAGE_PROVIDER=s3` + creds | 30 min | Yes (uploads break without it) |
| 5 | Deploy — `docker build`, host config, DNS | 2-4 hrs | Yes |
| 6 | Cleanup — delete Replit files | 10 min | No |

**Total estimated effort: 4-6 hours** (down from 1-2 days now that S3 + Dockerfile are done).

The app is well-architected for this migration — Drizzle ORM, Express sessions, the provider abstraction, and direct SDK usage mean the only data work left is copying objects from the Replit bucket to the new bucket.
