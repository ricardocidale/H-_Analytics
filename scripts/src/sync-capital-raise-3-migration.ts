/**
 * sync-capital-raise-3-migration.ts
 *
 * One-off script for Task #1198. Safe to re-run (idempotent).
 *
 * The `capital_raise_3_amount` and `capital_raise_3_date` columns were applied
 * to the Neon DB via a direct ALTER TABLE call before the corresponding
 * migration file `0043_add_capital_raise_3.sql` was created. No row was ever
 * inserted into `drizzle.__drizzle_migrations` for this migration, so Drizzle
 * would attempt to re-apply it (harmlessly, since it uses IF NOT EXISTS) on
 * the next `migrate()` call.
 *
 * This script inserts a row with the real SHA-256 of the migration file,
 * marking it as already applied — keeping the journal and the DB in sync.
 *
 * Safety contract: the script is a no-op if the hash is already present.
 * It will never overwrite an existing row.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../../lib/db/migrations/0043_add_capital_raise_3.sql",
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
    const realHash = computeHash(MIGRATION_FILE);
    console.log("Real SHA-256 of 0043_add_capital_raise_3.sql:", realHash);

    const existing = await client.query<{ id: number; hash: string }>(
      `SELECT id, hash FROM drizzle."__drizzle_migrations" WHERE hash = $1`,
      [realHash],
    );

    if (existing.rows.length > 0) {
      console.log(
        `✓ Hash already present (row id=${existing.rows[0].id}). Nothing to do.`,
      );
      return;
    }

    const result = await client.query<{ id: number; hash: string }>(
      `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
       VALUES ($1, $2)
       RETURNING id, hash`,
      [realHash, 1746835200000],
    );

    console.log(
      `✓ Inserted row id=${result.rows[0].id} for 0043_add_capital_raise_3`,
    );
    console.log(`  Hash: ${result.rows[0].hash}`);
    console.log("✓ Sync complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
