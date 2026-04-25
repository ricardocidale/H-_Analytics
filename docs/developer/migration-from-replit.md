# Migration from Replit to Standalone Deployment

This guide covers removing all Replit-managed integrations and deploying H+ Analytics as a standalone Node.js application.

## Current Status (April 25, 2026)

**Database — DONE (Apr 23).** Cutover from Replit-managed Helium Postgres to a dedicated Neon project shipped in commit `430ba0d7`. `server/db.ts` reads `POSTGRES_URL` first (with `DATABASE_URL` as fallback), so the runtime never touches Helium. Helium is still attached to the Replit project as a paid line item but unused.

**Object storage — DONE (Apr 23).** Replit Object Storage replaced by Cloudflare R2 (`h-analysis` bucket) via the existing S3-compatible adapter at `server/providers/storage/s3-storage.ts`. `STORAGE_PROVIDER=r2` is live; round-trip verified.

**Hosting — IN PROGRESS.** Vercel deployment is the next major step. Until that lands, the Replit Dependency Tax keeps accruing on every commit.

### Cancelling the Helium Postgres add-on (when ready)

The Helium add-on still bills monthly even though nothing reads from it. The rollback prereq cleared on Apr 25 (Task #517) — the `pg_dump` snapshots that seeded the Neon migration now live at `r2://h-analysis/archive/helium-rollback-20260424/`, SHA-256-verified. Cancel it like this:

1. **Verify the running app is on Neon** — `echo $POSTGRES_URL | head -c 40` should show a `neon.tech` host. If it points anywhere else, stop and figure out why before cancelling.
2. **Confirm the rollback dump is in R2** — `npx tsx script/r2-list-archive.ts` should list 4 objects under `archive/helium-rollback-20260424/`: the full dump, the data-only dump, the rowcounts text file, and the sequences SQL file. **Do not cancel Helium if that list is empty.** The original local `backups/heliumdb-*` files were `git rm`d as part of Task #517 — `script/upload-helium-rollback-to-r2.ts` cannot be re-run from this repo state because its inputs are gone. To recover, fetch the four files from one of: (a) an older git ref (`git checkout 92ad89cd -- backups/`, then re-upload), (b) the local `.git/lfs/objects/` cache on a machine that cloned before the LFS prune, or (c) a fresh `pg_dump` of the live Helium DB while the add-on is still attached.
3. **In the Replit dashboard:** open this Repl → "Tools" pane in the left sidebar → "Database" → choose "Detach / Delete" on the Helium-managed database. Confirm. Replit will keep `DATABASE_URL` set for a grace period; the app ignores it because `POSTGRES_URL` is set.
4. **Confirm:** the next monthly invoice should not show a Helium line item. The H+ billing telemetry (`dev_internal.replit_invoices` in Neon) will surface this once invoices for the new period land — `npm run billing:report` regenerates `docs/billing/hplus-cost-report.md`.

This is irreversible. Once the add-on is cancelled, the only way back is to download from R2 (`r2://h-analysis/archive/helium-rollback-20260424/heliumdb-full-20260424T174432Z.sql.gz`), `gunzip` it, `psql -f` into a fresh Postgres, and re-point `POSTGRES_URL` at the new instance. The `heliumdb-rowcounts-*.txt` row-count manifest in the same prefix is what to compare against to confirm a clean restore.

### History rewrite — Helium backup purge (Tasks #518 + #520)

Task #517 ran `git rm` on the four `backups/heliumdb-*` files but did **not** purge them from history, so GitHub still bills LFS storage + bandwidth for them on every fresh clone (~250 MB). To actually reclaim that storage, history has to be rewritten and `main` force-pushed.

The same rewrite also purges `.turbo/cache/4ef2d42dbe46b27f.tar.zst` (~70 MB) — a Turborepo build-cache artifact that was accidentally committed to LFS. Decision (Task #520): **remove it.** Reasoning: it's regenerable (Turborepo recreates it on the next build), the hash in the filename is machine-specific, it cannot be a useful CI cache key for anyone else, and keeping it inflates the LFS bill on every clone. Forward-discipline fix: `.turbo/` is now in `.gitignore` and the matching `.gitattributes` LFS rule has been removed, so it cannot reappear. We batch this with the Helium purge because both require the same destructive history-rewrite + force-push dance, and doing it once is strictly cheaper than asking everyone to re-clone twice.

This must be done from a local clone with push access to GitHub — **not from inside the Replit workspace**, which is why this is a runbook, not an automated job:

1. Confirm R2 still holds the rollback set (`npx tsx script/r2-list-archive.ts` should show 4 objects under `archive/helium-rollback-20260424/`). If it doesn't, stop — restore the archive first.
2. Tell every collaborator and every other agent shell to push/stash WIP and stop pushing to `main`.
3. From a fresh clone on your laptop, run `./script/rewrite-history-purge-helium-backups.sh` (dry-run first; then `--execute`). The script does pre-flight checks (clean tree, on `main`, refuses to run inside the Replit workspace, verifies the target paths actually appear in history, tars `.git` for rollback) and then runs `git filter-repo --invert-paths` for each path — the four Helium dumps **and** the Turbo cache file.
4. Inspect the rewrite, then `git push --force-with-lease origin main`.
5. `git lfs prune` locally (the script also runs this).
6. Email github-support@github.com asking them to GC orphaned LFS objects for this repo (cite "Task #518 + #520 history rewrite"). Without this step the LFS bill does not actually drop — GitHub keeps unreferenced LFS objects until support manually collects them.
7. Verify in repo Settings → Billing & Usage → Git LFS that storage drops by ~320 MB total (~250 MB Helium + ~70 MB Turbo cache).
8. Update this section: replace `YYYY-MM-DD` below with the date of the rewrite and the new `main` HEAD SHA, so the next person who finds an old SHA understands why it doesn't resolve.

> History rewrite executed: **YYYY-MM-DD**, new `main` HEAD = `<sha>`. Pre-rewrite refs that touched `backups/heliumdb-*` or `.turbo/cache/4ef2d42dbe46b27f.tar.zst` (e.g. `92ad89cd`, `2bdcf8fe`) no longer resolve on `origin/main`.

---

## Phase 8 status (Platform Independence) — Code path COMPLETE.

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

All Replit-specific code lives in `server/replit_integrations/` with six modules:

| Module | Directory / File | What It Does |
|--------|------------------|--------------|
| Object Storage | `object_storage/` | GCS-backed file storage via Replit sidecar (`127.0.0.1:1106`) |
| Auth | `auth/` | OpenID Connect login via Replit identity provider |
| Image | `image/` | OpenAI image generation (thin wrapper) |
| Batch | `batch/` | Rate-limited batch processing utilities |
| Connectors | `connectors.ts` | Wraps `@replit/connectors-sdk` (used by the Linear bridge) |
| CSP | `csp.ts` | Builds the Content-Security-Policy header (frame-ancestors hosts the literal `*.replit.dev` / `*.replit.app` strings so they stay inside the allow-listed corner) |

**Files that import from `replit_integrations/`** (6 total — all inside the provider abstraction or the CSP/connectors wrappers):
- `server/providers/storage/replit-storage.ts` — wraps `ObjectStorageService` for the storage provider
- `server/providers/auth/replit-auth.ts` — wraps the OIDC flow for the auth provider
- `server/providers/auth/local-auth.ts` — reuses the OIDC session helper for the local-auth dev path
- `server/index.ts` — registers image routes, sets the CSP header
- `server/routes.ts` — registers object storage routes
- `server/integrations/linear.ts` — calls `replitProxyFetch` for OAuth proxy

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
