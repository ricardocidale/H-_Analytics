import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] rebecca-fixtures-001";

export async function runRebeccaFixtures001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rebecca_preview_fixtures (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name text NOT NULL,
      description text,
      settings jsonb NOT NULL,
      turns jsonb NOT NULL,
      created_by_id integer REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE rebecca_preview_fixtures
        ADD CONSTRAINT rebecca_preview_fixtures_name_uq UNIQUE (name);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_preview_fixtures_created_by_idx
      ON rebecca_preview_fixtures (created_by_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_preview_fixtures_created_at_idx
      ON rebecca_preview_fixtures (created_at)
  `);

  logger.info(`${TAG} Rebecca preview-fixtures migration complete`);
}
