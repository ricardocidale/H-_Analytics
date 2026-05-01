---
name: replit-independence
description: Keep the codebase and dependencies portable off Replit. Use when adding any dependency, host call, env-var read, deployment-affecting change, auth provider, storage backend, or hostname. Triggers on "@replit/", "process.env.REPL", "replitAuth", ".replit", "Replit Workflow", "replit.dev", new package.json deps, host adapter changes, or any task that touches the build/run/deploy contract.
---

# Replit Independence Skill

Enforce the rule: **the codebase, build, runtime, and tests must remain
portable to any standard Linux + Node + Postgres environment without code
changes — only env vars and the Postgres URL change.**

Replit is one supported host, not the only one. Lock-in is a regression.

## When this skill applies

Open this skill BEFORE doing any of the following:

- Adding a new package to `package.json` (especially `@replit/*`).
- Reading `process.env.REPL_*` or `process.env.REPLIT_*` anywhere.
- Touching `replitAuth.ts`, the auth contract, or any session shape.
- Adding a new Replit Workflow, or removing an `npm run` script.
- Hard-coding any hostname, callback URL, or webhook URL.
- Adding object storage, email, SMS, secrets, or queue calls.
- Modifying `.replit`, `replit.nix`, `vite.config.ts` plugin list, or
  the build/start scripts.
- Auditing or planning architecture in `.claude/` for any of the above.

## The five MUSTs (memorize)

1. **Build & boot offline.** `unset $(env | grep -E '^REPL' | cut -d= -f1) && DATABASE_URL=... npm run build && npm start` MUST succeed on any Linux+Node 20+ machine.
2. **Tests don't crash on import.** Same env, `npm test` must run; auth-gated tests may skip, but nothing may throw on module load because a Replit env var is missing.
3. **One adapter file owns Replit.** All `process.env.REPL*` reads, all `@replit/*` imports outside `vite.config.ts`, and all Replit-API calls live in a single host adapter (e.g. `server/host/replit.ts`). Core code (`calc/`, `engine/`, `shared/`, `client/`, route business logic) MUST NOT import from it directly — they go through abstract interfaces.
4. **Auth is a contract, not a vendor.** Routes depend on the abstract user/session shape. Adding a second OIDC/email provider must NOT require touching route code.
5. **Workflows mirror npm scripts.** Every `.replit` workflow has a matching `npm run <name>` script. The npm script is the source of truth.

## The four MUST NOTs

- **No `@replit/*` in core.** Forbidden in `client/`, `shared/`, `calc/`,
  `engine/`, or any route handler's business logic.
- **No hard-coded Replit hostnames.** No `*.replit.dev`, `*.repl.co`,
  `*.replit.app`, or internal Replit hostnames in source. Read from env.
- **No new `@replit/*` in `dependencies`.** Only `devDependencies`, only
  behind a conditional load (`if (process.env.REPL_ID) plugins.push(...)`).
- **No code that throws when REPL_* is unset.** Adapters must no-op
  cleanly. A missing Replit env var is "not running on Replit", not an
  error condition.

## Allowed Replit usage

- `@replit/connectors-sdk` for third-party credential brokering (Stripe,
  Google, Linear, etc.) — degrades to plain env vars when the broker is
  unreachable.
- `@replit/vite-plugin-*` packages **dev-only and conditionally loaded**.
- Replit Deployments as a hosting target.
- Replit Secrets — but consumed via standard `process.env`, never via a
  Replit-specific runtime API in app code.
- Replit Workflows + the IDE for developer ergonomics, mirrored to npm
  scripts.

## Self-check checklist (run mentally before every commit)

A diff passes iff **all** are true:

- [ ] No new `@replit/*` import in `client/`, `shared/`, `calc/`, `engine/`, or route business logic.
- [ ] Any new `process.env.REPL*` read lives in the host adapter (or `vite.config.ts`).
- [ ] Any new hostname is read from env, not hard-coded.
- [ ] Any new Replit Workflow has a matching `npm run` script.
- [ ] Any new `@replit/*` dep is in `devDependencies` and conditionally loaded.
- [ ] New env vars are documented in `.env.example` with non-Replit-specific descriptions.
- [ ] If auth/storage/email/SMS got a new provider call, an interface exists with at least one non-Replit implementation alongside.

## What to do when the rule conflicts with a request

If the task as written requires Replit-only code (e.g. "use the Replit
Object Storage SDK directly"), do NOT silently break the rule. Instead:

1. Implement against an adapter interface with a Replit implementation.
2. Note in the commit / handoff that a non-Replit implementation is the
   next required step.
3. If the user explicitly waives the rule for this change, capture it as
   an ADR under `.claude/adrs/` with the scope and expiry of the waiver.

## Reference

- Full rule with rationale and migration guidance:
  `.claude/rules/replit-independence.md`
- Related: `.claude/rules/claude-replit-split.md` (process rule for the
  two coding agents), `.claude/rules/security.md` (env-var hygiene).
- Top-level summary in `replit.md` and `.claude/claude.md`.
