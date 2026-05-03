import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "scenario-overrides-001";

export async function runScenarioOverrides001(): Promise<void> {
  const tableExists = await db.execute(sql`
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'scenario_property_overrides'
  `);
  if (tableExists.rows.length > 0) {
    logger.info(`[${TAG}] scenario_property_overrides table already exists, skipping`);
  } else {
    await db.execute(sql`
      CREATE TABLE "scenario_property_overrides" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "scenario_id" integer NOT NULL REFERENCES "scenarios"("id") ON DELETE CASCADE,
        "property_name" text NOT NULL,
        "change_type" text NOT NULL DEFAULT 'modified',
        "overrides" jsonb NOT NULL DEFAULT '{}',
        "base_property_snapshot" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX "spo_scenario_id_idx" ON "scenario_property_overrides" ("scenario_id")`);
    await db.execute(sql`CREATE INDEX "spo_property_name_idx" ON "scenario_property_overrides" ("property_name")`);
    await db.execute(sql`CREATE UNIQUE INDEX "spo_scenario_property_unique" ON "scenario_property_overrides" ("scenario_id", "property_name")`);
    logger.info(`[${TAG}] Created scenario_property_overrides table with indexes`);
  }

  const versionExists = await db.execute(sql`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scenarios' AND column_name = 'version'
  `);
  if (versionExists.rows.length > 0) {
    logger.info(`[${TAG}] scenarios.version column already exists, skipping`);
  } else {
    await db.execute(sql`ALTER TABLE "scenarios" ADD COLUMN "version" integer NOT NULL DEFAULT 1`);
    logger.info(`[${TAG}] Added version column to scenarios`);
  }

  const hashExists = await db.execute(sql`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scenarios' AND column_name = 'base_snapshot_hash'
  `);
  if (hashExists.rows.length > 0) {
    logger.info(`[${TAG}] scenarios.base_snapshot_hash column already exists, skipping`);
  } else {
    await db.execute(sql`ALTER TABLE "scenarios" ADD COLUMN "base_snapshot_hash" text`);
    logger.info(`[${TAG}] Added base_snapshot_hash column to scenarios`);
  }

  const propIdExists = await db.execute(sql`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scenario_property_overrides' AND column_name = 'property_id'
  `);
  if (propIdExists.rows.length > 0) {
    logger.info(`[${TAG}] scenario_property_overrides.property_id column already exists, skipping`);
  } else {
    await db.execute(sql`ALTER TABLE "scenario_property_overrides" ADD COLUMN "property_id" integer REFERENCES "properties"("id") ON DELETE SET NULL`);
    await db.execute(sql`CREATE INDEX "spo_scenario_property_id_idx" ON "scenario_property_overrides" ("scenario_id", "property_id")`);
    logger.info(`[${TAG}] Added property_id column with FK and composite index`);
  }

  const ginExists = await db.execute(sql`
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'spo_overrides_gin_idx'
  `);
  if (ginExists.rows.length > 0) {
    logger.info(`[${TAG}] GIN index on overrides already exists, skipping`);
  } else {
    await db.execute(sql`CREATE INDEX "spo_overrides_gin_idx" ON "scenario_property_overrides" USING GIN ("overrides")`);
    logger.info(`[${TAG}] Added GIN index on overrides JSONB column`);
  }
}
