// One-shot: apply migration 0030 (waterfall schema columns) directly.
// Run: node lib/db/script/apply-0030.mjs
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
  WHERE table_name = 'properties'
    AND column_name IN ('lp_equity_pct', 'catch_up_rate', 'catch_up_to_gp_pct', 'waterfall_tiers')
`);

if (rows.length === 4) {
  console.log("✓ waterfall columns already exist — nothing to do");
} else {
  await client.query(`
    ALTER TABLE "properties"
      ADD COLUMN IF NOT EXISTS "lp_equity_pct" real,
      ADD COLUMN IF NOT EXISTS "catch_up_rate" real,
      ADD COLUMN IF NOT EXISTS "catch_up_to_gp_pct" real,
      ADD COLUMN IF NOT EXISTS "waterfall_tiers" jsonb
  `);
  console.log("✓ waterfall columns added (lp_equity_pct, catch_up_rate, catch_up_to_gp_pct, waterfall_tiers)");
}

await client.end();
