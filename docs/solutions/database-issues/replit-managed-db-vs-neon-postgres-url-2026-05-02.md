---
title: "Replit-managed DB and Neon are separate — scripts must use POSTGRES_URL"
date: 2026-05-02
category: database-issues
module: scripts/audit-orphaned-hero-photos
problem_type: database_issue
component: database
severity: high
symptoms:
  - "Scripts run against the wrong database and either no-op or backfill stale data"
  - "Property hero photo IDs reported by a script do not match what the running app sees"
  - "An audit on the production DB shows different orphans than the same audit run via Replit's built-in SQL UI"
root_cause: incomplete_setup
resolution_type: convention
related_components:
  - development_workflow
tags:
  - neon-postgres
  - replit
  - postgres-url
  - database-url
  - cross-environment
  - audit-script
  - photos
---

# Replit-managed DB and Neon are separate — scripts must use `POSTGRES_URL`

## Problem

Replit reserves the `DATABASE_URL` env var for the **Replit-managed Helium
Postgres** that ships with every workspace. The H+ Analytics app does **not**
use that DB — it points at an external **Neon** project via `POSTGRES_URL`.
The two databases have completely independent schemas, IDs, and content. A
property's hero photo is row id `41` in Neon and row id `1` in the
Replit-managed DB; the same row in one DB has nothing to do with the same id
in the other.

This bites in three ways:

1. **Replit's built-in SQL UI** (and any Replit `executeSql`-style helper)
   targets the Helium DB by default. Inspecting "the database" through that
   surface shows fictitious data unrelated to production.
2. **One-off scripts** that read `process.env.DATABASE_URL` directly, or run
   without `POSTGRES_URL` set, silently land on the Helium DB. Backfills,
   audits, and resync scripts all return wrong answers (or, worse, mutate
   the wrong DB).
3. **Cross-DB drift** in references. Because IDs are independent, a value
   like `properties.image_url = '/api/property-photos/7/image'` may resolve
   in one DB and 404 in the other. The orphaned-hero audit
   (`artifacts/api-server/src/scripts/audit-orphaned-hero-photos.ts`) was
   added in Task #938 specifically to catch this class of orphan after each
   migration.

## Concrete example caught at audit time

The first run of `audit-orphaned-hero-photos.ts` against Neon (8 properties,
29 photos, 82 media assets) found exactly one orphan: photo id `41` on
property 50 (Jano Grande Ranch). Its `image_url` is `/api/property-photos/41/image`
(self-referential) but `image_data` is `NULL` — i.e. the row points at
itself with no binary behind it. The caption (`e2e-photoalbum-moejpybo`)
and the `2026-04-25` creation date make the origin obvious: an E2E test
created the album row and never cleaned up after asserting. It is **not**
the hero (sort_order 3, isHero=false) so the property card renders fine,
but it is dead data and should be deleted in a follow-up cleanup. Documented
here as intentionally left behind so the audit's signal is preserved as a
regression test for the script itself.

## Convention (read before writing any DB script)

- **All runtime modules and scripts** must resolve the connection string
  through `requireDbUrl()` / `getDbUrl()` from
  `lib/shared/src/db-url.ts` (imported via the `@shared/*` tsconfig alias which resolves directly to `lib/shared/src/*` — no local mirror copy exists). Never read
  `process.env.DATABASE_URL` directly. The helper reads `POSTGRES_URL`
  first and falls back to `DATABASE_URL` so production traffic always
  reaches Neon while local/CI workflows that explicitly clear
  `POSTGRES_URL` still work.
- **One-off scripts** under `artifacts/api-server/src/scripts/` import
  `../db` (which goes through `requireDbUrl()`); just calling
  `import "dotenv/config"` is enough to pick up `POSTGRES_URL` from the
  Replit Secrets that the app already uses.
- **Do not use Replit's built-in SQL UI or `executeSql` callbacks to inspect
  production data** — they target Helium, not Neon. To query Neon read-only,
  run a tsx script through `pnpm exec tsx --tsconfig artifacts/api-server/tsconfig.json …`
  from the api-server dir, or use the `database` skill with
  `environment: "production"`.
- **Audits across environments**: re-run the orphaned-hero audit (and any
  similar audit) once per environment whose `POSTGRES_URL` differs. There is
  no single global view; each Postgres has its own truth.

## Why this is easy to get wrong

`DATABASE_URL` is the conventional Postgres env var, so every script template
on the internet (and most agent-suggested boilerplate) reads it. On Replit
that variable is *always set* (Helium provisions it automatically), so the
script never errors out — it just silently connects to the wrong database.
The only signal you ran against Helium is that the IDs and counts don't
match what the deployed app shows.

## See also

- `lib/shared/src/db-url.ts` — full rationale for the `POSTGRES_URL ??
  DATABASE_URL` resolution order, including why CI clears `POSTGRES_URL` to
  the empty string.
- `artifacts/api-server/src/scripts/audit-orphaned-hero-photos.ts` —
  per-environment audit for orphan hero/image_url references.
- `artifacts/api-server/src/scripts/resync-property-image-url.ts` — repair
  script for the `properties.image_url` cache (a partial fix; doesn't help
  if the underlying photo row itself is missing or has no binary).
- `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`
  — sibling case where the Helium-vs-Neon split silently broke seeding.
