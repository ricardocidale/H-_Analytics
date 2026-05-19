# H+ Analytics — Deployment & Environment

Canonical reference for environment variables (api-server) and production deployment wiring. CLAUDE.md and replit.md point here rather than carrying the content inline. Production runs on Railway via `Dockerfile` + `railway.toml`; Replit is a dev workspace only.

---

## Environment Variables (api-server)

| Variable | Notes |
|---|---|
| `POSTGRES_URL` / `DATABASE_URL` | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2 |
| `STORAGE_PROVIDER` | Set to `r2` |
| `AUTH_PROVIDER` | Set to `replit` |
| `NODE_ENV` | Set to `production` in deployed env |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | Auth / session signing |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | AI providers (Claude used for LB Slides vision text) |
| `FRED_API_KEY` | FRED economic data |
| `GITHUB_PAT` | GitHub integration |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — **must be present in both Railway AND Replit secrets**; absence silently disables the `/api/auth/google` route (404) in whichever environment is missing it |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret — same dual-env requirement as above |
| `OPENAI_EMBEDDING_KEY` | Separate embedding key |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini AI provider |
| `DEEPSEEK_API_KEY` | DeepSeek AI provider (T3-1 Matteo — bulk-text-synthesis slot) |
| `DEEPSEEK_API_BASE_URL` | Optional override for DeepSeek API base URL (default resolved from admin_resources) |
| `MISTRAL_API_KEY` | Mistral AI provider (T3-1 Matteo — pdf-ocr-extraction slot, Mistral chat models) |
| `MISTRAL_OCR_ENDPOINT` | Optional override for Mistral OCR 3 endpoint (default resolved from admin_resources) |
| `RESEND_API_KEY` | Transactional email (Resend) |
| `SENTRY_DSN` | Error monitoring (Sentry) |

---

## Production Deployment

**Production runs on Railway, not on Replit.** Replit Publish (both `autoscale` and Reserved VM) failed for this app — see Task #942 history and `docs/solutions/integration-issues/dev-login-empty-body-edge-proxy-2026-05-02.md` for the edge-proxy / bundle-size root causes that pushed us off Replit Publish for good.

**Wiring (already in repo, do not duplicate):**

| File | Purpose |
|---|---|
| `Dockerfile` | Two-stage Node 24 + pnpm build. Builds all packages, ships the api-server bundle plus the two SPAs (H+ Analytics at `dist/public`, mockup-sandbox at `dist/mockup-sandbox`), runs `node artifacts/api-server/dist/index.mjs`. |
| `railway.toml` | `builder = "dockerfile"`, `healthcheckPath = "/api/health/live"`, `healthcheckTimeout = 300`, `restartPolicyType = "ON_FAILURE"`. |
| `artifacts/api-server/build.mjs` | Externalises heavy deps (AI SDKs, doc/media libs, country-state-city, Sentry, google-auth-library) so the bundle stays ~7.5 MB and pnpm installs the rest in the runtime container. |

**Single-container model:** the api-server serves `/api/*` plus both SPAs from one process on one port (`$PORT`). The Dockerfile builds every frontend and copies them next to the api-server bundle; `artifacts/api-server/src/static.ts` mounts them at:

- `/` → `artifacts/api-server/dist/public` (H+ Analytics — `hospitality-business-portal`)
- `/__mockup/` → `artifacts/api-server/dist/mockup-sandbox`

One Railway service, no separate frontend deployments.

**Required production env vars on Railway** — all variables in §Environment Variables above must be set as Railway service variables (no Replit broker is reachable in production). `PASSWORD_*` fallbacks are optional dev shortcuts and must be **omitted** in production.

**External services** (all user-owned, all reachable from Railway with secrets above): Neon Postgres (db + pgvector), Cloudflare R2 (objects), Google OAuth (auth, primary) + Replit OIDC (legacy/dev), OpenAI / Anthropic / Gemini (LLMs, direct SDKs), FRED (macro data), Resend (email), Sentry (errors), Linear (issues — connector `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG`, falls back to env vars), GitHub. Per-service secrets: see §"Environment Variables" above.

**Rule of thumb:** never provision Replit-managed equivalents (Replit Database, Object Storage, Auth) — they split the source of truth from production. Use the `prefer-external-dependencies` skill first.

**Replit's role going forward:** dev workspace and code-review surface only. Do **not** rely on `.replit` `[deployment]`, `artifact.toml [services.production]`, or `suggest_deploy()` for shipping. Those blocks may stay in the repo for the workflow tooling, but production ships through `git push` → Railway build via the `Dockerfile`.
