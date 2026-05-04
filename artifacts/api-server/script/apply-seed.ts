import pg from "pg";
import { readFile } from "fs/promises";

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL ?? process.env.DATABASE_URL,
  });

  const sql = await readFile(
    new URL("./seed-production.sql", import.meta.url),
    "utf-8",
  );

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("SUCCESS: seed-production.sql applied");

    // Remove any fee categories whose property no longer exists
    const { rowCount } = await client.query(
      "DELETE FROM property_fee_categories WHERE property_id NOT IN (SELECT id FROM properties)",
    );
    console.log(`Cleaned up ${rowCount} orphaned fee categories`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
