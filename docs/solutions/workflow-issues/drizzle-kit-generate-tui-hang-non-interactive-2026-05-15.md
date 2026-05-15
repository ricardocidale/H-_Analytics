---
title: "drizzle-kit generate hangs on interactive TUI in non-interactive terminals"
date: 2026-05-15
category: workflow-issues
module: drizzle-migrations
problem_type: workflow_issue
component: database
severity: medium
applies_when:
  - Running drizzle-kit generate in a non-interactive terminal (Replit, CI, subprocess)
  - Adding a new schema table alongside a column change, triggering the rename-detection TUI
  - Stdin-piping workarounds attempted (echo, printf, Python subprocess.communicate)
symptoms:
  - drizzle-kit generate hangs indefinitely without output
  - Interactive TUI prompt appears asking whether a new table was created or renamed
  - Stdin piping does not advance the prompt
root_cause: missing_tooling
resolution_type: workflow_improvement
related_components:
  - lib/db/migrations/
  - artifacts/api-server/migrations/
  - lib/db/migrations/meta/_journal.json
tags:
  - drizzle-kit
  - migration
  - non-interactive
  - tui
  - replit
  - monorepo
  - manual-migration
  - schema-drift
---

# drizzle-kit generate hangs on interactive TUI in non-interactive terminals

## Context

When running `pnpm --filter @workspace/db run generate` (drizzle-kit v0.31+) in non-interactive
environments — Replit workspace, CI pipelines, or any shell without a proper TTY — the command
can hang indefinitely if drizzle-kit detects schema drift that requires disambiguation.

This occurred when adding a `pdf_r2_key` column to `slide_factory_runs`. The schema change was
trivial, but drizzle-kit also detected `property_descriptor_catalog` as a table not in its local
snapshot (the table exists in the DB but the snapshot hadn't caught up) and launched an
interactive TUI prompt:

```
Is property_descriptor_catalog table created or renamed from another table?
❯ + property_descriptor_catalog    create table
  ~ user_page_visits › property_descriptor_catalog    rename table
```

The TUI is built on Inquirer.js/clack, which reads directly from `/dev/tty`, not stdin. No amount
of piping, redirection, or subprocess tricks will feed it input — the process simply blocks until
a human presses a key. (session history)

## Guidance

When `drizzle-kit generate` hangs in a non-interactive environment, **skip it entirely and write
the migration SQL manually**. This is not a workaround — for H+ Analytics the manual path is
already correct because the repo's two-folder topology requires manual mirroring regardless.

**Step 1 — Write the SQL migration in both folders**

`lib/db/migrations/<next-slot>_<description>.sql`:
```sql
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pdf_r2_key" text;
```

Mirror with identical content to `artifacts/api-server/migrations/<next-slot>_<description>.sql`.
Slot numbers in the two folders are not synchronized — check the highest existing slot in each
folder independently and increment from there.

Always use `IF NOT EXISTS` — this makes the migration idempotent and matches the convention in
all existing migrations.

**Step 2 — Add a journal entry to `lib/db/migrations/meta/_journal.json`**

```json
{
  "idx": 62,
  "version": "7",
  "when": 1779321600000,
  "tag": "0062_slide_factory_runs_pdf_r2_key",
  "breakpoints": true
}
```

Append to the `entries` array. The `when` value is a Unix timestamp in milliseconds (use the
current epoch). The `idx` must equal the numeric prefix of the SQL filename in
`lib/db/migrations/`.

**Step 3 — Continue with application code changes as normal**

Update storage layer types, route handlers, and test fixtures as usual. The migration toolchain
(`pnpm run typecheck`, magic-numbers gate, schema-drift check) works identically after manual
migration creation. (session history)

**What NOT to try:**
```bash
echo "0" | pnpm --filter @workspace/db run generate       # hangs — TTY, not stdin
printf "1\n" | pnpm --filter @workspace/db run generate   # hangs — same reason
yes | pnpm --filter @workspace/db run generate             # hangs — same reason
# Python subprocess.communicate() — same result; TTY bypasses stdin entirely
```

## Why This Matters

Drizzle-kit's interactive TUI opens `/dev/tty` directly and never reads from stdin file
descriptor 0. There is no documented flag to disable the interactive prompts for batch/CI use
(as of drizzle-kit v0.31). The only recourse in non-interactive environments is to write the
migration manually.

This is especially relevant for H+ Analytics because the two-folder migration topology
(`lib/db/migrations/` vs `artifacts/api-server/migrations/`) already requires manual mirroring
regardless. Even if drizzle-kit generate succeeded interactively, the developer must copy the
output to the second folder and check for slot-number collisions. Writing both files by hand
avoids the interactive dependency entirely.

The `_journal.json` file is consumed only by Drizzle's introspection tooling (`db push`, future
`generate` runs). The api-server's `migrate()` runner reads SQL files from
`artifacts/api-server/migrations/` directly and does not consult the journal.

## When to Apply

- Any time `drizzle-kit generate` hangs in Replit, CI, or a shell without a controlling TTY
- Any schema change where drizzle-kit detects drift between its local snapshot and the live DB
  (new tables, tables added outside drizzle-kit's awareness, etc.)
- Straightforward additive DDL (`ADD COLUMN`, `ADD INDEX`, `CREATE TABLE`) that doesn't require
  drizzle-kit's rename/merge disambiguation logic
- As a time-saver: for simple additive migrations, writing SQL manually is often faster than
  the interactive `generate` flow even in interactive environments

For complex schema transformations (multi-table renames, data backfills with generated SQL),
resolve snapshot drift first by running `drizzle-kit introspect` or fixing the meta snapshot,
then generate interactively.

## Examples

**Before — all forms hang:**
```bash
pnpm --filter @workspace/db run generate
echo "0" | pnpm --filter @workspace/db run generate
printf "1\n" | pnpm --filter @workspace/db run generate
```

**After — manual migration (works in any environment):**

`lib/db/migrations/0062_slide_factory_runs_pdf_r2_key.sql`:
```sql
-- 0062_slide_factory_runs_pdf_r2_key.sql
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pdf_r2_key" text;
```

`artifacts/api-server/migrations/0068_slide_factory_runs_pdf_r2_key.sql`:
```sql
-- Mirror of lib/db/migrations/0062; non-colliding slot per the drifted topology.
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pdf_r2_key" text;
```

Append to `lib/db/migrations/meta/_journal.json` entries array:
```json
{
  "idx": 62,
  "version": "7",
  "when": 1779321600000,
  "tag": "0062_slide_factory_runs_pdf_r2_key",
  "breakpoints": true
}
```

Slot numbers differ between folders (`0062` vs `0068`) because the two folders have diverged
independently. Always check the highest existing slot in each folder separately before choosing
a new slot number.

## Related

- `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md`
  — covers the downstream symptom (tables missing from Neon despite being journaled); this doc
  covers the upstream cause (why generate hangs and why manual is the correct path in Replit)
- `docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md`
  — documents the two-folder topology that makes manual mirroring mandatory regardless
- `docs/solutions/conventions/drizzle-two-phase-column-drop-runbook-2026-05-13.md`
  — Phase 2 of the column-drop runbook instructs `generate`; in non-interactive environments,
  use the manual approach documented here instead
- `docs/runbooks/schema-migrations.md` — full migration topology reference (three-folder
  topology, journal mechanics, runtime guards)
