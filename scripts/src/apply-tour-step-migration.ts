/**
 * apply-tour-step-migration.ts
 *
 * One-off script for Task #1305. Safe to re-run (idempotent).
 *
 * Applies migration 0048_users_tour_step:
 *   1. Adds `tour_step` (nullable integer) to the `users` table.
 *   2. Inserts the migration hash into `drizzle.__drizzle_migrations`
 *      so Drizzle's journal reflects the schema state on disk.
 *
 * Run with:
 *   POSTGRES_URL=<url> pnpm --filter @workspace/scripts run apply-tour-step-migration
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../../lib/db/migrations/0048_users_tour_step.sql",
);

function computeHash(filePath: string): string {
  const content = readFileSync(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("POSTGRES_URL or DATABASE_URL must be set");
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Step 1: Apply the DDL (idempotent — IF NOT EXISTS)
    console.log("Applying DDL: ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_step ...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_step" integer`);
    console.log("✓ DDL applied (or column already existed).");

    // Step 2: Register the migration hash
    const hash = computeHash(MIGRATION_FILE);
    console.log("Migration SHA-256:", hash);

    const { rows: existing } = await client.query<{ hash: string }>(
      `SELECT hash FROM drizzle."__drizzle_migrations" WHERE hash = $1`,
      [hash],
    );

    if (existing.length > 0) {
      console.log("✓ Migration hash already registered in drizzle.__drizzle_migrations. Nothing to do.");
      return;
    }

    await client.query(
      `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
    console.log("✓ Migration hash registered in drizzle.__drizzle_migrations.");
    console.log("✓ Migration 0048_users_tour_step complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
