/**
 * Task #573 — Dedupe `assumption_guidance` rows so the
 * `assumption_guidance_unique` constraint declared in
 * `shared/schema/intelligence-v2.ts` can be applied, unblocking the
 * non-interactive `npm run db:push` flow.
 *
 * Drizzle declares:
 *   unique("assumption_guidance_unique").on(scenarioId, entityType, entityId, assumptionKey)
 *
 * Postgres' default UNIQUE semantics treat NULL as distinct (multiple
 * NULLs in a key are allowed), so the dedupe deliberately mirrors
 * those semantics: rows are only considered duplicates when every key
 * column compares equal under SQL `=` (i.e. NULL = NULL is unknown,
 * so two NULL-scenario rows with the same (entity_type, entity_id,
 * assumption_key) are NOT collapsed — Postgres would accept them
 * under the upcoming constraint anyway).
 *
 * Tie-break: keep the row with the latest `updated_at`; if two rows
 * share the same `updated_at`, keep the larger `id` (= the most
 * recently inserted under our identity column). This matches the
 * "keep the latest `updated_at` per group" requirement in task #573.
 *
 * Idempotent: the DELETE is a self-join that is a no-op on a deduped
 * table, and the ADD CONSTRAINT is guarded by a pg_constraint probe
 * so re-runs are safe on dev DBs that already have the constraint
 * (e.g. fresh ones built via `db:push`).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "assumption-guidance-dedupe-001";
const CONSTRAINT_NAME = "assumption_guidance_unique";

export async function runAssumptionGuidanceDedupe001(): Promise<void> {
  // 1. Dedupe. The self-join's predicate uses `=` for every key column,
  //    so it inherits Postgres' NULL-as-distinct semantics — exactly
  //    what the eventual UNIQUE constraint enforces. Tie-break is
  //    deterministic (updated_at DESC, then id DESC) so re-runs
  //    converge to the same surviving row set.
  const deleted = await db.execute(sql`
    DELETE FROM assumption_guidance a
      USING assumption_guidance b
      WHERE a.id <> b.id
        AND a.scenario_id     = b.scenario_id
        AND a.entity_type     = b.entity_type
        AND a.entity_id       = b.entity_id
        AND a.assumption_key  = b.assumption_key
        AND (
          a.updated_at < b.updated_at
          OR (a.updated_at = b.updated_at AND a.id < b.id)
        )
  `);
  const deletedCount = deleted.rowCount ?? 0;
  if (deletedCount > 0) {
    logger.info(`[${TAG}] Removed ${deletedCount} duplicate assumption_guidance row(s)`);
  } else {
    logger.info(`[${TAG}] No duplicate assumption_guidance rows found`);
  }

  // 2. Add the UNIQUE constraint that Drizzle's `unique(...)` helper
  //    declares. We check pg_constraint explicitly because Postgres
  //    < 16 does not support `ADD CONSTRAINT IF NOT EXISTS` and we
  //    want this migration to be safe on dev DBs that already have
  //    the constraint (e.g. ones bootstrapped via `db:push --force`).
  const existing = await db.execute(sql`
    SELECT 1
      FROM pg_constraint
      WHERE conname = ${CONSTRAINT_NAME}
        AND conrelid = 'assumption_guidance'::regclass
  `);
  if (existing.rows.length > 0) {
    logger.info(`[${TAG}] Constraint ${CONSTRAINT_NAME} already exists, skipping`);
    return;
  }

  await db.execute(sql`
    ALTER TABLE assumption_guidance
      ADD CONSTRAINT assumption_guidance_unique
      UNIQUE (scenario_id, entity_type, entity_id, assumption_key)
  `);
  logger.info(`[${TAG}] Added UNIQUE constraint ${CONSTRAINT_NAME}`);
}
