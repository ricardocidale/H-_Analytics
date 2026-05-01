/**
 * Audit follow-up — Add the `benchmark_snapshots_snapshot_key_unique`
 * UNIQUE constraint declared by Drizzle in
 * `lib/db/src/schema/intelligence-v2.ts`:
 *
 *   snapshotKey: text("snapshot_key").notNull().unique()
 *
 * Without this migration, `npm run db:push` blocks in non-TTY contexts
 * with the prompt:
 *
 *   You're about to add benchmark_snapshots_snapshot_key_unique unique
 *   constraint to the table, which contains N items. … Do you want to
 *   truncate benchmark_snapshots table?
 *
 * which is the same regression class Task #573 (assumption_guidance) and
 * Task #715 (CI gate) were built to prevent. The fix follows the same
 * pattern: dedupe defensively, then add the constraint behind a
 * pg_constraint probe so the migration is idempotent across fresh dev
 * DBs (where `db:push --force` may have already created it) and prod
 * DBs (where it has not).
 *
 * Tie-break: keep the row with the latest `fetched_at`; if two rows
 * share the same `fetched_at`, keep the larger `id` (most recently
 * inserted).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "benchmark-snapshots-unique-001";
const CONSTRAINT_NAME = "benchmark_snapshots_snapshot_key_unique";

export async function runBenchmarkSnapshotsUnique001(): Promise<void> {
  // 1. Dedupe defensively. `snapshot_key` is `text NOT NULL`, so plain
  //    `=` semantics suffice (no NULL-distinct quirk to worry about,
  //    unlike the assumption_guidance case). Tie-break is deterministic
  //    so re-runs converge to the same surviving row set.
  const deleted = await db.execute(sql`
    DELETE FROM benchmark_snapshots a
      USING benchmark_snapshots b
      WHERE a.id <> b.id
        AND a.snapshot_key = b.snapshot_key
        AND (
          a.fetched_at < b.fetched_at
          OR (a.fetched_at = b.fetched_at AND a.id < b.id)
        )
  `);
  const deletedCount = deleted.rowCount ?? 0;
  if (deletedCount > 0) {
    logger.info(`[${TAG}] Removed ${deletedCount} duplicate benchmark_snapshots row(s)`);
  } else {
    logger.info(`[${TAG}] No duplicate benchmark_snapshots rows found`);
  }

  // 2. Add the UNIQUE constraint. Postgres < 16 has no
  //    `ADD CONSTRAINT IF NOT EXISTS`, so probe pg_constraint first.
  const existing = await db.execute(sql`
    SELECT 1
      FROM pg_constraint
      WHERE conname = ${CONSTRAINT_NAME}
        AND conrelid = 'benchmark_snapshots'::regclass
  `);
  if (existing.rows.length > 0) {
    logger.info(`[${TAG}] Constraint ${CONSTRAINT_NAME} already exists, skipping`);
    return;
  }

  await db.execute(sql`
    ALTER TABLE benchmark_snapshots
      ADD CONSTRAINT benchmark_snapshots_snapshot_key_unique
      UNIQUE (snapshot_key)
  `);
  logger.info(`[${TAG}] Added UNIQUE constraint ${CONSTRAINT_NAME}`);
}
