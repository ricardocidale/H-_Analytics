# Schema migrations & seeding runbook

The canonical reference for adding a new schema migration, running the dev-DB seed, and recovering from migration-state drift in H+ Analytics. Supersedes the per-developer note that used to live at `.local/skills/pnpm-workspace/references/db.md`.

If you only need the happy path, jump to **[Adding a new migration](#adding-a-new-migration)**. If something went wrong, jump to **[Drift recovery](#drift-recovery)**.

---

## The three-folder topology

There are three folders in play. They are NOT interchangeable. Knowing which is which prevents most foot-guns.

| Folder | Role | When it runs |
|--------|------|--------------|
| `lib/db/migrations/` | Output of `pnpm --filter @workspace/db run generate` per `lib/db/drizzle.config.ts`. Holds Drizzle's auto-generated SQL + journal. | **Never auto-applied at boot.** Treated as the canonical Drizzle-generated source; must be mirrored into the boot folder below before the api-server can see new schema. |
| `artifacts/api-server/migrations/` | What the api-server's `migrate()` actually reads at boot (`runSchemaMigrations` in `artifacts/api-server/src/startup/migrations.ts` resolves it via `path.resolve(bundleDir, "../../migrations")`). | **Once per boot,** by Drizzle's `migrate()` from `drizzle-orm/node-postgres/migrator`. The only folder the running api-server inspects. |
| `artifacts/api-server/src/migrations/*.ts` | Runtime TypeScript "guards" — idempotent `IF NOT EXISTS` DDL re-applied every boot as belt-and-suspenders. | **Every boot,** from `runSchemaMigrations()`. Registered in `migration-guards.json`. |

**Foot-gun:** the two SQL folders have already drifted into using the same slot numbers (e.g., both have a `0054_*` and a `0055_*` with completely different content). Naive `cp lib/db/migrations/* artifacts/api-server/migrations/` will collide and produce broken history. Slot conflicts must be resolved before mirroring.

For the failure modes this topology produces, see:
- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — hash-mismatch failure (journal entry present, `__drizzle_migrations` hash absent → silent skip)
- `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` — folder-divergence failure (migration only exists in `lib/db/migrations/`, never reaches the boot path)

---

## Schema file conventions

Each table goes in its own file under `lib/db/src/schema/`. Re-export from `lib/db/src/schema/index.ts`.

Every model file declares: the Drizzle table, an insert schema (via `drizzle-zod`), and the derived types.

```ts
import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const todosTable = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  completed: text("completed").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTodoSchema = createInsertSchema(todosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTodo = z.infer<typeof insertTodoSchema>;
export type Todo = typeof todosTable.$inferSelect;
```

**Importing the table elsewhere:**

```ts
import { db } from "@workspace/db";
import { todosTable } from "@workspace/db";
```

Frontend code MUST import schema from `@workspace/db/schema` (the subpath export), never from `@workspace/db` directly, to avoid pulling Node-only `pg` into the browser bundle. See `docs/architecture/architecture-notes.md` § "Import discipline".

---

## Adding a new migration

The happy path for adding a column, index, table, or constraint:

### 1. Update the Drizzle schema

Edit the relevant file under `lib/db/src/schema/`. Use existing files for tone (notnull / nullable defaults, timestamptz, foreign keys, etc.).

### 2. Generate the migration

```bash
pnpm --filter @workspace/db run generate
```

This writes a new `NNNN_<descriptive_name>.sql` plus a journal entry into `lib/db/migrations/`. Inspect the SQL — Drizzle gets most of it right but sometimes picks wrong defaults for backfills.

Use idempotent statements wherever possible: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... END $$` blocks for anything conditional. This keeps the migration safe to re-run if someone has to apply it manually during drift recovery.

### 3. Mirror into the boot folder

Copy or hand-author the same migration into `artifacts/api-server/migrations/` with a slot number that does NOT collide with anything already there. Past idx ~0052, slot numbers between the two folders have diverged — check the existing tags before picking a number.

After mirroring, the journal entries should match. Run a quick diff to confirm:

```bash
pnpm --filter @workspace/api-server exec tsx -e "
import fs from 'node:fs';
const lib = JSON.parse(fs.readFileSync('lib/db/migrations/meta/_journal.json','utf8')).entries.map(e => e.tag);
const api = JSON.parse(fs.readFileSync('artifacts/api-server/migrations/meta/_journal.json','utf8')).entries.map(e => e.tag);
console.log('In lib/db but NOT in api-server:'); lib.filter(t => !api.includes(t)).forEach(t => console.log('  -', t));
console.log('In api-server but NOT in lib/db:'); api.filter(t => !lib.includes(t)).forEach(t => console.log('  -', t));
"
```

Both lists should be empty (or contain only entries you understand and accept).

### 4. Register a runtime guard if needed

Decide the runtime status of the new migration and record it in `artifacts/api-server/src/migrations/migration-guards.json`:

| Status | When | What to also do |
|--------|------|-----------------|
| `guarded` | Most new schema migrations | Add a `*.ts` file under `artifacts/api-server/src/migrations/` that re-applies the same DDL with `IF NOT EXISTS` / `IF EXISTS` semantics, and wire it into `runSchemaMigrations()` (or `runSeeds()` for data) via `isMigrationApplied` / `markMigrationApplied`. |
| `self-idempotent` | The `.sql` itself is fully idempotent AND the change is small | Document why in the manifest entry — re-running via `migrate()` is the only safety net. |
| `legacy` | Pre-bootstrap entries (idx 0–3) | Do not add new entries with this status. |
| `waived` | Deliberately no runtime guard needed (e.g. one-off data backfill) | Include a `reason`. |

Run the check:

```bash
pnpm --filter @workspace/scripts run check:migration-guards
```

It fails if a journal entry is missing from the manifest, or if a `guarded` entry points at a runtime file that doesn't exist.

### 5. Push or apply locally

For dev DBs only, you can skip migration files and push the schema directly:

```bash
pnpm --filter @workspace/db run push
# If it fails with column conflicts:
pnpm --filter @workspace/db run push-force
```

`push` is interactive — it prompts for create-vs-rename decisions on new tables and columns. Do NOT use `push` against prod.

For prod and any environment that boots through `runSchemaMigrations()`, the migration files in `artifacts/api-server/migrations/` plus the runtime guards do all the work at boot.

---

## Seeding the dev DB

The dev DB has 7 canonical properties:

| # | Property | Source |
|---|----------|--------|
| 1–6 | Norfolk portfolio (Jano Grande Ranch, Loch Sheldrake, Belleayre Mountain, Scott's House, Lakeview Haven Lodge, San Diego) | `seedProperties()` in `artifacts/api-server/src/seeds/properties.ts` |
| 7 | Medellin Duplex | `seedMedellinDuplex()` + `seedMedellinDuplexPhotos()` in the same file |

The full seed pipeline lives in `artifacts/api-server/src/seeds/index.ts`. Run it with:

```bash
pnpm --filter @workspace/api-server exec tsx src/seed.ts --force
```

`--force` deletes `properties`, `globalAssumptions`, and `marketResearch` before re-seeding. The seed wraps its own rollback handler — if any step fails, partial inserts are cleaned up so re-running `--force` is safe.

Expected end state after a successful seed:
- 7 properties in `properties`
- Norfolk AI Group company-level financials break even at Y3 (`netIncome ≥ 0`)
- At least one property with levered IRR ≥ 15% (typically Scott's House, very high in the current seed)
- The Analyst's seed-time validation may flag some properties — that's expected; it surfaces deliberately-aggressive assumption values

If `seedMedellinDuplex` is not invoked inside the main `seed()` flow, the dev portfolio will have only 6 properties — see `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` for the fix.

---

## Drift recovery

If the dev DB or prod DB has fallen out of sync with the schema files, work through these in order. **Do NOT use Replit's `executeSql()` callback or the Replit SQL UI to inspect Neon** — they target Replit's built-in Helium Postgres, a different database. Use a Node script with `POSTGRES_URL` or `curl -b <cookie>` against `/api/auth/dev-login`.

### Symptom 1: `relation "X" does not exist` on a route or seed

The migration that creates `X` is journaled but never reached the DB. Two sub-cases:

**Sub-case A — migration only exists in `lib/db/migrations/`:** the boot folder never saw it. Either mirror it into `artifacts/api-server/migrations/` (with a non-colliding slot) and let the next boot apply it, or run the SQL manually against the dev DB using a Node + `pg` script. Then re-run the seed.

**Sub-case B — migration exists in `artifacts/api-server/migrations/` but the DB doesn't have the table:** `bootstrapDrizzleMigrationState()` pre-marked the entry as applied without executing the DDL. Apply the SQL manually (copy verbatim from the `.sql` file — hash matters) and then sync `drizzle.__drizzle_migrations`. The full recipe is in `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md`.

### Symptom 2: dev seed fails with `column "X" does not exist`

The Drizzle schema declares column `X`, but the dev DB doesn't have it. Almost always means `lib/db/migrations/` has a recent migration that adds `X` and you haven't mirrored it. Apply the column manually:

```sql
ALTER TABLE "<table>" ADD COLUMN IF NOT EXISTS "<column>" <type> <constraints>;
```

Then re-run the seed.

### Symptom 3: prod has phantom rows for migrations that never ran

Count: `SELECT COUNT(*) FROM drizzle."__drizzle_migrations"` against the journal entry count. If they're equal but you suspect drift, do a hash-level comparison (the script is in the T008 doc cited above).

If `__drizzle_migrations` has fewer rows than the journal, the missing rows are migrations that never marked themselves applied — they will run on next boot. Usually fine.

If the rows exist but the DDL didn't run (bootstrap pre-marked them), you need to apply the DDL manually and the rows are already correct. Do NOT delete and re-insert rows in `__drizzle_migrations` — that's racy. Apply DDL with `IF NOT EXISTS` instead.

---

## Pitfalls

- **Array columns:** call `.array()` as a method on the column type — `text("tags").array()`, not `array(text("tags"))`.
- **`drizzle.config.ts`:** do not edit unless absolutely necessary. The path layout depends on it.
- **Timestamps:** always use `{ withTimezone: true }` so the column comes out as `timestamptz`, not naive `timestamp`.
- **`push` in prod:** never. `push` skips migration files and overwrites whatever it finds. Use it only against dev DBs.
- **`executeSql()` vs `POSTGRES_URL`:** Replit's `executeSql()` targets Helium, the H+ app uses Neon. Always go through `POSTGRES_URL` for any drift-investigation query. See `docs/solutions/database-issues/replit-managed-db-vs-neon-postgres-url-2026-05-02.md`.
- **`ON CONFLICT DO NOTHING` on `__drizzle_migrations`:** the table has no UNIQUE constraint on `hash` — `ON CONFLICT` silently inserts duplicates. Use `WHERE NOT EXISTS` instead. The full recipe is in the T008 doc.
- **Forgetting to mirror to the boot folder:** the api-server boots from `artifacts/api-server/migrations/`, not `lib/db/migrations/`. Until those folders are reconciled, every new migration needs to land in both.

---

## Related references

- `lib/db/drizzle.config.ts` — Drizzle generate output target
- `artifacts/api-server/src/startup/migrations.ts` — `runSchemaMigrations()` orchestrator
- `artifacts/api-server/src/migrations/README.md` — runtime guard pattern (belt-and-suspenders)
- `artifacts/api-server/src/migrations/migration-guards.json` — manifest of all migrations + their runtime status
- `artifacts/api-server/src/migrations/consolidated-schema.ts` — `bootstrapDrizzleMigrationState()` implementation
- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — hash-mismatch failure mode + manual recovery script
- `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` — folder-divergence failure mode + seed call-site bug
- `docs/solutions/database-issues/replit-managed-db-vs-neon-postgres-url-2026-05-02.md` — Helium-vs-Neon split
