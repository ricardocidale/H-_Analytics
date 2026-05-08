/**
 * sync-rebecca-history-migration.ts
 *
 * One-off script for Task #1196. Already applied — safe to re-run.
 *
 * The `rebecca_history_open` column was applied to the Neon DB via a
 * direct ALTER TABLE call. A synthetic hash was inserted into
 * `drizzle.__drizzle_migrations` (row id=54) to mark it as applied, but no
 * proper `.sql` migration file existed. This script replaces that synthetic
 * hash with the SHA-256 of the real migration file
 * (`0044_users_rebecca_history_open.sql`), keeping Drizzle's journal in
 * sync with the actual files on disk.
 *
 * Safety contract: the script only updates the row whose id AND current hash
 * both match the values pinned below. It refuses to run if any other row
 * would be affected, preventing accidental corruption if future migrations
 * shift the table's row count.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../../lib/db/migrations/0044_users_rebecca_history_open.sql",
);

const TARGET_ROW_ID = 54;
const EXPECTED_SYNTHETIC_HASH =
  "dfd29e90538e956dc362486d409a3ed3bca31c3b2bc9236c8f3da1ae084456e9";

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
    console.log("Real SHA-256 of migration file:", realHash);

    const { rows } = await client.query<{ id: number; hash: string }>(
      `SELECT id, hash FROM drizzle."__drizzle_migrations" WHERE id = $1`,
      [TARGET_ROW_ID],
    );

    const row = rows[0];

    if (!row) {
      console.error(
        `Row id=${TARGET_ROW_ID} not found in drizzle.__drizzle_migrations.`,
      );
      process.exit(1);
    }

    if (row.hash === realHash) {
      console.log(
        `✓ Row id=${TARGET_ROW_ID} already carries the real hash. Nothing to do.`,
      );
      return;
    }

    if (row.hash !== EXPECTED_SYNTHETIC_HASH) {
      console.error(
        `Unexpected hash on row id=${TARGET_ROW_ID}. ` +
          `Expected synthetic=${EXPECTED_SYNTHETIC_HASH}, ` +
          `found=${row.hash}. Aborting to prevent accidental corruption.`,
      );
      process.exit(1);
    }

    const result = await client.query<{ id: number; hash: string }>(
      `UPDATE drizzle."__drizzle_migrations" SET hash = $1 WHERE id = $2 AND hash = $3 RETURNING id, hash`,
      [realHash, TARGET_ROW_ID, EXPECTED_SYNTHETIC_HASH],
    );

    if (result.rowCount !== 1) {
      console.error(
        "UPDATE matched unexpected row count:", result.rowCount,
        "— check the table manually before re-running.",
      );
      process.exit(1);
    }

    console.log(
      `✓ Updated row id=${result.rows[0].id}: synthetic hash → real hash`,
    );
    console.log(`  New hash: ${result.rows[0].hash}`);
    console.log("✓ Sync complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
