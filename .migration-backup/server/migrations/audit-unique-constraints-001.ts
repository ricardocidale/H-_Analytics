/**
 * Audit follow-up — Add the remaining single-column UNIQUE constraints
 * declared in `shared/schema/**` but never applied to the live DB.
 *
 * Same regression class as Task #573 / #715 / `benchmark-snapshots-unique-001`:
 * Drizzle's schema declares `.unique()` on these columns, but a stale prod
 * DB lacks the constraint, so `npm run db:push` blocks in non-TTY contexts
 * with one truncate prompt per missing constraint.
 *
 * Targets (each verified clean of duplicates at audit time):
 *   - properties.stable_key                   (shared/schema/properties.ts)
 *   - media_assets.filename                   (shared/schema/media-assets.ts)
 *   - source_registry.service_key             (shared/schema/intelligence-v2.ts)
 *   - pipeline_policies.policy_key            (shared/schema/intelligence-v2.ts)
 *   - scheduled_research_workflows.workflow_key (shared/schema/intelligence-v2.ts)
 *   - external_integrations.service_key       (shared/schema/integrations.ts)
 *   - capital_raise_benchmarks.dimension_key  (shared/schema/intelligence.ts)
 *   - exit_multiples.dimension_key            (shared/schema/intelligence.ts)
 *
 * Each constraint is added behind a pg_constraint probe so the migration
 * is idempotent on dev DBs that already have it (created via
 * `db:push --force`) and prod DBs that do not. A defensive dedupe runs
 * first; tie-break is `id DESC` (keep most recently inserted) since none
 * of these tables expose a stable updated_at across all rows.
 */
import { db } from "../db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "audit-unique-constraints-001";

interface Target {
  table: string;
  /** One or more columns covered by the UNIQUE constraint. */
  columns: string[];
  constraintName: string;
}

const TARGETS: Target[] = [
  // Single-column UNIQUE constraints
  { table: "properties", columns: ["stable_key"], constraintName: "properties_stable_key_unique" },
  { table: "media_assets", columns: ["filename"], constraintName: "media_assets_filename_unique" },
  { table: "source_registry", columns: ["service_key"], constraintName: "source_registry_service_key_unique" },
  { table: "pipeline_policies", columns: ["policy_key"], constraintName: "pipeline_policies_policy_key_unique" },
  { table: "scheduled_research_workflows", columns: ["workflow_key"], constraintName: "scheduled_research_workflows_workflow_key_unique" },
  { table: "external_integrations", columns: ["service_key"], constraintName: "external_integrations_service_key_unique" },
  { table: "capital_raise_benchmarks", columns: ["dimension_key"], constraintName: "capital_raise_benchmarks_dimension_key_unique" },
  { table: "exit_multiples", columns: ["dimension_key"], constraintName: "exit_multiples_dimension_key_unique" },
  // Multi-column UNIQUE constraints
  // (shared/schema/intelligence-v2.ts:642, scenarios.ts:85, scenarios.ts:100)
  { table: "hospitality_benchmarks", columns: ["metric_key", "country", "source_year"], constraintName: "hospitality_benchmarks_metric_country_year" },
  { table: "scenario_property_overrides", columns: ["scenario_id", "property_name"], constraintName: "spo_scenario_property_unique" },
  { table: "scenario_shares", columns: ["scenario_id", "target_type", "target_id"], constraintName: "scenario_shares_unique_grant" },
];

async function tableExists(table: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `);
  return r.rows.length > 0;
}

async function constraintExists(table: string, constraintName: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = ${constraintName}
      AND conrelid = (${table}::text)::regclass
  `);
  return r.rows.length > 0;
}

async function addUniqueConstraint(target: Target): Promise<void> {
  const { table, columns, constraintName } = target;

  if (!(await tableExists(table))) {
    logger.info(`[${TAG}] Table ${table} not present, skipping ${constraintName}`);
    return;
  }
  if (await constraintExists(table, constraintName)) {
    logger.info(`[${TAG}] Constraint ${constraintName} already exists, skipping`);
    return;
  }

  const tableId = sql.identifier(table);
  const colIds = columns.map((c) => sql.identifier(c));
  const colsCsv = sql.join(colIds, sql`, `);

  // Defensive dedupe (no-op on already-clean tables). The self-join uses
  // `=` for every key column, so it inherits Postgres' NULL-as-distinct
  // semantics — exactly what UNIQUE enforces. Tie-break: keep the row
  // with the larger id (most recently inserted under
  // generated-always-as-identity).
  const equality = sql.join(
    columns.map((c) => sql`a.${sql.identifier(c)} = b.${sql.identifier(c)}`),
    sql` AND `,
  );
  const dedupe: SQL = sql`
    DELETE FROM ${tableId} a
      USING ${tableId} b
      WHERE a.id < b.id
        AND ${equality}
  `;
  const deleted = await db.execute(dedupe);
  const deletedCount = deleted.rowCount ?? 0;
  if (deletedCount > 0) {
    logger.info(
      `[${TAG}] Removed ${deletedCount} duplicate ${table}(${columns.join(",")}) row(s)`,
    );
  }

  // Constraint names are hard-coded in TARGETS, never user input.
  await db.execute(sql`
    ALTER TABLE ${tableId}
      ADD CONSTRAINT ${sql.identifier(constraintName)}
      UNIQUE (${colsCsv})
  `);
  logger.info(`[${TAG}] Added UNIQUE constraint ${constraintName}`);
}

export async function runAuditUniqueConstraints001(): Promise<void> {
  for (const target of TARGETS) {
    try {
      await addUniqueConstraint(target);
    } catch (err) {
      logger.error(
        `[${TAG}] Failed to add ${target.constraintName} on ${target.table}(${target.columns.join(",")}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
