---
title: "Drizzle migration state drift causes missing tables at runtime"
date: 2026-05-07
category: database-issues
module: artifacts/api-server/migrations
problem_type: database_issue
component: database
severity: high
symptoms:
  - "GET /api/admin/iris/status returns 500 with 'relation iris_runs does not exist'"
  - "GET /api/admin/knowledge-registry returns 500 with 'relation knowledge_registry does not exist'"
  - "Tables defined in SQL migration files and Drizzle schema are absent from the live Neon DB"
  - "Iris scheduler health checks fail every 24 h with missing-relation errors"
  - "drizzle.__drizzle_migrations row count is lower than the journal entry count"
root_cause: incomplete_setup
resolution_type: migration
related_components:
  - development_workflow
tags:
  - drizzle
  - neon-postgres
  - migration-state
  - missing-tables
  - bootstrap
  - journal-sync
  - executeSql
---

# Drizzle migration state drift causes missing tables at runtime

## Problem

Tables defined in Drizzle SQL migration files (e.g. `0036_knowledge_registry.sql`,
`0040_iris_runs.sql`, `0041_slide_factory_runs.sql`) were never applied to the live
Neon database, even though they appeared in both the schema and the journal.
The root cause: when `bootstrapDrizzleMigrationState()` runs on a legacy DB, it
pre-marks journal entries `idx < LEGACY_MIGRATION_CUTOFF_IDX` (idx 0–3) as applied
by inserting SHA-256 hashes into `drizzle.__drizzle_migrations`. On subsequent boots
the function returns early because the table already has rows. Any journal entry
added *after* the initial bootstrap — but not yet actually applied to Neon — is
then silently skipped by Drizzle's `migrate()` because its hash is absent from
`__drizzle_migrations`, while Drizzle still considers the DB fully migrated. The
tables never existed in production, causing 500 errors on any route that queries them.

Four tables were affected in the 2026-05-07 incident:
- `iris_runs`
- `knowledge_registry`
- `slide_factory_runs`
- `country_economic_data` (seed-phase table, blocked by above)

## Symptoms

- `GET /api/admin/iris/status` → 500 `relation "iris_runs" does not exist`
- `GET /api/admin/knowledge-registry` → 500 `relation "knowledge_registry" does not exist`
- Iris scheduler heartbeats fail every 24 h with the same missing-relation error
- Any API route that touches the affected table returns 500
- `drizzle.__drizzle_migrations` row count (38–39 at incident) is less than journal
  entry count (42 entries for idx 0–41)

## What Didn't Work

- **Relying on `migrate()` at next boot** — won't help if `__drizzle_migrations` already
  contains rows for those journal entries (Drizzle uses hash matching, not re-running).
- **Using the Replit code-execution `executeSql()` callback to inspect the DB** —
  `executeSql()` connects to Replit's built-in Helium Postgres, not Neon. Any query
  run that way returns a completely different schema and silently misleads the investigation.
  (See sibling doc: `replit-managed-db-vs-neon-postgres-url-2026-05-02.md`.)
- **Checking if tables exist via the Replit SQL UI** — same problem as above;
  the UI targets Helium, not Neon.

## Solution

### Step 1 — Confirm drift: count rows vs journal entries, and verify missing tables

Run a one-off Node.js script using the real Neon DB. **Do not use `executeSql()` or
the Replit SQL UI** — they connect to Replit's built-in Helium Postgres, not Neon.

```js
// scripts/check-migration-state.mjs
import pg from 'pg';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();

// 1. Count applied migrations
const { rows: [{ cnt }] } = await client.query(
  `SELECT COUNT(*)::int AS cnt FROM drizzle."__drizzle_migrations"`
);
console.log('Applied migration rows in __drizzle_migrations:', cnt);

// 2. Load journal and compare hashes for each entry
const migrationsDir = resolve('./artifacts/api-server/migrations');
const journal = JSON.parse(readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8'));
console.log('Journal entry count:', journal.entries.length);

const { rows: appliedRows } = await client.query(
  `SELECT hash FROM drizzle."__drizzle_migrations"`
);
const appliedHashes = new Set(appliedRows.map(r => r.hash));

for (const entry of journal.entries) {
  const sqlPath = `${migrationsDir}/${entry.tag}.sql`;
  const sql = readFileSync(sqlPath, 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');
  const applied = appliedHashes.has(hash);
  if (!applied) {
    console.log(`MISSING: idx=${entry.idx} tag=${entry.tag} hash=${hash.slice(0,8)}…`);
  }
}

// 3. Check whether tables actually exist on Neon
for (const table of ['iris_runs', 'knowledge_registry', 'slide_factory_runs']) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  console.log(`Table ${table} exists: ${rows[0].exists}`);
}

await client.end();
```

Run from the workspace root:
```bash
node --input-type=module --experimental-vm-modules \
  artifacts/api-server/node_modules/.bin/tsx \
  scripts/check-migration-state.mjs
```

Or more simply (tsx resolves POSTGRES_URL from env automatically):
```bash
cd artifacts/api-server && \
  POSTGRES_URL="$POSTGRES_URL" \
  node --loader ts-node/esm ../../scripts/check-migration-state.mjs
```

The output will show exactly which journal tags have no matching hash in
`__drizzle_migrations` — those are the migrations that Drizzle silently skipped.

### Step 2 — Apply missing DDL directly (idempotent)

**Always copy the DDL verbatim from the canonical `.sql` file** in
`artifacts/api-server/migrations/` — never reconstruct from memory, because the
hash Drizzle stores is computed from the file's exact bytes. Any whitespace or
comment difference produces a different hash and breaks the sync in Step 3.

```js
// scripts/fix-missing-tables.mjs
// Run from workspace root: POSTGRES_URL="$POSTGRES_URL" node --input-type=module < scripts/fix-missing-tables.mjs
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();

const migrationsDir = resolve('./artifacts/api-server/migrations');

// Read and execute each missing migration's SQL verbatim
// Replace this list with the actual missing tags from Step 1
const missingTags = [
  '0036_knowledge_registry',
  '0040_iris_runs',
  '0041_slide_factory_runs',
];

for (const tag of missingTags) {
  const sql = readFileSync(`${migrationsDir}/${tag}.sql`, 'utf8');
  console.log(`Applying ${tag}…`);
  await client.query(sql);
  console.log(`Done: ${tag}`);
}

await client.end();
```

This approach runs the exact SQL the migration file contains, which includes all
`CREATE TABLE`, `CREATE INDEX`, and constraint statements — not just the table body.
Using `IF NOT EXISTS` in the migration SQL (standard Drizzle output) makes it safe
to re-run.

### Step 3 — Sync `drizzle.__drizzle_migrations` hashes

After applying DDL manually, Drizzle must be told those migrations are done, otherwise
`migrate()` will try (and fail, or re-run) on the next boot.

**Important:** `drizzle."__drizzle_migrations"` has no UNIQUE constraint on `hash`
(only a `SERIAL PRIMARY KEY` on `id`). Do **not** use `ON CONFLICT DO NOTHING` —
it requires a unique index to function and will silently insert duplicates without
one. Use `WHERE NOT EXISTS` instead:

```js
import pg from 'pg';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();

const migrationsDir = resolve('./artifacts/api-server/migrations');
const journal = JSON.parse(
  readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8')
);

// Replace with the actual missing idx values from Step 1
const missingIdxs = new Set([36, 40, 41]);

for (const entry of journal.entries) {
  if (!missingIdxs.has(entry.idx)) continue;
  // CRITICAL: hash the file's exact bytes — same algorithm used by bootstrapDrizzleMigrationState()
  const sql = readFileSync(`${migrationsDir}/${entry.tag}.sql`, 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');
  // entry.when is already a BIGINT-compatible ms timestamp from the journal
  const result = await client.query(
    `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
     SELECT $1, $2
     WHERE NOT EXISTS (
       SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = $1
     )`,
    [hash, entry.when]
  );
  const inserted = result.rowCount ?? 0;
  console.log(`${entry.tag}: hash=${hash.slice(0, 8)}… — ${inserted > 0 ? 'inserted' : 'already present, skipped'}`);
}

await client.end();
```

### Step 4 — Trigger seed-phase follow-up if needed

If a seed-phase table was blocked (like `country_economic_data`), trigger regeneration
after the DDL is applied:

```bash
curl -s -b /tmp/cookies.txt -X POST \
  http://localhost:80/api/admin/knowledge-registry/country-economic-data/regenerate
```

### Step 5 — Verify

```bash
# Check migration state row count matches journal
# Check affected tables exist and have the right columns
# Restart the server and confirm no 500s on previously-failing routes
```

## Why This Works

### The two-layer migration system

This repo uses a two-layer design for DB migrations, but **three folders are involved**:

| Layer | Location | When it runs |
|-------|----------|--------------|
| **Drizzle generate output** | `lib/db/migrations/*.sql` + `meta/_journal.json` — written by `pnpm --filter @workspace/db run generate` per `lib/db/drizzle.config.ts` | Never auto-applied. Must be mirrored into the boot folder below — see foot-gun note. |
| **Drizzle boot migrations** | `artifacts/api-server/migrations/*.sql` + `meta/_journal.json` | Once at boot via `migrate()` from `drizzle-orm/node-postgres/migrator`. This is the only folder the running api-server reads. |
| **Runtime TS guards** | `artifacts/api-server/src/migrations/*.ts` | Every boot — idempotent `IF NOT EXISTS` DDL, belt-and-suspenders |

**Foot-gun:** new migrations generated by `pnpm --filter @workspace/db run generate` land in `lib/db/migrations/` and are invisible to the api-server until someone mirrors them into `artifacts/api-server/migrations/`. The two folders have already drifted into using the same slot numbers (e.g., both have a `0054_*` and `0055_*` with different content), so a naive copy is unsafe — slot conflicts must be resolved before mirroring. The failure mode is silent at boot and lethal at first query (column-not-found or table-not-found, depending on the missing DDL). See `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` for the dev-DB reseed angle on this same divergence.

### How `bootstrapDrizzleMigrationState()` works

`artifacts/api-server/src/migrations/consolidated-schema.ts`:

1. Creates `drizzle` schema and `drizzle."__drizzle_migrations"` table
2. If the table already has rows → returns immediately (no further work)
3. Detects legacy DB by checking if `public.properties` exists
4. On a legacy DB, pre-marks journal entries **with `idx < 4`** (the `LEGACY_MIGRATION_CUTOFF_IDX`)
   by SHA-256 hashing each `.sql` file and inserting the hash + journal `when` timestamp

**Critical:** pre-marking beyond idx 3 caused the `reference_brands` incident (see
`migration-guards.json` entry `0028_reference_brands` — that table was pre-marked,
DDL never ran, and the table was missing until a runtime guard fixed it). The cutoff
exists specifically to prevent this.

### Why drift happens on an existing legacy DB

If the DB was bootstrapped before some journal entries existed, and then those entries
were added later, `bootstrapDrizzleMigrationState()` returns early on subsequent boots
(because `__drizzle_migrations` already has rows). Drizzle's `migrate()` then hash-matches
against the existing rows and considers the new journal entries "already applied" — even
though they were never run. The DDL is silently skipped.

### Why `executeSql()` is useless for this investigation

Replit's code-execution environment has its own built-in Helium Postgres, always connected
via `DATABASE_URL`. The H+ app uses an external Neon instance via `POSTGRES_URL`. These
are entirely separate databases with independent schemas and row IDs. Any query via
`executeSql()` inspects Helium, not Neon — always shows different (and misleading) results.

## Prevention

- **Write a runtime TS guard** for any migration that is critical and idempotent. See
  `artifacts/api-server/src/migrations/reference-brands-001.ts` as the pattern. Register
  the guard in `migration-guards.json` with `"status": "guarded"` and deploy via
  `runSchemaMigrations()` in `index.ts`. Run the guard check to confirm wiring:
  ```bash
  pnpm --filter @workspace/scripts run check:migration-guards
  ```
- **After any manual DDL**, always sync `drizzle.__drizzle_migrations` hashes in the same
  script — never leave them out of sync or the next `migrate()` call will error or double-apply.
  Use the `WHERE NOT EXISTS` pattern from Step 3 — `ON CONFLICT DO NOTHING` silently
  misfires on this table (no UNIQUE constraint on `hash`).
- **Never use `executeSql()`** to inspect this DB. Use a Node.js script with `POSTGRES_URL`
  (via `artifacts/api-server/node_modules/pg`) or authenticate via `POST /api/auth/dev-login`
  and use curl with a cookie.
- **Check migration state row count** against journal entry count as part of any DB audit:
  `SELECT COUNT(*) FROM drizzle."__drizzle_migrations"` should equal the journal's entry
  count when all migrations have been applied cleanly. Use the Step 1 script to do a
  full hash-level comparison, not just a count.
- **Verify tables exist** before shipping a feature that introduces them — query
  `information_schema.tables WHERE table_name = 'your_table'` on Neon as a smoke test.
- **Always apply DDL from the canonical `.sql` file**, not reconstructed from memory. The
  hash Drizzle stores is computed from the file's exact bytes — any diff breaks the sync.

## Related Issues

- `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md`
  — sibling failure mode of the same three-folder topology, surfaced during a dev-DB reseed. Different root cause (migration absent from boot folder vs hash drift) but same architectural smell.
- `docs/solutions/database-issues/replit-managed-db-vs-neon-postgres-url-2026-05-02.md`
  — deeper coverage of the Helium-vs-Neon split and the `executeSql` / SQL UI gotcha
- `artifacts/api-server/src/migrations/migration-guards.json` — manifest of all migrations
  with `"status": "guarded"` entries for ones that needed runtime TS fixes
- `artifacts/api-server/src/migrations/README.md` — explains the two-layer design and
  the `reference_brands` incident that introduced the runtime guard pattern
- `artifacts/api-server/src/migrations/consolidated-schema.ts` — `bootstrapDrizzleMigrationState()`
  implementation with the cutoff rationale in comments
- `docs/solutions/workflow-issues/drizzle-kit-generate-tui-hang-non-interactive-2026-05-15.md`
  — why `drizzle-kit generate` hangs in non-interactive terminals (Replit, CI) when schema drift
  requires disambiguation; manual SQL + journal update is the correct path in those environments
