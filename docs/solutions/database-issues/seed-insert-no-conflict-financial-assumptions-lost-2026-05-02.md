---
title: "Seed plain INSERT loses financial assumptions on non-empty DB"
date: 2026-05-02
category: database-issues
module: seeds/property-data
problem_type: database_issue
component: database
severity: high
symptoms:
  - Financial computations (ADR, cap rates, occupancy projections) use wrong default values in production
  - "seedProperties() silently no-ops when property rows already exist in the Neon DB"
  - Hand-tuned values in property-data.ts are never applied to the live database
root_cause: incomplete_setup
resolution_type: migration
related_components:
  - development_workflow
tags:
  - drizzle-orm
  - upsert
  - seed-data
  - neon-postgres
  - boot-migration
  - replit
  - financial-assumptions
  - on-conflict
  - psql
---

# Seed plain INSERT loses financial assumptions on non-empty DB

## Problem

The per-property financial assumptions (ADR, occupancy, cost rates, exit cap rates) are hand-tuned in `src/seeds/property-data.ts`, but `seedProperties()` uses a plain `db.insert(properties).values(SEED_INITIAL_PROPERTIES)` — no ON CONFLICT handling. When Replit's Neon DB already had property rows from a prior cold-start, the insert silently no-oped and the live rows kept default values. All financial projections in production were computed with wrong numbers.

## Symptoms

- Financial computations (ADR, cap rates, occupancy projections) show wrong default values in production despite being overridden in `property-data.ts`
- `seedProperties()` runs without error but property rows in the Neon DB are unchanged
- Optimized assumptions visible in code but invisible in the app's financial output

## What Didn't Work

- **Replit's built-in database SQL UI** — only connects to Replit's internal managed Postgres, not to the external Neon DB pointed to by `POSTGRES_URL`. Cannot be used to run UPDATE statements against Neon.
- **Patching `seedProperties()` with `.onConflictDoUpdate()`** — considered but avoided: would change cold-start behavior for all environments and conflate first-time seeding with ongoing data patching. Separate concerns belong in separate files.

## Solution

Three steps, applied in order:

### Step 1 — Write an idempotent UPDATE migration

Create `src/migrations/sync-property-assumptions-001.ts`. Iterate all canonical properties and run `UPDATE ... WHERE name = ?` for each. Zero rows updated is safe — the property doesn't exist yet and will get the correct values when first inserted.

```typescript
// src/migrations/sync-property-assumptions-001.ts
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

interface PropertyAssumptions {
  name: string;
  startAdr: number;
  exitCapRate: number;
  // ... all other financial fields
}

const PROPERTY_ASSUMPTIONS: PropertyAssumptions[] = [
  { name: "Jano Grande Ranch", startAdr: 250, exitCapRate: 0.10, /* ... */ },
  { name: "Loch Sheldrake",    startAdr: 280, exitCapRate: 0.09, /* ... */ },
  // 10 more properties including Medellin Duplex
];

export async function runSyncPropertyAssumptions001(): Promise<void> {
  for (const p of PROPERTY_ASSUMPTIONS) {
    const result = await db.execute(sql`
      UPDATE properties SET
        start_adr       = ${p.startAdr},
        exit_cap_rate   = ${p.exitCapRate},
        cost_rate_rooms = ${p.costRateRooms}
        -- all financial columns
      WHERE name = ${p.name}
    `);
    const rows = (result as { rowCount?: number }).rowCount ?? 0;
    if (rows > 0) logger.info(`updated "${p.name}"`, "migrations");
    // rows === 0 means property not yet seeded — skip safely
  }
}
```

**Special case — Medellin Duplex** uses the `vrbo_owner_managed` business model. Its cost structure differs from all standard properties: `costRateRooms=0.06` (vs 0.20), all F&B/events/other cost lines set to `0`, `platformFeeRate=0.14`, `baseManagementFeeRate=0.10`. These must be set explicitly — leaving them at schema defaults produces incorrect unit economics.

### Step 2 — Wire as a one-shot boot gate

```typescript
// src/index.ts — inside runMigrations(), after the last existing gate
if (!(await isMigrationApplied("sync_property_assumptions_001"))) {
  const { runSyncPropertyAssumptions001 } = await import(
    "./migrations/sync-property-assumptions-001"
  );
  await runSyncPropertyAssumptions001();
  await markMigrationApplied("sync_property_assumptions_001");
}
```

The `_applied_migrations` gate ensures this runs exactly once per environment and never re-applies.

### Step 3 — Apply immediately without a deploy cycle

`POSTGRES_URL` is already set in Replit's shell environment and points to the external Neon connection string. `psql` is available:

```bash
# Verify connection works
psql "$POSTGRES_URL" -c "SELECT name, start_adr, exit_cap_rate FROM properties LIMIT 5;"

# Apply all UPDATEs
psql "$POSTGRES_URL" <<'SQL'
UPDATE properties SET start_adr=250, exit_cap_rate=0.10, ...
  WHERE name='Jano Grande Ranch';
-- repeat for all 12 properties
SQL
```

Check output: `UPDATE 1` means the row was found and updated. `UPDATE 0` means the property isn't in this DB yet — it will pick up correct values when first seeded. (session history)

## Why This Works

Drizzle ORM's `db.insert(...).values(...)` maps directly to `INSERT INTO ... VALUES ...` with no conflict clause. When the target table already has a row matching a unique constraint (the property name or primary key), Postgres raises a unique-violation error. Drizzle either propagates that error (where it gets caught by a surrounding try/catch) or, if using `.onConflictDoNothing()`, silently skips the row. Either way the existing row is never touched.

The UPDATE-based migration sidesteps this entirely: `UPDATE ... WHERE name = ?` is unconditionally idempotent. If the row exists it's updated; if it doesn't exist nothing happens. Wiring it as a named boot gate means it runs once on first deploy to an environment, then never again. (session history)

## Prevention

- **Seed functions are for first-boot only.** Any post-hoc data patch — assumptions, rates, flags — belongs in a named migration, not a seed. Use the `isMigrationApplied / markMigrationApplied` gate pattern already established in `src/index.ts`.
- **Match by stable natural keys, not by ID.** Numeric IDs diverge across environments. The canonical property `name` is stable and human-auditable; `WHERE name = 'Jano Grande Ranch'` will find the right row in any environment.
- **Test seed idempotency on a non-empty DB.** Add a test that seeds twice: first cold (empty DB), then warm (rows already present). Assert the second run produces `UPDATE 0` without error, not a thrown exception.
- **POSTGRES_URL is your escape hatch.** When Replit's DB UI fails (it only connects to the internal managed Postgres), `psql "$POSTGRES_URL"` reaches the external Neon DB from any Replit shell. Keep this in mind for emergency data corrections.
- **Document the canonical source.** `src/seeds/property-data.ts` is the single source of truth for all property financial assumptions. If assumptions change, update that file *and* create a new migration to propagate the change.

## Related Issues

- `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md` — shares the pattern of Replit injecting or surfacing env vars that silently change runtime behavior; both document Replit-specific environment gotchas.
