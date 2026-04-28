/**
 * Task #811 — Hospitality Due-Diligence Checklist tables.
 *
 * Idempotent: every CREATE uses IF NOT EXISTS.  Mirrors the Drizzle
 * definitions in `shared/schema/property-dd.ts` (tables, indexes, FKs,
 * and CHECK constraints) so a fresh DB has the tables before `db:push`
 * runs and existing environments where the tables were created
 * out-of-band stay safe.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { DD_STATUSES, DD_WORKSTREAMS } from "@shared/dd-template";

const TAG = "[migration] property-dd-001";

// CHECK-constraint helpers — built from the canonical enums so the DB
// rejects any workstream/status the application layer would have
// rejected, keeping DB integrity in sync with the Zod schemas.
const WORKSTREAM_LIST = DD_WORKSTREAMS.map((w) => `'${w}'`).join(", ");
const STATUS_LIST = DD_STATUSES.map((s) => `'${s}'`).join(", ");

export async function runPropertyDd001(): Promise<void> {
  // Canonical DD template — admin-editable mirror of the code template.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dd_template_items (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      key text NOT NULL,
      workstream text NOT NULL,
      label text NOT NULL,
      description text NOT NULL,
      is_stop_gate boolean NOT NULL DEFAULT false,
      default_vendor_type text,
      sort_order integer NOT NULL DEFAULT 0,
      archived boolean NOT NULL DEFAULT false,
      template_version integer NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS dd_template_items_key_uniq ON dd_template_items (key)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS dd_template_items_workstream_idx ON dd_template_items (workstream)`);
  // CHECK: workstream must be in the canonical enum (mirror Drizzle).
  // Wrapped in DO/EXCEPTION so re-runs on a DB that already has the
  // constraint don't fail.
  await db.execute(sql.raw(`
    DO $$ BEGIN
      ALTER TABLE dd_template_items
        ADD CONSTRAINT dd_template_items_workstream_valid
        CHECK (workstream IN (${WORKSTREAM_LIST}));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `));

  // Per-property DD items — one row per (property, template item).  FK to
  // properties so a property delete cascades; FK to users so an owner
  // delete just nulls the assignment.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS property_dd_items (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      property_id integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      template_item_key text NOT NULL,
      workstream text NOT NULL,
      label text NOT NULL,
      is_stop_gate boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,

      status text NOT NULL DEFAULT 'not_started',
      owner_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      owner_name text,
      vendor text,
      due_date text,
      cost_estimate real,
      cost_actual real,
      findings text,
      document_url text,

      seeded_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS property_dd_items_property_key_uniq ON property_dd_items (property_id, template_item_key)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS property_dd_items_property_idx ON property_dd_items (property_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS property_dd_items_workstream_idx ON property_dd_items (workstream)`);
  // CHECK: status must be in the canonical enum (mirror Drizzle).
  await db.execute(sql.raw(`
    DO $$ BEGIN
      ALTER TABLE property_dd_items
        ADD CONSTRAINT property_dd_items_status_valid
        CHECK (status IN (${STATUS_LIST}));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `));

  logger.info(`${TAG} ensured dd_template_items + property_dd_items + indexes + checks`, "migration");
}
