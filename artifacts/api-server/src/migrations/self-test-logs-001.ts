/**
 * self-test-logs-001 — Corrective guard for migration 0058_self_test_logs.sql.
 *
 * Task #1647 / Task #1403.
 *
 * ## Why this guard exists
 *
 * The original 0058 SQL had a type mismatch: `finding_id` was typed as
 * `integer REFERENCES costantino_findings("id")`, but the actual PK is
 * `finding_id uuid`. Because the SQL was never valid against the live schema,
 * it was never applied to any environment — its hash was absent from
 * `drizzle.__drizzle_migrations` on every DB. The SQL file was corrected
 * (uuid FK, correct column reference) and this guard provides three layers
 * of defence so every environment ends up in the correct state regardless of
 * which migration path was taken:
 *
 *   1. Apply the correct DDL idempotently (IF NOT EXISTS + DO-block type repair)
 *   2. Sync `drizzle.__drizzle_migrations` with the corrected SQL's hash so
 *      Drizzle's migrate() never tries to re-run 0058 (visible in code, runbook-compliant)
 *   3. Repair finding_id type if a partially-applied old-shape table already exists
 *
 * This guard runs once per environment (gated by isMigrationApplied/markMigrationApplied).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const TAG = "[migration] self-test-logs-001";
const MIGRATION_SLUG = "0058_self_test_logs";

export async function runSelfTestLogs001(): Promise<void> {
  // 1. Add per-entity self-test interval override to admin_resources
  await db.execute(sql`
    ALTER TABLE admin_resources
      ADD COLUMN IF NOT EXISTS self_test_interval_days integer
  `);
  logger.info(`${TAG} self_test_interval_days column ensured on admin_resources`);

  // 2. Create self_test_logs with correct uuid FK to costantino_findings.finding_id
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS self_test_logs (
      id                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      entity_kind           text        NOT NULL,
      entity_id             text        NOT NULL,
      entity_name           text        NOT NULL,
      admin_resource_id     integer     REFERENCES admin_resources(id) ON DELETE SET NULL,
      outcome               text        NOT NULL CHECK (outcome IN ('pass', 'warn', 'fail')),
      duration_ms           integer,
      probe_recipe_snapshot jsonb,
      raw_response          jsonb,
      summary               text,
      finding_id            uuid        REFERENCES costantino_findings(finding_id) ON DELETE SET NULL,
      ran_at                timestamptz NOT NULL DEFAULT now()
    )
  `);

  // 3. Repair finding_id if it was created with the wrong type (integer instead of uuid).
  //    This handles environments that partially applied the original broken 0058 SQL.
  //    Strategy: if finding_id exists and is NOT of type uuid, drop the column (losing
  //    no referential data since the FK was broken anyway) then re-add it correctly.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'self_test_logs'
          AND column_name  = 'finding_id'
          AND data_type   != 'uuid'
      ) THEN
        ALTER TABLE self_test_logs DROP COLUMN finding_id;
        ALTER TABLE self_test_logs
          ADD COLUMN finding_id uuid
          REFERENCES costantino_findings(finding_id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  // 4. Indexes (IF NOT EXISTS — safe to re-run)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS self_test_logs_entity_idx ON self_test_logs (entity_kind, entity_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS self_test_logs_outcome_idx ON self_test_logs (outcome)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS self_test_logs_ran_at_idx ON self_test_logs (ran_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS self_test_logs_admin_resource_idx ON self_test_logs (admin_resource_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS self_test_logs_finding_idx ON self_test_logs (finding_id)`);

  logger.info(`${TAG} self_test_logs table and indexes ensured`);

  // 5. Sync drizzle.__drizzle_migrations for 0058_self_test_logs.
  //
  //    This is the runbook-prescribed journal reconciliation step: compute the SHA-256
  //    of the corrected SQL file and INSERT WHERE NOT EXISTS into __drizzle_migrations,
  //    so Drizzle's migrate() never attempts to re-apply 0058 on any future boot.
  //
  //    Why this is safe to do here (i.e., after the SQL file was corrected in place):
  //    0058 was NEVER applied to any environment — its hash was absent from
  //    __drizzle_migrations everywhere — so the mutation risk is zero.
  //    Fresh environments: migrate() runs the corrected SQL and inserts the hash first;
  //    this INSERT becomes a no-op. Existing environments: we insert the hash here so
  //    migrate() skips 0058 on the next boot.
  try {
    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const sqlFilePath = path.join(migrationsDir, `${MIGRATION_SLUG}.sql`);
    const sqlContent = fs.readFileSync(sqlFilePath, "utf-8");
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

    const journalPath = path.join(migrationsDir, "meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entry = journal.entries.find(
      (e: { tag: string; when: number }) => e.tag.includes(MIGRATION_SLUG)
    );
    const when = entry?.when ?? Date.now();

    await db.execute(sql`
      INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
      SELECT ${hash}, ${when}
      WHERE NOT EXISTS (
        SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = ${hash}
      )
    `);
    logger.info(`${TAG} drizzle.__drizzle_migrations synced for ${MIGRATION_SLUG} (hash: ${hash.slice(0, 12)}…)`);
  } catch (err) {
    // Non-fatal: the DDL is already applied. Log and continue.
    logger.warn(`${TAG} could not sync drizzle.__drizzle_migrations (non-fatal): ${err}`);
  }
}
