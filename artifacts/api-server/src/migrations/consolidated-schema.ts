import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const TAG = "consolidated-schema";

export async function bootstrapDrizzleMigrationState(): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM drizzle."__drizzle_migrations"`
  );
  const count = (result as unknown as { rows: Array<{ cnt: number }> }).rows[0]?.cnt ?? 0;
  if (count > 0) {
    logger.info(`[${TAG}] Drizzle migration state already bootstrapped (${count} entries)`);
    return;
  }

  const legacyCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'properties'
    ) AS has_base_tables
  `);
  const isLegacyDb = (legacyCheck as unknown as { rows: Array<{ has_base_tables: boolean }> }).rows[0]?.has_base_tables === true;

  if (!isLegacyDb) {
    logger.info(`[${TAG}] Fresh database detected — Drizzle migrate() will run all migrations from scratch`);
    return;
  }

  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  const priorEntries: Array<{ tag: string; when: number }> = journal.entries.filter(
    (e: { tag: string; when: number }) => !e.tag.startsWith("0004")
  );

  for (const entry of priorEntries) {
    const sqlFile = path.join(migrationsDir, `${entry.tag}.sql`);
    const content = fs.readFileSync(sqlFile, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    await db.execute(
      sql`INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${entry.when})`
    );
  }

  logger.info(`[${TAG}] Legacy DB detected — bootstrapped Drizzle migration state with ${priorEntries.length} prior migrations`);
}

export async function runDataFixes(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const check = await db.execute(
    sql`SELECT 1 FROM _applied_migrations WHERE tag = '0004_data_fixes' LIMIT 1`
  );
  if ((check as { rows: Array<Record<string, unknown>> }).rows?.length > 0) {
    logger.info(`[${TAG}] Data fixes already applied, skipping`);
    return;
  }

  try {
    await db.execute(sql`
      UPDATE global_assumptions SET auto_research_refresh_enabled = false
      WHERE auto_research_refresh_enabled = true
    `);

    await db.execute(sql`
      UPDATE design_themes SET is_system = TRUE WHERE id IN (14, 15, 16, 17, 18) AND is_system = FALSE
    `);

    await db.execute(sql`
      INSERT INTO property_photos (property_id, image_url, sort_order, is_hero)
      SELECT p.id, p.image_url, 0, true
      FROM properties p
      WHERE p.image_url IS NOT NULL
        AND p.image_url != ''
        AND NOT EXISTS (
          SELECT 1 FROM property_photos pp WHERE pp.property_id = p.id
        )
    `);

    await db.execute(
      sql`INSERT INTO _applied_migrations (tag) VALUES ('0004_data_fixes') ON CONFLICT (tag) DO NOTHING`
    );
    logger.info(`[${TAG}] Data fixes applied and recorded`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[${TAG}] Data fixes failed: ${msg}`, TAG);
    throw error;
  }
}

export async function isMigrationApplied(migrationTag: string): Promise<boolean> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const result = await db.execute(
    sql`SELECT 1 FROM _applied_migrations WHERE tag = ${migrationTag} LIMIT 1`
  );
  return (result as { rows: Array<Record<string, unknown>> }).rows?.length > 0;
}

export async function markMigrationApplied(migrationTag: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO _applied_migrations (tag) VALUES (${migrationTag}) ON CONFLICT (tag) DO NOTHING`
  );
}
