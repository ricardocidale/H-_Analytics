import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] source-call-logs-001";

export async function runSourceCallLogs001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS source_call_logs (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      source_id integer NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
      service_key text NOT NULL,
      timestamp timestamp DEFAULT now() NOT NULL,
      http_status integer,
      latency_ms integer,
      success boolean NOT NULL,
      error_message text
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_call_logs_source_idx ON source_call_logs (source_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS source_call_logs_ts_idx ON source_call_logs (timestamp)`);

  const cols = [
    { name: "description", ddl: "text" },
    { name: "endpoint", ddl: "text" },
    { name: "api_key_ref", ddl: "text" },
    { name: "rate_limit_per_min", ddl: "integer" },
    { name: "success_rate", ddl: "real" },
    { name: "avg_latency_ms", ddl: "real" },
    { name: "cost_per_call", ddl: "text" },
    { name: "data_provided", ddl: "jsonb DEFAULT '[]'::jsonb" },
  ];
  for (const col of cols) {
    try {
      await db.execute(sql.raw(`ALTER TABLE source_registry ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`));
    } catch {
      // column already exists
    }
  }

  logger.info(`${TAG} Source call logs migration complete`);
}
