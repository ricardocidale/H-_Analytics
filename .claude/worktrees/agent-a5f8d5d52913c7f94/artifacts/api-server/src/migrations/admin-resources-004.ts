/**
 * admin-resources-004 — combined migration covering two concurrent tasks
 * that both targeted this filename:
 *
 *   • Task #500 — AI Intelligence transparency hub.
 *     Adds `specialist_research_quality_snapshots`: append-only per-Specialist
 *     quality store powering the "Quality & Gaps" surfaces (one row per
 *     (specialistId, computedAt); newest is the authoritative current snapshot).
 *
 *   • Task #496 — Sources tab + admin-editable resource ↔ specialist connections.
 *     Adds `resource_specialist_connections` join table and seeds it from the
 *     existing catalog-driven `specialist_assignments` so the Sources tab
 *     lights up immediately on first load (nothing regresses).
 *
 * Both blocks are non-destructive: CREATE TABLE/INDEX IF NOT EXISTS and
 * idempotent INSERT … ON CONFLICT DO NOTHING. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-004";

export async function runAdminResources004(): Promise<void> {
  // ── Task #500 — specialist_research_quality_snapshots ─────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialist_research_quality_snapshots (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      specialist_id text NOT NULL,
      score integer NOT NULL,
      gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
      signals jsonb NOT NULL DEFAULT '{}'::jsonb,
      computed_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_quality_specialist_idx
      ON specialist_research_quality_snapshots (specialist_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_quality_specialist_time_idx
      ON specialist_research_quality_snapshots (specialist_id, computed_at)
  `);
  logger.info(`${TAG} specialist_research_quality_snapshots ready`);

  // ── Task #496 — resource_specialist_connections ───────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS resource_specialist_connections (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      resource_id integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
      target text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS resource_specialist_connections_uniq
      ON resource_specialist_connections (resource_id, target)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS resource_specialist_connections_target_idx
      ON resource_specialist_connections (target)
  `);

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
