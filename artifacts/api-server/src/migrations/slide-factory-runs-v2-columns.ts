/**
 * slide-factory-runs-v2-columns — Factory v2 schema extension (U3).
 *
 * Belt-and-suspenders runtime guard paired with `0050_factory_v2_runs_columns.sql`.
 * Re-applies the same DDL on every boot using IF NOT EXISTS / DROP CONSTRAINT
 * IF EXISTS so dev DBs and pre-existing legacy DBs heal without operator action.
 *
 * Per `docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md`,
 * any migration that touches `slide_factory_runs` ships a runtime guard — the
 * Drizzle journal-state drift surfaced on this exact table on 2026-05-07.
 *
 * What this guard applies (idempotent):
 *   1. ADD COLUMN IF NOT EXISTS slide4_property_id  integer  (FK properties, SET NULL on delete)
 *   2. ADD COLUMN IF NOT EXISTS wish_list_log       jsonb    NOT NULL DEFAULT '[]'::jsonb
 *   3. ADD COLUMN IF NOT EXISTS pptx_r2_key         text     (nullable)
 *   4. DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT for the slide4 FK (re-runnable)
 *   5. DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT for the status CHECK
 *      (widens the allowed set to include 'substituting', 'converting_pdf',
 *      and heals pre-existing drift by including 'rebuilding')
 *
 * Note on slide1_property_id: the column is intentionally NOT dropped here.
 * Per the two-phase drop pattern, U3 adds new columns while slide1_property_id
 * remains addressable so existing TS read sites keep compiling. A follow-up
 * PR drops the column once Factory v2 U4 (substitution map), U8 (builder
 * rewiring), and U11 (frontend) migrate all reads to slide4_property_id.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "slide-factory-runs-v2-columns";

export async function runSlideFactoryRunsV2Columns(): Promise<void> {
  try {
    // Column additions — each independently idempotent via IF NOT EXISTS.
    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        ADD COLUMN IF NOT EXISTS "slide4_property_id" integer
    `);

    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        ADD COLUMN IF NOT EXISTS "wish_list_log" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        ADD COLUMN IF NOT EXISTS "pptx_r2_key" text
    `);

    // FK on slide4_property_id — DROP + ADD makes the pair re-runnable.
    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        DROP CONSTRAINT IF EXISTS "slide_factory_runs_slide4_property_id_properties_id_fk"
    `);
    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        ADD CONSTRAINT "slide_factory_runs_slide4_property_id_properties_id_fk"
        FOREIGN KEY ("slide4_property_id") REFERENCES "properties"("id") ON DELETE set null ON UPDATE no action
    `);

    // Status CHECK — extends the allowed set with the two new Factory v2
    // phases ('substituting', 'converting_pdf') and heals pre-existing drift
    // by including 'rebuilding' (referenced in TS but absent from the DB CHECK
    // when 0041_slide_factory_runs.sql shipped).
    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        DROP CONSTRAINT IF EXISTS "slide_factory_runs_status_check"
    `);
    await db.execute(sql`
      ALTER TABLE "slide_factory_runs"
        ADD CONSTRAINT "slide_factory_runs_status_check"
        CHECK (status IN (
          'new', 'brief_ready', 'ingesting', 'ingested',
          'drafting', 'draft_review', 'building',
          'substituting', 'converting_pdf',
          'complete', 'rebuilding', 'error'
        ))
    `);

    logger.info(
      `[${TAG}] slide_factory_runs Factory v2 columns + status CHECK applied (idempotent)`,
    );
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
