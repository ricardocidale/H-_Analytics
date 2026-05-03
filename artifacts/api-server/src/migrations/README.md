# Runtime migration guards (belt-and-suspenders pattern)

This directory contains **runtime migration guards**: idempotent, named TypeScript
migrations that run on every server boot from `runSchemaMigrations()` in
`../index.ts`. They are the "suspenders" to Drizzle's "belt".

## Why both?

Drizzle's `migrate()` is the primary mechanism. It walks the journal in
`artifacts/api-server/migrations/meta/_journal.json`, hashes each `.sql` file,
and applies the ones that have not been recorded in
`drizzle.__drizzle_migrations`.

That works perfectly on a fresh database. On a pre-existing database it can
fail silently:

- `bootstrapDrizzleMigrationState()` (in `consolidated-schema.ts`) pre-marks
  the original four legacy migrations as applied so `migrate()` doesn't try to
  re-create tables that already exist.
- If that bootstrap ever pre-marks an entry it shouldn't, Drizzle skips that
  entry on every existing DB and the DDL never runs in production.

That is exactly what happened with `0028_reference_brands.sql` — the migration
was journaled, pre-marked as applied on the legacy Neon DB, never executed,
and we shipped a code path that queried a non-existent table. The fix was to
add `reference-brands-001.ts` here as a runtime guard with `CREATE TABLE IF
NOT EXISTS`, which runs unconditionally and is safe even when the table is
already there.

The lesson: **for any new schema-changing Drizzle migration, also write a
runtime guard here that re-applies the same DDL idempotently.** That way the
schema is correct on every boot, regardless of how the journal got marked.

## How to add a new migration

1. **Write the Drizzle SQL** as usual under `artifacts/api-server/migrations/`
   (e.g. `0030_my_change.sql`). Prefer idempotent statements there too:
   `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, and `DO $$ ... END $$` blocks for anything
   conditional.

2. **Decide the runtime status** and record it in
   [`migration-guards.json`](./migration-guards.json):

   - `guarded` — most new schema migrations. You also add a `*.ts` file in
     this directory that re-applies the DDL with `IF NOT EXISTS` /
     `IF EXISTS` semantics, and wire it into `runSchemaMigrations()` (or
     `runSeeds()` for data seeds) using `isMigrationApplied` /
     `markMigrationApplied`.
   - `self-idempotent` — the `.sql` file is itself fully idempotent (every
     statement uses `IF NOT EXISTS` / `IF EXISTS` / a `DO` block guard) **and**
     the change is small enough that re-running it via `migrate()` is the only
     safety net you need. Document why in the manifest entry.
   - `legacy` — pre-bootstrap entries (idx 0–3). Do not add new entries with
     this status.
   - `waived` — there is a deliberate reason no runtime guard is needed
     (e.g. pure data backfill that ran once and can never need to re-run).
     Always include a `reason`.

3. **Run the check**:

   ```sh
   pnpm --filter @workspace/scripts run check:migration-guards
   ```

   It fails if a journal entry is missing from the manifest, or if a
   `guarded` entry points at a runtime file that does not exist.

## Existing runtime guards

The runtime guards still wired into `runSchemaMigrations()` are listed at the
top of that function. Many older guards have been **consolidated** into
batched Drizzle migrations (`0029_batch10_*`, `0030_phase_c_batch_1`, …) and
their `.ts` files are kept around only as historical reference — those are
marked `consolidated` in the manifest.

## TL;DR

> Belt = Drizzle journal + `migrate()`.
> Suspenders = a named, idempotent runtime guard in this directory.
>
> New schema migration without suspenders = a future incident waiting to
> happen. The `check:migration-guards` script enforces this.
