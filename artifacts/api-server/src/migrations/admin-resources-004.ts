/**
 * admin-resources-004 — idempotent seed for resource_specialist_connections.
 *
 * Task #496 — Sources tab + admin-editable resource ↔ specialist connections.
 * Seeds the `resource_specialist_connections` join table from the existing
 * catalog-driven `specialist_assignments` so the Sources tab lights up
 * immediately on first load (nothing regresses).
 *
 * The schema for both `specialist_research_quality_snapshots` (Task #500) and
 * `resource_specialist_connections` is owned by Drizzle migrations; this seed
 * only inserts data and is safe to re-run via INSERT … ON CONFLICT DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-004";

export async function runAdminResources004(): Promise<void> {
  // Seed from the catalog-materialized specialist_assignments rows so the
  // Sources tab shows the existing wiring on first load. Skip rows whose
  // resource_id is null (assignments that point at not-yet-created admin
  // resources) and de-dupe via the unique index.
  const seeded = await db.execute(sql`
    INSERT INTO resource_specialist_connections (resource_id, target)
    SELECT DISTINCT sa.resource_id, 'specialist:' || sa.specialist_id
    FROM specialist_assignments sa
    WHERE sa.resource_id IS NOT NULL
    ON CONFLICT (resource_id, target) DO NOTHING
    RETURNING id
  `);
  const seededCount = Array.isArray(seeded.rows) ? seeded.rows.length : 0;

  logger.info(
    `${TAG} resource_specialist_connections ready (seeded ${seededCount} rows from catalog assignments)`,
  );
}
