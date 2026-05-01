// Phase C batch 9 — pre-mark 0038_batch9_drop_company_fk in drizzle.__drizzle_migrations.
//
// Migration consolidated: drop_company_fk_001
//
// Already applied to the live Neon DB via its original runtime gate.
// This script inserts the migration hash so Drizzle's migrate() treats the
// file as already applied on existing DBs.
//
// Run: node lib/db/script/apply-0038-batch9-drop-company-fk-premark.mjs
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
const sqlPath = path.resolve(__dirname, "../migrations/0038_batch9_drop_company_fk.sql");
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
  console.log("✓ 0038_batch9_drop_company_fk already marked in drizzle.__drizzle_migrations — nothing to do");
} else {
  await client.query(
    `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
    [hash, Date.now()],
  );
  console.log("✓ 0038_batch9_drop_company_fk pre-marked in drizzle.__drizzle_migrations");
}

await client.end();
