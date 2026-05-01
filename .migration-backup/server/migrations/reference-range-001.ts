import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "reference-range-001";

export async function runReferenceRange001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reference_range (
        id           integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        domain       text    NOT NULL,
        metric_key   text    NOT NULL,
        label        text    NOT NULL,
        country      text    NOT NULL DEFAULT 'GLOBAL',
        subdivision  text,
        market       text,
        segment      text,
        property_type text,
        year         integer NOT NULL,
        effective_from  date,
        effective_until date,
        low          real    NOT NULL,
        mid          real    NOT NULL,
        high         real    NOT NULL,
        unit         text    NOT NULL,
        source_id    integer REFERENCES source_registry(id) ON DELETE SET NULL,
        source_name  text,
        source_url   text,
        methodology  text,
        confidence   text    NOT NULL DEFAULT 'medium',
        details      jsonb,
        last_verified_at timestamp,
        verified_by  text,
        archived_at  timestamp,
        created_at   timestamp NOT NULL DEFAULT now(),
        updated_at   timestamp NOT NULL DEFAULT now(),
        CONSTRAINT reference_range_unique UNIQUE NULLS NOT DISTINCT (
          domain, metric_key, country, subdivision, market, segment, property_type, year
        )
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_range_lookup_idx
        ON reference_range (domain, metric_key, country, year)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_range_jurisdiction_idx
        ON reference_range (country, subdivision, market)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_range_source_idx
        ON reference_range (source_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_range_verified_idx
        ON reference_range (last_verified_at)
    `);

    // Idempotent backfill for environments that were initialized before
    // task #803 added the mandatory `verified_by` provenance column.
    await db.execute(sql`
      ALTER TABLE reference_range ADD COLUMN IF NOT EXISTS verified_by text
    `);

    logger.info("Migration complete", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
