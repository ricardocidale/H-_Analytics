# Codebase & Dependency Independence from Replit

> **Added 2026-04-22.** Replit is one supported host, not the only one. The
> codebase, build, runtime, and tests must remain portable to any standard
> Linux + Node + Postgres environment (laptop, GitHub Actions, Render, Fly,
> bare VPS, Vercel, Railway, etc.). Lock-in is a regression.

## Rule (one line)

> **The app must build, boot, run its tests, and serve traffic on a
> non-Replit machine without code changes — only env-var and Postgres URL
> changes are allowed.**

## What this means in practice

### MUST

1. **Standard runtime contract.** Boot path requires only `node >= 20`,
   `npm`, and a reachable Postgres URL via `DATABASE_URL`. Nothing else
   may be a hard prerequisite for `npm install && npm run build &&
   npm start` to succeed.
2. **All Replit-specific config is gated.** Anything that reads
   `process.env.REPL_*`, `process.env.REPLIT_*`, or talks to a Replit
   internal service MUST:
   - live behind a single adapter module (e.g. `server/host/replit.ts`),
   - no-op cleanly when those env vars are absent,
   - never be imported from core domain code (`calc/`, `shared/`,
     `engine/`, route handlers' business logic).
3. **Auth has a non-Replit path.** `replitAuth.ts` is one provider, not
   the auth contract. The auth interface (`req.user`, `requireAdmin`,
   `requireUser`) must work with any OIDC/email provider given the
   right env vars. Adding a second provider must NOT require touching
   route code.
4. **Database is plain Postgres.** Schema, migrations, and queries use
   Drizzle against a vanilla Postgres (any version we declare in
   `package.json#engines`). No Neon-only, no Replit-DB-only, no proprietary
   extensions without a documented fallback.
5. **Object storage is abstracted.** Any blob storage call goes through
   a small `storage/objectStore.ts` interface with at least an S3-compatible
   adapter alongside the Replit one. Same for email, SMS, secrets.
6. **Vite plugins from `@replit/*` are dev-only.** They MUST be loaded
   conditionally (`if (process.env.REPL_ID) plugins.push(...)`) so a
   non-Replit `vite build` succeeds without them installed.
7. **Workflows are mirrored to npm scripts.** Every command exposed as a
   Replit Workflow must also exist as a standard `npm run <name>` script.
   The `.replit` file is a convenience layer over `package.json`, never
   the only way to run something.
8. **Secrets via `process.env` only.** No reads from Replit Secrets API
   at runtime in app code; the platform injects them as env vars and
   the app reads them like any 12-factor service.

### MAY

- Use Replit Connectors (`@replit/connectors-sdk`) for **third-party**
  integrations (Stripe, Google, Linear, etc.) — they're a credential
  broker and degrade to plain env vars when the SDK can't reach the
  broker.
- Use Replit Deployments as a hosting target.
- Use Replit Workflows + the IDE for developer ergonomics.
- Use `@replit/vite-plugin-*` packages, **dev-only and conditionally
  loaded**.

### MUST NOT

- Hard-code `*.replit.dev`, `*.repl.co`, `*.replit.app`, or any Replit
  internal hostname in source code. Always read from env (`PUBLIC_URL`,
  `BASE_URL`, etc.).
- Import `@replit/*` from `client/`, `shared/`, `calc/`, `engine/`, or
  any route handler's business logic.
- Make `replitAuth` the type/interface that other code depends on. Code
  depends on the abstract user/session shape, not on the Replit shape.
- Ship code paths that throw or silently break when REPL_* env vars are
  absent.
- Add new `@replit/*` dependencies to `dependencies` (only
  `devDependencies` and only behind a conditional load).

## Self-check before merging any change

A change passes this rule iff **all** of the following are true:

1. `unset $(env | grep -E '^REPL' | cut -d= -f1) && DATABASE_URL=... npm run build` succeeds.
2. `unset $(env | grep -E '^REPL' | cut -d= -f1) && DATABASE_URL=... npm test` runs (auth-gated tests may skip; nothing may crash on import).
3. New imports of `@replit/*` are zero, OR live in an explicitly-gated host adapter module.
4. New `process.env.REPL*` reads are zero, OR live in `server/host/replit.ts` (or equivalent adapter).
5. New env vars added to the app are documented in `.env.example` with a non-Replit-specific description.

## Why this rule exists

- We've already built around `@replit/connectors-sdk` and `replitAuth` —
  that coupling is real and load-bearing. Without this rule, every new
  feature deepens it and a future migration becomes a rewrite.
- A portable codebase is a testable codebase. CI on GitHub Actions,
  local dev on a laptop without Replit, and a smoke deploy to a second
  host are all the same operation under this rule.
- The work in `calc/`, `engine/`, `shared/` is the actual product —
  hospitality financial intelligence. The hosting layer is replaceable
  infrastructure and must be treated as such.

## Related rules

- `.claude/rules/claude-replit-split.md` — division of labor between the
  two coding agents. (Process rule; this is a code rule.)
- `.claude/rules/security.md` — env-var hygiene + secrets handling.
- `.claude/rules/no-hardcoded-values.md` — no magic numbers, no magic
  hostnames.
