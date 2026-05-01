---
name: prefer-external-dependencies
description: Default to the external services this project already wires up (Neon Postgres via POSTGRES_URL, Cloudflare R2 via R2_*, FRED, GitHub PAT, OpenAI embeddings, etc.) instead of reaching for Replit-managed equivalents (Replit Database, Replit Object Storage, Replit Auth). Use BEFORE calling any Replit setup tool — checkDatabase, createDatabase, check_object_storage_status, setup_object_storage, integration setup — and BEFORE adding any `@replit/*` runtime dependency. Replaces the reflex of "provision the Replit built-in" with a 30-second secret/env scan that finds the external service the project is already paying for and using.
---

# Prefer External Dependencies

The positive companion to `replit-independence`. That skill is a **gate** ("don't break portability"). This skill is a **preference** ("when there's a choice, the external service the project already wired up wins"). They cover the same surface from opposite angles — load both whenever you're about to provision, configure, or call any infrastructure-shaped tool.

## Why this skill exists

Replit's environment helpfully exposes built-in equivalents for almost every infrastructure concern: a managed Postgres, an Object Storage bucket, an auth provider, a connectors broker, a workflow runner. The agent's reflex is to reach for them because the tool surface is right there: `checkDatabase`, `createDatabase`, `setup_object_storage`, etc.

In a mature project, that reflex is almost always wrong:

- The external service is **already provisioned**, **already paid for**, **already has the production data**, and **already has the credentials in environment secrets**.
- Provisioning a parallel Replit-managed instance creates a second source of truth, splits data, and produces the exact lock-in that `replit-independence` exists to prevent.
- The user feels it as "you ignored what was already there."

This project specifically uses external infrastructure. Defaulting to Replit built-ins here is a regression every time.

## When to load this skill

BEFORE doing any of the following, load this skill:

- Calling `checkDatabase()`, `createDatabase()`, or running any SQL via the Replit DB tool path.
- Calling `check_object_storage_status` or `setup_object_storage`.
- Calling `setup_replit_ai_integrations` or any Replit-managed AI broker.
- Adding a new `@replit/*` package to `dependencies` (vs. dev-only conditional load).
- Wiring a "send email", "send SMS", "store file", "queue job", "store secret", "fetch credential" call.
- Reading a `<system-reminder>` that an integration is "INSTALLED" — verify it's the path the project actually uses, not the path you should default to.

## The 30-second scan (MANDATORY before reaching for any Replit built-in)

Run this scan first. It almost always answers "the external service is already wired."

1. **Scan available secrets** for an external credential covering this concern:
   - Postgres → `POSTGRES_URL`, `DATABASE_URL` (Neon/Vercel/Supabase)
   - Object storage → `R2_*` (Cloudflare), `S3_*` / `AWS_*` (AWS), `GCS_*` (Google)
   - Auth → `GOOGLE_CLIENT_SECRET`, `GITHUB_PAT`, `*_OAUTH_*`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`
   - LLM → `OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
   - Data → `FRED_API_KEY`, vendor-specific keys
2. **Grep the codebase** for that secret name (`rg -l "POSTGRES_URL" --type ts -g '!node_modules'`) — if it's referenced, the wiring already exists. Use it.
3. **Read the adapter file** (`server/db.ts`, `server/storage/*.ts`, `server/host/*.ts`, `server/providers/*.ts`) before calling any Replit setup tool. The adapter shows the canonical access path.
4. **Only if no external secret + no adapter exists**, consider Replit built-ins — and then ask the user before provisioning.

## Decision order (when there is a choice)

For each infrastructure concern, prefer in this order:

1. **External service already wired in the codebase** (adapter file + env secret present) — use it as-is.
2. **External service with credentials present but no adapter yet** — write a thin adapter, use it.
3. **External service the user explicitly names** — wire it, document in `.env.example`.
4. **Replit-managed broker for a third-party** (e.g. `@replit/connectors-sdk` for Stripe/Google) — acceptable, but only if it falls back to plain env vars when the broker is unreachable (per `replit-independence`).
5. **Replit built-in equivalent** (Replit DB, Replit Object Storage, Replit Auth) — last resort, only with explicit user confirmation, and only if portability is preserved.

## This project's external services (memorize)

These are the services this project already uses. Reach for these *first*; do not provision Replit equivalents.

| Concern | External service | Secret | Adapter |
|---|---|---|---|
| Primary database | Neon Postgres (or Vercel Postgres) | `POSTGRES_URL` | `server/db.ts`, `shared/db-url.ts` |
| Vector store | pgvector inside the same Neon DB | `POSTGRES_URL` | `server/ai/vector-store-service.ts` |
| Object storage | Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | check `server/storage/`, `server/providers/` |
| Macro data | FRED (St. Louis Fed) | `FRED_API_KEY` | `server/ai/` ambient fetchers |
| Source control / API | GitHub PAT | `GITHUB_PAT` | scripts + integration |
| OAuth / SSO | Google | `GOOGLE_CLIENT_SECRET` (+ client id) | auth routes |
| Embeddings | OpenAI | `OPENAI_EMBEDDING_KEY` | `server/ai/vector-store-service.ts` |
| Token encryption | local (libsodium / node:crypto) | `TOKEN_ENCRYPTION_KEY` | auth/session layer |

If a future task needs something *not* on this list, run the 30-second scan before assuming a Replit built-in is the answer.

## Anti-patterns (this is the failure mode this skill prevents)

### Anti-pattern A: "checkDatabase says not provisioned, so I'll provision one"

```
checkDatabase() → { provisioned: false }
→ createDatabase()                  # WRONG
```

Correct flow:

```
checkDatabase() → { provisioned: false }
→ scan secrets for POSTGRES_URL / DATABASE_URL
→ POSTGRES_URL present → read server/db.ts → use the existing pool
→ never call createDatabase()
```

### Anti-pattern B: "object storage status returned a Replit bucket, so I'll write to it"

```
check_object_storage_status() → { bucket: "replit-objstore-..." }
→ upload to /replit-objstore-.../public/...    # WRONG if R2 is the canonical store
```

Correct flow:

```
scan secrets → R2_BUCKET present
→ grep for R2 client → use existing R2 adapter
→ ignore the Replit bucket unless the project explicitly uses both
```

### Anti-pattern C: "an integration is INSTALLED in the system reminder, so it's the path"

The `<available_secrets>` and `INSTALLED` integration list is a *menu*, not a prescription. The project may have installed a Replit integration historically and migrated to a direct external SDK. Always check the adapter file before assuming the integration is the live path.

### Anti-pattern D: "I'll just add @replit/database to dependencies"

Forbidden by `replit-independence`. If you're tempted, the answer is in this project's existing external Postgres.

## Self-check (run mentally before any infra-shaped tool call)

A tool call passes iff **all** are true:

- [ ] I scanned `<available_secrets>` for an external credential covering this concern.
- [ ] I grepped the codebase for that secret name and found (or confirmed absence of) existing wiring.
- [ ] I read the adapter file if one exists.
- [ ] I am NOT about to call `createDatabase`, `setup_object_storage`, or similar when an external equivalent is already wired.
- [ ] If I AM about to use a Replit built-in, the user explicitly confirmed it for this change.

## When the user explicitly asks for a Replit built-in

If the user says "use Replit's database" or "store this in Replit Object Storage", that is an explicit waiver. Honor it, but:

1. Write the call behind the existing adapter pattern, not inline.
2. Note in the commit message that a Replit-managed dependency was added at user request.
3. Capture as an ADR under `.claude/adrs/` if the choice is structural (per `replit-independence`).

## Reference

- Companion gate skill: `.agents/skills/replit-independence/SKILL.md`
- Project memory: `replit.md`, `.claude/claude.md`
- Adapter examples: `server/db.ts`, `shared/db-url.ts`
- Rule rationale: `.claude/rules/replit-independence.md`
