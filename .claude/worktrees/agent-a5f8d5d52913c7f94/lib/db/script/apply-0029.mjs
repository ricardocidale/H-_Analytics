// One-shot: apply migration 0029 (platform_fee_rate column) directly.
// Run: node lib/db/script/apply-0029.mjs
import pg from "pg";

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL or POSTGRES_URL set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows } = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'properties' AND column_name = 'platform_fee_rate'
`);

if (rows.length > 0) {
  console.log("✓ platform_fee_rate column already exists — nothing to do");
} else {
  await client.query(`ALTER TABLE "properties" ADD COLUMN "platform_fee_rate" real`);
  console.log("✓ platform_fee_rate column added");
}

await client.end();
