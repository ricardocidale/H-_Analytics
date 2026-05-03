import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runSeedDefaults001() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seed_defaults (
      id            integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      entity_type   text NOT NULL,
      entity_key    text NOT NULL,
      field_name    text NOT NULL,
      seed_value    jsonb NOT NULL,
      applied_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_seed_defaults_entity_field UNIQUE (entity_type, entity_key, field_name)
    )
  `);
  // idx_seed_defaults_lookup dropped in migration 0030 (Task #973: unused;
  // the uq_seed_defaults_entity_field unique constraint already provides a
  // btree on (entity_type, entity_key, field_name) that covers prefix lookups).
}
