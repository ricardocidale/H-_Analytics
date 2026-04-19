# Migration from Replit to Standalone Deployment

This guide covers removing all Replit-managed integrations and deploying H+ Analytics as a standalone Node.js application.

## Current Status (April 13, 2026)

**Phase 8 (Platform Independence) — Abstraction Layer COMPLETE.**

All business logic now goes through `server/providers/` — zero direct Replit imports outside the provider wrappers. The app runs on Replit unchanged (defaults to `STORAGE_PROVIDER=replit`, `AUTH_PROVIDER=replit`).

### What's Done

| Item | Status | Details |
|------|--------|---------|
| `StorageProvider` interface | ✅ Done | 10 methods in `server/providers/storage/types.ts` |
| `ReplitStorageProvider` | ✅ Done | Wraps existing `ObjectStorageService` |
| `S3StorageProvider` | ⬜ Stub | Methods throw "not yet configured" — fill in when ready |
| `AuthProvider` interface | ✅ Done | `server/providers/auth/types.ts` |
| `ReplitAuthProvider` | ✅ Done | Wraps existing OIDC |
| `LocalAuthProvider` | ✅ Done | Password-only, works without Replit |
| Consumer rewiring | ✅ Done | 12 files rewired to use providers |
| `getAppUrl()` | ✅ Done | Replaces `REPLIT_DOMAINS` with fallback chain |
| `.env.example` | ✅ Done | Complete template for standalone deployment |
| Dockerfile | ⬜ Not started | Needed for non-Replit deployment |
| Image routes cleanup | ⬜ Cosmetic | Move out of `replit_integrations/` (not blocking) |

### What YOU Need To Do When Ready To Move

**Step 1 — Get accounts and keys (30 min)**
1. Create a [Neon](https://console.neon.tech) project (or use existing — it's the same provider Replit uses)
2. Get API keys: [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), [Google AI](https://aistudio.google.com)
3. pgvector is enabled on the DATABASE_URL Postgres instance — no separate account needed
4. Pick an object storage: [Cloudflare R2](https://dash.cloudflare.com) (recommended, no egress fees) or AWS S3
5. Pick a host: [Railway](https://railway.app) (easiest), [Fly.io](https://fly.io), or [Render](https://render.com)

**Step 2 — Fill in S3 storage provider (2-4 hours, or ask Claude Code)**
- File: `server/providers/storage/s3-storage.ts`
- Install: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- Implement each method using the S3 SDK (TODO comments show the pattern)
- Test with: `STORAGE_PROVIDER=s3 npm run dev`

**Step 3 — Set env vars and deploy (1-2 hours)**
- Copy `.env.example` to `.env`
- Fill in all keys
- Set `AUTH_PROVIDER=local` and `STORAGE_PROVIDER=s3`
- Set `APP_URL=https://your-domain.com`
- Run `npm run db:push` against the new database
- Run `npm run health` to verify everything passes

**Step 4 — Cleanup (10 min, optional)**
- Delete `replit.md`, `.replit`, `replit.nix`
- Delete `server/replit_integrations/` (after verifying nothing imports it)
- Remove Replit-specific CSP headers from `server/index.ts`
- Remove `REPL_ID` / `REPLIT_DOMAINS` fallbacks from `server/providers/config.ts`

---

## Replit Integrations Overview

All Replit-specific code lives in `server/replit_integrations/` with four modules:

| Module | Directory | What It Does |
|--------|-----------|--------------|
| Object Storage | `object_storage/` | GCS-backed file storage via Replit sidecar (`127.0.0.1:1106`) |
| Auth | `auth/` | OpenID Connect login via Replit identity provider |
| Image | `image/` | OpenAI image generation (thin wrapper) |
| Batch | `batch/` | Rate-limited batch processing utilities |

**Files that import from `replit_integrations/`** (9 total):
- `server/index.ts` — registers auth and storage routes
- `server/routes.ts` — registers image and object storage routes
- `server/routes/uploads.ts` — presigned upload URLs
- `server/routes/documents.ts` — document storage
- `server/image/pipeline.ts` — image generation
- `server/integrations/document-ai.ts` — document processing
- `server/scripts/generate-medellin-renders.ts` — image generation script
- `server/scripts/generate-medellin-exterior.ts` — image generation script
- `server/replit_integrations/batch/utils.ts` — internal

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

**Current:** `server/replit_integrations/auth/` implements OpenID Connect via Replit as the identity provider. Uses `REPL_ID` as the OIDC client ID and `ISSUER_URL` defaulting to `https://replit.com/oidc`.

**Important:** The app already has Express sessions with `connect-pg-simple` and password-based login. Replit Auth is an *additional* login method, not the only one.

**Migration options:**

**Option A — Password-only (simplest):**
1. Remove Replit Auth routes (`/api/login`, `/api/callback`, `/api/logout` from `replitAuth.ts`)
2. Keep the existing session middleware (`getSession()` is reusable — it just needs `DATABASE_URL` and `SESSION_SECRET`)
3. Use the existing password login flow

**Option B — Add OAuth via Auth.js (recommended for production):**
1. Install `next-auth` or `@auth/express`
2. Configure Google/GitHub OAuth providers
3. Map OAuth claims to the existing user table using the same `upsertUser` pattern

**Session middleware** (`getSession()`) is not Replit-specific — it uses `connect-pg-simple` and can be extracted as-is.

**Risk: MEDIUM** — but password login works immediately without Replit Auth.

---

## Integration 4: Object Storage

**Current:** `server/replit_integrations/object_storage/objectStorage.ts` uses `@google-cloud/storage` via a Replit sidecar proxy at `127.0.0.1:1106` for credential exchange and URL signing.

**Key behaviors to replicate:**
- Upload via presigned PUT URLs (15-min TTL)
- Download via streaming (`file.createReadStream()`)
- ACL policies (public/private visibility)
- Path normalization (`/objects/{entityId}`)

**Migration — create a `StorageProvider` interface:**

```typescript
interface StorageProvider {
  getUploadUrl(key: string, ttlSec?: number): Promise<string>;
  getDownloadStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
```

**Recommended implementations:**
- **Cloudflare R2** — S3-compatible, no egress fees, presigned URLs via `@aws-sdk/client-s3`
- **AWS S3** — standard choice, presigned URLs via `@aws-sdk/s3-request-presigner`
- **Local filesystem** — for development (`fs.createReadStream`, serve via Express static)

**Steps:**
1. Create `server/storage/provider.ts` with the interface above
2. Implement `S3StorageProvider` using `@aws-sdk/client-s3`
3. Update the 5 importing files to use the new provider
4. Set env vars: `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

**Risk: MEDIUM** — most work in the migration. Presigned URL logic changes from GCS sidecar to S3 SDK.

---

## Integration 5: Domains

**Current:** `.replit.app` domain with auto-TLS from Replit.

**Migration:** Deploy to any host and configure DNS.

**Recommended hosts:**
- **Railway** — closest to Replit DX, `railway up` deploys from git
- **Fly.io** — Dockerfile-based, global edge
- **Render** — managed Node.js service
- **VPS (Hetzner/DigitalOcean)** — full control, Dockerfile + Caddy for auto-TLS

**Steps:**
1. Create a `Dockerfile` (or use host's buildpack)
2. Set all env vars on the new host
3. Configure custom domain + TLS
4. Update any hardcoded URLs (CORS origins, OAuth callbacks)

**Risk: LOW** — standard deployment.

---

## Files to Delete After Migration

| File | Purpose |
|------|---------|
| `replit.md` | Replit Agent project doc (knowledge now in `.claude/`) |
| `.replit` | Workspace config (nix, workflows, run commands) |
| `replit.nix` | Nix package definitions |
| `server/replit_integrations/` | Entire directory (4 modules) |

**Env vars to remove:** `REPL_ID`, `REPLIT_DB_URL`, `REPLIT_DOMAINS`, `ISSUER_URL`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`

---

## Recommended Migration Order

| Phase | Task | Effort | Blocking? |
|-------|------|--------|-----------|
| 1 | Database — update `DATABASE_URL` | 5 min | No |
| 2 | AI keys — set direct API keys | 10 min | No |
| 3 | Auth — remove Replit OIDC, keep password login | 1-2 hrs | No (password works) |
| 4 | Object Storage — implement S3 provider | 4-8 hrs | Yes (uploads break) |
| 5 | Deploy — Dockerfile, host config, DNS | 2-4 hrs | Yes |
| 6 | Cleanup — delete Replit files | 10 min | No |

**Total estimated effort: 1-2 days**

The app is well-architected for this migration — Drizzle ORM, Express sessions, and direct SDK usage mean most Replit dependencies are shallow. Object Storage is the only integration requiring significant new code.
