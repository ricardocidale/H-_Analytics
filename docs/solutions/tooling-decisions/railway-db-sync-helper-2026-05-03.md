---
title: "One-command Railway database sync helper"
date: 2026-05-03
category: docs/solutions/tooling-decisions
module: scripts
problem_type: tooling_decision
component: development_workflow
severity: medium
applies_when:
  - Provisioning a new Railway Postgres instance for the first time
  - Refreshing a staging Railway instance from dev data
  - Executing dev-to-production cut-over as part of the Railway operator runbook
tags:
  - railway
  - postgres
  - pg-dump
  - pg-restore
  - drizzle
  - database
  - migration
  - devex
related_components:
  - database
  - tooling
---

# One-command Railway database sync helper

## Context

Before Task #978, the Railway operator runbook required three separate manual steps — run `drizzle-kit push`, compose a `pg_dump` invocation with the exact correct flags, then compose a matching `pg_restore` invocation. Each command required the operator to know the codebase-specific flag set (`--data-only`, `--disable-triggers`, `--no-owner`, `--no-acl`, `--format=custom`). Connection strings appeared in full in terminal output and shell history. There was no verification step — after restore you had no immediate signal that row counts matched.

The Replit "Publish / copy dev DB to prod DB" toggle was investigated as an alternative but is only viable for Replit-managed databases; it cannot copy between external Neon (source) and Railway (target) instances. The manual multi-command approach was the only option until this script was written.

## Guidance

The script lives at `scripts/src/sync-db-to-railway.ts` and is invoked via the workspace scripts package:

```bash
pnpm --filter @workspace/scripts run sync-db-to-railway -- \
  --source 'postgres://dev-user:pass@dev-host:5432/mydb' \
  --target 'postgres://railway-user:pass@host.railway.app:5432/railway'
```

**What it does (in order):**

1. Pre-flight binary check — verifies `pg_dump`, `pg_restore`, and `psql` are on `PATH` before doing any work.
2. Schema push — runs `drizzle-kit push` against the target so the latest Drizzle schema is applied.
3. Data-only dump — runs `pg_dump --data-only --no-owner --no-acl --disable-triggers --format=custom` on the source into a temp file.
4. Restore — runs `pg_restore --data-only --no-owner --no-acl --disable-triggers --single-transaction` into the target.
5. Row-count diff — queries both databases via `psql` for nine major tables and prints a four-column table (table / source / target / delta).
6. Cleanup — deletes the temp dump file on exit unless `--keep-dump` is passed.

**CLI flags:**

| Flag | Purpose |
|---|---|
| `--source <url>` | Connection string for the source database (dev) |
| `--target <url>` | Connection string for the target database (Railway) |
| `--skip-schema` | Skip `drizzle-kit push` (use when schema is already current) |
| `--skip-data` | Skip dump/restore (use to run only schema push + verification) |
| `--keep-dump` | Retain the dump file after the run (for inspection or manual replay) |
| `--dump-file <path>` | Override the default temp path for the dump file |

**Environment variable alternatives:** `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL` can be set instead of passing `--source`/`--target`. Preferred in CI to avoid credentials in command-line arguments.

## Why This Matters

**Key design decisions and why each was made:**

| Decision | Rationale |
|---|---|
| `--data-only` on `pg_dump` | Schema is fully owned by Drizzle migrations. Mixing `pg_dump` schema output into a Drizzle-managed database creates drift between what Drizzle tracks and what's live. |
| `--disable-triggers` on both dump and restore | Postgres enforces FK constraints via deferred triggers. Disabling them during restore allows insertion in dump order without requiring topological table ordering. Without this flag, restores fail on any dataset with FK constraints. |
| `--single-transaction` on `pg_restore` | Makes the restore atomic — all rows land or none do. Prevents a partially-restored database from being treated as ready for production traffic. |
| Custom format (`-Fc`) over plain SQL | Binary compressed format is smaller, supports parallel restore via `-j`, and allows selective table restore with `-t`. Plain SQL is a one-shot flat file with no post-hoc flexibility. |
| `maskUrl()` connection string masking | Uses the WHATWG `URL` API to replace the password with `***` and truncate the username prefix before any logging. Raw connection strings — which contain passwords — never appear in terminal output. |
| `drizzle-kit push` before data restore | The target DB starts empty on first use — there is no migration history to reconcile, so `push` is faster than `migrate`. And schema must exist before data can be loaded. |

The row-count diff after restore is the built-in verification step the manual process lacked. A non-zero delta on any table is an immediate signal to re-run before cutting over production traffic.

## When to Apply

- **Initial Railway DB population** — when provisioning a new Railway Postgres service and seeding it from the current development database.
- **Staging refresh** — periodically bring a staging/preview Railway instance back in sync with dev data. Use `--skip-schema` if schema is already current.
- **Dev → production cut-over** — step 2–3 of the Railway operator runbook (`docs/developer/migration-from-replit.md`). This is the primary use case the script was designed for.
- **Schema-only push** — use `--skip-data` to verify/apply the target schema without moving any data.

Not the right tool for: incremental CDC replication, cross-major-version Postgres upgrades (client binary version must match server), or cases where the target schema diverges from Drizzle's migration history.

## Examples

Full sync (schema + data):

```bash
pnpm --filter @workspace/scripts run sync-db-to-railway -- \
  --source 'postgres://...' \
  --target 'postgres://...'
```

Data-only refresh, keep the dump file for inspection:

```bash
pnpm --filter @workspace/scripts run sync-db-to-railway -- \
  --skip-schema --keep-dump \
  --source 'postgres://...' \
  --target 'postgres://...'
```

Using environment variables (preferred in CI):

```bash
export SOURCE_DATABASE_URL='postgres://...'
export TARGET_DATABASE_URL='postgres://...'
pnpm --filter @workspace/scripts run sync-db-to-railway
```

Schema-only push, no data movement:

```bash
pnpm --filter @workspace/scripts run sync-db-to-railway -- \
  --skip-data \
  --source 'postgres://...' \
  --target 'postgres://...'
```

## Related

- `docs/developer/migration-from-replit.md` — operator runbook that uses this script in steps 2–3
- `docs/solutions/database-issues/replit-managed-db-vs-neon-postgres-url-2026-05-02.md` — connection string handling conventions the script follows
- `scripts/src/sync-db-to-railway.ts` — implementation
