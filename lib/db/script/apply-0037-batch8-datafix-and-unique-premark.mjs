// Phase C batch 8 — pre-mark 0037_batch8_datafix_and_unique in drizzle.__drizzle_migrations.
//
// Migrations consolidated: db_hygiene_001, fix_shared_ownership,
// role_partner_to_user_001, role_checker_investor_to_user_001,
// property_notnull_001, app_logo_001, admin_resources_004 (DDL part),
// assumption_guidance_dedupe_001, benchmark_snapshots_unique_001,
// audit_unique_constraints_001, financials_computed_at_backfill_001.
//
// All were already applied to the live Neon DB via their original runtime gates.
// This script inserts the migration hash so Drizzle's migrate() treats the
// file as already applied on existing DBs.
//
// Run: node lib/db/script/apply-0037-batch8-datafix-and-unique-premark.mjs
import pg from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL or POSTGRES_URL set");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "../migrations/0037_batch8_datafix_and_unique.sql");
const content = fs.readFileSync(sqlPath, "utf-8");
const hash = crypto.createHash("sha256").update(content).digest("hex");

console.log(`Migration hash: ${hash}`);

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
await client.query(`
  CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at BIGINT
  )
`);

const { rows } = await client.query(
  `SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = $1`,
  [hash],
);

if (rows.length > 0) {
  console.log("✓ 0037_batch8_datafix_and_unique already marked in drizzle.__drizzle_migrations — nothing to do");
} else {
  await client.query(
    `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
    [hash, Date.now()],
  );
  console.log("✓ 0037_batch8_datafix_and_unique pre-marked in drizzle.__drizzle_migrations");
}

await client.end();
