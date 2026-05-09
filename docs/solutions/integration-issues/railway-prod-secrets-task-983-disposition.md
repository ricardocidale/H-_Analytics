---
title: "Railway H-Analytics production secrets — Task #983 disposition"
date: 2026-05-05
category: integration-issues
module: railway-deployment
problem_type: integration_issue
component: authentication
severity: high
symptoms:
  - "Six env vars deleted from Railway production by Task #981"
  - "App failed to boot in production without DATABASE_URL and SESSION_SECRET"
root_cause: config_error
resolution_type: config_change
tags: [railway, env-vars, secrets, production-boot, postgres-url, session-secret]
---

# Railway H-Analytics production secrets — Task #983 disposition

## Context

Task #981 deleted six placeholder env vars from the Railway `H-Analytics`
service in env `production` (`fb46e41b-6e2c-4a23-a14b-8db7af8e420d`):
`DATABASE_URL`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `SESSION_SECRET`,
`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`. Setting real values was out of
scope for #981 (user provides secrets out-of-band). Task #983 resolves
each key so production starts cleanly.

## Per-key disposition

| Key | Disposition | Evidence |
| --- | --- | --- |
| `DATABASE_URL` | NOT re-added. Code now reads `POSTGRES_URL` (already set on Railway) via `getDbUrl()` / `requireDbUrl()`. | `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` updated in this task to call `requireDbUrl()` instead of reading `process.env.DATABASE_URL` directly. All other readers (`lib/db/script/apply-*.mjs`, `artifacts/api-server/src/scripts/audit-orphaned-hero-photos.ts`) already use the `POSTGRES_URL ?? DATABASE_URL` fallback. The helper itself lives in `lib/db/src/db-url.ts` / `lib/shared/src/db-url.ts` / `artifacts/api-server/src/shared/db-url.ts`. |
| `SESSION_SECRET` | RE-ADDED with a real value on Railway. Required for boot. | `artifacts/api-server/src/session.ts` uses `process.env.SESSION_SECRET!` (non-null assertion → crash on missing). `artifacts/api-server/src/auth.ts` and `artifacts/api-server/src/notifications/constants-action-token.ts` derive HMAC keys from it. A 48-byte base64url random was generated locally (`node -e "crypto.randomBytes(48)"`) and upserted via `railway variables --service H-Analytics --environment production --set SESSION_SECRET=… --skip-deploys`, then a redeploy was triggered. Verified present via `railway variables --kv | grep ^SESSION_SECRET=`. The value was never written to the repo or printed to chat. |
| `ADMIN_PASSWORD` | NOT re-added. Confirmed unused. | `rg "process\.env\.ADMIN_PASSWORD"` returns no matches across the entire repo. |
| `GOOGLE_AI_API_KEY` | NOT re-added. Confirmed unused. | `rg "GOOGLE_AI_API_KEY"` returns no code matches. Gemini code reads `process.env.GEMINI_API_KEY` (specialists) or `AI_INTEGRATIONS_GEMINI_API_KEY` (`artifacts/api-server/src/ai/clients.ts`). Neither is the deleted key. |
| `OPENAI_API_KEY` | NOT re-added. Not required for clean boot. | Production already has `OPENAI_EMBEDDING_KEY` set, which `artifacts/api-server/src/ai/vector-store-service.ts` and `artifacts/api-server/src/index.ts` (`hasEmbeddingKey`) check first. The chat path (`artifacts/api-server/src/ai/clients.ts`) reads `AI_INTEGRATIONS_OPENAI_API_KEY`. `OPENAI_API_KEY` only acts as a legacy fallback for embeddings; without it the app still starts and embedding still works because `OPENAI_EMBEDDING_KEY` is set. If/when the user wants to point chat at direct OpenAI instead of the Replit AI Integrations proxy, they can set `AI_INTEGRATIONS_OPENAI_API_KEY` out-of-band. |
| `ANTHROPIC_API_KEY` | NOT re-added. Not required for clean boot; AI features that need it gate themselves off when missing. | `artifacts/api-server/src/ai/research-orchestrator.ts:598` is a feature gate (`return !!process.env.ANTHROPIC_API_KEY`) — missing key disables the feature, it does NOT crash the server. `artifacts/api-server/src/ai/clients.ts` accepts either `ANTHROPIC_API_KEY` or `AI_INTEGRATIONS_ANTHROPIC_API_KEY` and only throws when the client is actually constructed (lazy). User will provide a real Anthropic key out-of-band when AI research features are needed; per the task description, real provider keys are out of scope. |

## Production env state after this task

```
OPENAI_EMBEDDING_KEY=***SET***
POSTGRES_URL=***SET***
SESSION_SECRET=***SET***
```

Plus the unrelated keys already present (`APP_URL`, `AUTH_PROVIDER`,
`FRED_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NODE_ENV`,
R2_*, `STORAGE_PROVIDER`, `TOKEN_ENCRYPTION_KEY`, RAILWAY_*).

## Acceptance check

- Each of the six removed keys is dispositioned (re-created with a real
  value, or confirmed unneeded because the code reads a different key /
  the feature is optional). ✅
- After the changes, `H-Analytics` production has no remaining "missing
  required env var" path: `POSTGRES_URL` satisfies the DB resolver,
  `SESSION_SECRET` is set, and the four AI/admin keys are either unused
  in code or only referenced by lazy/optional code paths. ✅
