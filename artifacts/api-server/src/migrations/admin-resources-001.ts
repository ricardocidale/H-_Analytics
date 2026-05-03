/**
 * P2 — Resources control plane bootstrap.
 *
 * Idempotent: every CREATE uses IF NOT EXISTS, every DROP uses IF EXISTS.
 * Safe to run repeatedly, safe on existing prod DBs where the tables were
 * created out-of-band.
 *
 * Tables (mirrors lib/db/src/schema/admin-resource.ts Drizzle definitions):
 *   - admin_resources
 *   - admin_resource_versions
 *   - audit_break_glass_overrides
 *   - specialist_assignments
 *
 * Index policy: this migration creates the canonical `_uniq`-named unique
 * indexes that the Drizzle schema (lib/db/src/schema/admin-resource.ts) declares,
 * so fresh DBs are constraint-safe even before `db:push` runs. The DROP IF
 * EXISTS lines clean up legacy duplicate names from earlier revisions of this
 * file (which created the same column tuples under `_idx` / `_unique` aliases
 * — 3 duplicate indexes that re-regressed on April 22 and again on April 25).
 * Any future column tuple that needs uniqueness MUST be expressed via the
 * canonical `_uniq` name in BOTH the Drizzle schema AND this migration; never
 * under a second alias.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-001";

export async function runAdminResources001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_resources (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      kind text NOT NULL,
      slug text NOT NULL,
      display_name text NOT NULL,
      description text,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      secret_ref text,
      version integer NOT NULL DEFAULT 1,
      last_health_status text NOT NULL DEFAULT 'gray',
      last_checked_at timestamp,
      created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // Canonical unique index (mirrors lib/db/src/schema/admin-resource.ts).
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_resources_kind_slug_uniq ON admin_resources (kind, slug)`);
  // Drop legacy duplicate name created by earlier revisions of this file.
  await db.execute(sql`DROP INDEX IF EXISTS admin_resources_kind_slug_idx`);
  // admin_resources_kind_idx dropped in migration 0030 (Task #973: unused).

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_resource_versions (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      resource_id integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
      version integer NOT NULL,
      display_name text NOT NULL,
      description text,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      secret_ref text,
      change_summary text,
      changed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      changed_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // Canonical unique index (mirrors lib/db/src/schema/admin-resource.ts).
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_resource_versions_resource_version_uniq ON admin_resource_versions (resource_id, version)`);
  // Drop legacy duplicate name created by earlier revisions of this file.
  await db.execute(sql`DROP INDEX IF EXISTS admin_resource_versions_unique`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_resource_versions_resource_idx ON admin_resource_versions (resource_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_break_glass_overrides (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      specialist_id text NOT NULL,
      assignment_kind text NOT NULL,
      assignment_slug text NOT NULL,
      assignment_role text,
      override_resource_id integer REFERENCES admin_resources(id) ON DELETE SET NULL,
      reason text NOT NULL,
      expires_at timestamp NOT NULL,
      created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamp NOT NULL DEFAULT now(),
      revoked_at timestamp,
      revoked_by_user_id integer REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS break_glass_specialist_idx ON audit_break_glass_overrides (specialist_id)`);
  // break_glass_expires_idx dropped in migration 0030 (Task #973: unused).

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialist_assignments (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      specialist_id text NOT NULL,
      assignment_kind text NOT NULL,
      assignment_slug text NOT NULL,
      assignment_role text,
      resource_id integer REFERENCES admin_resources(id) ON DELETE SET NULL,
      required boolean NOT NULL DEFAULT true,
      synced_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // Canonical unique index (mirrors lib/db/src/schema/admin-resource.ts EXACTLY —
  // raw columns, no COALESCE; NULL-distinct semantics by design so multiple
  // role-less assignments are allowed).
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS specialist_assignments_uniq
      ON specialist_assignments (specialist_id, assignment_kind, assignment_slug, assignment_role)
  `);
  // Drop legacy duplicate name created by earlier revisions of this file.
  await db.execute(sql`DROP INDEX IF EXISTS specialist_assignments_unique`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS specialist_assignments_specialist_idx ON specialist_assignments (specialist_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS specialist_assignments_resource_idx ON specialist_assignments (resource_id)`);

  logger.info(`${TAG} admin_resources + version + break-glass + specialist_assignments tables ready`);
}
