#!/bin/bash
set -e

# Install any new dependencies from the merged branch.
npm install --prefer-offline --no-audit --no-fund 2>/dev/null || npm install

# Apply any pending Drizzle migrations brought in by the merge.
# Drizzle's node-postgres migrator is headless (no TTY required), unlike
# `drizzle-kit push` which prompts on schema renames. We invoke the same
# code path the server uses at startup, so the rules are identical:
# missing migrations are applied, already-applied ones are skipped via
# the drizzle.__drizzle_migrations hash table.
if [ -n "$DATABASE_URL" ]; then
  npx --no-install tsx -e "
    (async () => {
      const { bootstrapDrizzleMigrationState } = await import('./server/migrations/consolidated-schema.ts');
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      const { db } = await import('./server/db.ts');
      await bootstrapDrizzleMigrationState();
      await migrate(db, { migrationsFolder: './migrations' });
      console.log('[post-merge] Drizzle migrations applied.');
    })().catch(err => { console.error('[post-merge] migration failed:', err.message); process.exit(1); });
  "
fi
