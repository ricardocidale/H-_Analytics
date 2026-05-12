---
title: "Seed pipeline drift — dual Drizzle migration folders and uncalled seedMedellinDuplex"
date: 2026-05-12
category: workflow-issues
module: api-server-seed-pipeline
problem_type: workflow_issue
component: database
severity: high
applies_when:
  - "Running `tsx src/seed.ts --force` against a freshly reset dev DB"
  - "Generating a new Drizzle migration with `pnpm --filter @workspace/db run generate`"
  - "Investigating missing columns or tables on dev DB boot"
  - "Validating that all expected dev-environment properties (7, including Medellin Duplex) are present after seeding"
  - "Onboarding a new dev environment against a fresh Neon DB"
related_components:
  - development_workflow
  - tooling
tags:
  - drizzle-migrations
  - seed-pipeline
  - migration-divergence
  - dev-database
  - medellin-duplex
  - api-server-boot
---

# Seed pipeline drift — dual Drizzle migration folders and uncalled seedMedellinDuplex

## Context

A routine L2-U7 dev-DB reseed (`pnpm --filter @workspace/api-server exec tsx src/seed.ts --force`) failed twice in sequence and produced an incomplete portfolio on success, surfacing two systemic drift issues in the seed/migration pipeline. The verification objective was a portfolio-level engine run (`generatePropertyProForma` → `aggregatePropertyByYear` → `buildIRRVector` → `computeIRR`). The engine pipeline itself was healthy; the seed scaffolding was not.

Two distinct drift symptoms appeared:

1. **Migration folder drift.** Recent schema migrations (`0054_property_descriptor_catalog.sql`, `0055_assumption_guardrails.sql`) were generated only into `lib/db/migrations/`. The api-server's boot-time `migrate()` reads from a different folder — `artifacts/api-server/migrations/` — so the dev DB was missing columns (`descriptors_purchased`, `descriptors_improved` on `properties`) and the entire `assumption_guardrails` table that both the Drizzle schema and seed code already depend on. The api-server folder additionally uses its own `0054_*` and `0055_*` slots for *different* migrations (`0054_property_description_purchased.sql`, `0055_icp_bracket_mix.sql`, `0055_vendor_passthrough_and_markup_factors.sql`), so a naive copy from `lib/db/migrations/` collides and is unsafe.

2. **Seed entry-point mismatch.** `artifacts/api-server/src/seeds/index.ts` imports `seedMedellinDuplex` and `seedMedellinDuplexPhotos` (line 4) and re-exports them (lines 199-200), but the `seed()` entry point only invokes `seedProperties()` (line 49). The 7th canonical dev property (Medellin Duplex) is never seeded via `--force` despite reading as "wired up" in the import list.

End state after working around both: 7/7 properties, 7/7 with positive Y5 NOI, Norfolk AI Group breaks even at Y3 ($466K netIncome), 6/7 properties with levered IRR ≥15%.

## Guidance

### Issue 1 — Missing migrations in `artifacts/api-server/migrations/`

**Failing command:**

```bash
pnpm --filter @workspace/api-server exec tsx src/seed.ts --force
```

**First crash signature:** `SELECT … from "properties" limit $1` fails because the dev DB is missing `descriptors_purchased` and `descriptors_improved` (jsonb columns the Drizzle schema declares).

**Second crash signature (after fixing the columns):** insert into `"assumption_guardrails"` fails — the table does not exist. The seed's rollback-on-failure handler cleanly removes partial inserts.

**Root cause:** the api-server boots migrations from `artifacts/api-server/migrations/` (its own folder, resolved in `artifacts/api-server/src/startup/migrations.ts` via `path.resolve(bundleDir, "../../migrations")`), but new Drizzle migrations are generated into `lib/db/migrations/` per `lib/db/drizzle.config.ts`. `0054_property_descriptor_catalog.sql` and `0055_assumption_guardrails.sql` live only in `lib/db/migrations/` and have never been on the api-server's boot read path.

**Workaround (apply directly against the dev DB until the migration folders are reconciled):**

```sql
-- From lib/db/migrations/0054_property_descriptor_catalog.sql
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "descriptors_purchased" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "descriptors_improved"  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- From lib/db/migrations/0055_assumption_guardrails.sql
CREATE TABLE IF NOT EXISTS "assumption_guardrails" (
  "id"             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assumption_key" text NOT NULL,
  "low"            double precision NOT NULL,
  "high"           double precision NOT NULL,
  "target_low"     double precision,
  "target_high"    double precision,
  "unit"           text NOT NULL,
  "rationale"      text,
  "source"         text,
  "updated_at"     timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "assumption_guardrails_key_uniq"
  ON "assumption_guardrails" ("assumption_key");
```

**Permanent fix (carve out as a separate unit):** reconcile the two migration journals. The slot-number collision past 0052 means simple mirroring is no longer safe — at minimum, every new migration generated by `pnpm --filter @workspace/db run generate` needs to be reviewed for slot conflicts and either renumbered or merged into the api-server folder under a non-colliding tag. Long-term, consolidate to a single migration folder and update `runSchemaMigrations` to read from it.

### Issue 2 — Medellin Duplex never seeds via `--force`

**Symptom:** seed succeeds with 6 properties; the dev portfolio is expected to have 7. The L2-U7 plan describes "6 properties" but the runtime expectation (and the user-facing dev environment) is 7.

**Root cause:** `artifacts/api-server/src/seeds/index.ts` lines 4 and 199-200 import and re-export `seedMedellinDuplex` / `seedMedellinDuplexPhotos`, but the `seed()` body only calls `seedProperties()` (line 49) — never the Medellin variant. The import + re-export reads as "wired up" but is not invoked.

**Workaround (one-off, until `seed()` is patched):**

```bash
pnpm --filter @workspace/api-server exec tsx -e "
import { seedMedellinDuplex, seedMedellinDuplexPhotos } from './src/seeds/properties';
await seedMedellinDuplex();
await seedMedellinDuplexPhotos();
"
```

**Permanent fix (carve out as a separate unit):** add `await seedMedellinDuplex(); await seedMedellinDuplexPhotos();` inside the `try` block of `seed()` in `artifacts/api-server/src/seeds/index.ts`, immediately after the existing `seedFeeCategories()` call (around line 51). Both helpers are already idempotent — they early-return when the row exists.

## Why This Matters

**Migration folder drift compounds silently.** The Drizzle generator writes to `lib/db/migrations/` by convention, but the api-server's boot-time `migrate()` reads from `artifacts/api-server/migrations/`. Every new schema change generated by `pnpm --filter @workspace/db run generate` is therefore invisible to the running api-server until someone manually mirrors it — and the two folders have already drifted into using the same slot numbers (0054, 0055) for different migrations, so simple copying is no longer safe. Each subsequent migration deepens the mismatch. The failure mode is benign at boot (no crash) but lethal at first query (column not found / table not found), and it always strikes whoever is running the next reseed or onboarding a fresh dev DB — never the person who introduced the migration. This is a classic compounding architectural smell: cheap to fix today, costly later. See `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` for the adjacent failure mode where the same folder relationship surfaces as hash mismatches in `__drizzle_migrations`.

**Seed entry-point mismatches break verification math.** Every portfolio-level verification target ("≥4/6 properties with positive NOI", "company breaks even by Y3") is implicitly indexed against the dev portfolio size. When `--force` produces 6 properties but verification was specified against 7, the threshold ratios and break-even years drift away from what the plan author intended. Worse, the missing seed function is *imported and re-exported* from `index.ts`, which reads as "this is wired up" — only inspection of the `seed()` body reveals it isn't called. Future agents reading the file will assume the portfolio is complete and write verification gates that silently underspecify reality. The very high IRRs (>200%) observed on some properties may also be a downstream signal of seed-data drift worth its own investigation (auto memory [claude]).

## When to Apply

- Any invocation of `pnpm --filter @workspace/api-server exec tsx src/seed.ts --force`.
- Any L2-U7 or portfolio-level verification task (NOI, IRR, break-even targets across the dev portfolio).
- After pulling a branch that touched `lib/db/migrations/` or `lib/db/src/schema/*.ts` — assume the api-server migrations folder is behind.
- Onboarding a new dev environment (fresh Neon DB) where boot migrations need to bring the schema fully current.
- Before declaring any dev-DB-dependent test or engine run green.

## Examples

### Step 1 — Detect the drift before reseeding

Diff the two migration journals to surface any `lib/db` migration not mirrored in `artifacts/api-server`:

```bash
pnpm --filter @workspace/api-server exec tsx -e "
import fs from 'node:fs';
const lib = JSON.parse(fs.readFileSync('lib/db/migrations/meta/_journal.json','utf8')).entries.map(e => e.tag);
const api = JSON.parse(fs.readFileSync('artifacts/api-server/migrations/meta/_journal.json','utf8')).entries.map(e => e.tag);
const missing = lib.filter(t => !api.includes(t));
const extra   = api.filter(t => !lib.includes(t));
console.log('In lib/db but NOT in api-server (will silently NOT run at boot):');
missing.forEach(t => console.log('  -', t));
console.log('\\nIn api-server but NOT in lib/db (api-server-only migrations):');
extra.forEach(t => console.log('  -', t));
"
```

If the "missing" list is non-empty, the next `--force` seed will fail — apply Step 2 first.

### Step 2 — Apply missing schema directly to the dev DB

For each missing migration listed by Step 1, open `lib/db/migrations/<tag>.sql` and execute it against the dev DB. For the two known-missing migrations as of 2026-05-12:

```sql
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "descriptors_purchased" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "descriptors_improved"  jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "assumption_guardrails" (
  "id"             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assumption_key" text NOT NULL,
  "low"            double precision NOT NULL,
  "high"           double precision NOT NULL,
  "target_low"     double precision,
  "target_high"    double precision,
  "unit"           text NOT NULL,
  "rationale"      text,
  "source"         text,
  "updated_at"     timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "assumption_guardrails_key_uniq"
  ON "assumption_guardrails" ("assumption_key");
```

Per `CLAUDE.md` § "Migration system architecture", do NOT use Replit's `executeSql()` against the dev DB — it hits the wrong database. Use either a `curl -b <cookie>` against `/api/auth/dev-login` then an admin SQL route, or a short Node script using `POSTGRES_URL`.

### Step 3 — Run the seed

```bash
pnpm --filter @workspace/api-server exec tsx src/seed.ts --force
```

Expected: 6 Norfolk properties created (Jano Grande Ranch, Loch Sheldrake, Belleayre Mountain, Scott's House, Lakeview Haven Lodge, San Diego), market research seeded, assumption guardrails seeded. No crash.

### Step 4 — Add the 7th property (Medellin Duplex)

**Once PR #130 (`fix/seed-medellin-duplex`) lands, this step is redundant** — the `seed()` function will invoke `seedMedellinDuplex()` and `seedMedellinDuplexPhotos()` automatically and Step 3 produces all 7 properties. Skip ahead to Step 5 to verify.

Before #130 lands, or on any branch that doesn't include the fix, the `seed()` function imports the helpers but doesn't call them, so the duplex never seeds via `--force`. Run the helpers explicitly to add the 7th property:

```bash
pnpm --filter @workspace/api-server exec tsx -e "
import { seedMedellinDuplex, seedMedellinDuplexPhotos } from './src/seeds/properties';
await seedMedellinDuplex();
await seedMedellinDuplexPhotos();
console.log('Medellin Duplex seeded.');
"
```

Both helpers are idempotent (early-return when the row/photos already exist), so running them after the fix has landed is a harmless no-op.

### Step 5 — Verify portfolio shape

```bash
pnpm --filter @workspace/api-server exec tsx -e "
import { db } from './src/db';
import { properties } from '@workspace/db';
const rows = await db.select().from(properties);
console.log('Property count:', rows.length);
rows.forEach(r => console.log('  -', r.id, r.name));
"
```

Expected: 7 rows including `Medellin Duplex`. The engine pipeline can now run against the full dev portfolio.

### Step 6 — Run the standard verification gates

```bash
pnpm run typecheck
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
```

Both must PASS before declaring the reseed unit done (per `CLAUDE.md` § 5 Plan Verification Gate Checklist).

## Related

- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — adjacent failure mode (hash mismatch in `__drizzle_migrations` after `bootstrapDrizzleMigrationState()` pre-marks rows). Different root cause; same two-folder architecture.
- `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md` — already names the Medellin Duplex as a property requiring special-case handling in seed/migration logic.
- `docs/plans/2026-05-05-007-master-priority-plan.md` § L2-U7 — the origin task that triggered this discovery.
- `.local/skills/pnpm-workspace/references/db.md` — canonical schema/migration runbook (does not yet document the dual-folder layout or the seed call-site requirement; refresh candidate).
- `CLAUDE.md` § "Migration system architecture" — describes the two-layer migration system but does not call out the slot-collision risk between `lib/db/migrations/` and `artifacts/api-server/migrations/`.
