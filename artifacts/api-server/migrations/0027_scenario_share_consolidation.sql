-- 0026_scenario_share_consolidation.sql
--
-- Three goals in one migration:
--
-- 1. Register the cache_entries table (created by runtime migration
--    cache-entries-001.ts) in the Drizzle migration graph so fresh-DB
--    boots through `drizzle-kit migrate` produce the same schema as
--    production. All DDL uses IF NOT EXISTS so it is a no-op on any DB
--    where the runtime migration already ran.
--
-- 2. Add the 17 indexes that were identified as missing from
--    `shared/schema/*.ts` in the Phase C DB audit
--    (.local/db-audit-phase-c-inventory.md). These indexes already exist
--    in production (created by runtime migrations composite-indexes-001,
--    fk-indexes-002, scenario-system-unique-001, and cache-entries-001).
--    Adding them here via IF NOT EXISTS makes fresh-DB bootstraps
--    consistent with production without any risk of failure on an
--    already-migrated DB.
--
-- 3. Reconcile historical drift between scenario_shares and
--    scenario_access (task #865). The service layer now writes atomically
--    to both tables on every share/revoke operation, but rows inserted
--    before this migration may only exist in one table. This section
--    back-fills each table from the other without deleting anything,
--    preserving all existing access grants and leaving both tables in a
--    consistent, non-lossy state:
--
--    a) INSERT scenario_access from scenario_shares (forward direction)
--    b) INSERT scenario_shares from scenario_access (reverse direction)
--    Both inserts use ON CONFLICT DO NOTHING and are idempotent.
--
-- All DDL statements use IF NOT EXISTS and the DML reconciliation uses
-- INSERT … ON CONFLICT DO NOTHING, so the migration is idempotent and
-- safe to re-apply.

-- ── 1. cache_entries table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cache_entries" (
  "cache_key"  text        PRIMARY KEY,
  "value"      jsonb       NOT NULL,
  "expires_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Partial index: only index rows that actually expire (saves space + keeps
-- the cleanup query fast without touching non-expiring rows).
CREATE INDEX IF NOT EXISTS "cache_entries_expires_idx"
  ON "cache_entries" ("expires_at")
  WHERE "expires_at" IS NOT NULL;
--> statement-breakpoint

-- ── 2. Composite query-pattern indexes ────────────────────────────────────

-- market_research: grouped by type + sorted by updatedAt
CREATE INDEX IF NOT EXISTS "market_research_type_updated_idx"
  ON "market_research" ("type", "updated_at");
--> statement-breakpoint

-- scenarios: filtered by userId + sorted by updatedAt (list page sort)
CREATE INDEX IF NOT EXISTS "scenarios_user_updated_idx"
  ON "scenarios" ("user_id", "updated_at");
--> statement-breakpoint

-- ── 3. FK covering indexes — pipeline_policies ────────────────────────────
-- ON DELETE SET NULL cascades on admin_resources would seq-scan without these.

CREATE INDEX IF NOT EXISTS "pipeline_policies_analyst_a_model_idx"
  ON "pipeline_policies" ("analyst_a_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_policies_analyst_b_model_idx"
  ON "pipeline_policies" ("analyst_b_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_policies_synthesis_model_idx"
  ON "pipeline_policies" ("synthesis_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_policies_fallback_model_idx"
  ON "pipeline_policies" ("fallback_model_resource_id");
--> statement-breakpoint

-- ── 4. FK covering indexes — specialist_configs ───────────────────────────

CREATE INDEX IF NOT EXISTS "specialist_configs_analyst_a_model_idx"
  ON "specialist_configs" ("analyst_a_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_configs_analyst_b_model_idx"
  ON "specialist_configs" ("analyst_b_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_configs_synthesis_model_idx"
  ON "specialist_configs" ("synthesis_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_configs_fallback_model_idx"
  ON "specialist_configs" ("fallback_model_resource_id");
--> statement-breakpoint

-- ── 5. FK covering indexes — specialist_config_versions ──────────────────

CREATE INDEX IF NOT EXISTS "specialist_config_versions_analyst_a_model_idx"
  ON "specialist_config_versions" ("analyst_a_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_config_versions_analyst_b_model_idx"
  ON "specialist_config_versions" ("analyst_b_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_config_versions_synthesis_model_idx"
  ON "specialist_config_versions" ("synthesis_model_resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_config_versions_fallback_model_idx"
  ON "specialist_config_versions" ("fallback_model_resource_id");
--> statement-breakpoint

-- ── 6. FK covering index — property_dd_items ─────────────────────────────

CREATE INDEX IF NOT EXISTS "property_dd_items_owner_user_id_idx"
  ON "property_dd_items" ("owner_user_id");
--> statement-breakpoint

-- ── 7. Partial unique index — scenarios system kinds ─────────────────────
-- Enforces one `default` and one `autosave` row per user among non-deleted
-- scenarios. The WHERE clause is intentionally written as raw SQL because
-- drizzle-kit's partial-index WHERE generation is not guaranteed to
-- preserve the expression verbatim. The runtime migration
-- scenario-system-unique-001.ts created this index; this statement is the
-- idempotent Drizzle-migration counterpart.

CREATE UNIQUE INDEX IF NOT EXISTS "scenarios_user_kind_unique"
  ON "scenarios" ("user_id", "kind")
  WHERE "kind" IN ('default', 'autosave') AND "deleted_at" IS NULL;
--> statement-breakpoint

-- ── 8. Reconcile historical drift between scenario_shares and scenario_access
--
-- Back-fill: insert a scenario_access row for every scenario_shares row
-- that has target_type = 'user' and no matching scenario_access row.
-- Uses the scenario owner (scenarios.user_id) as the ownerId column.
-- ON CONFLICT DO NOTHING makes this idempotent.
INSERT INTO "scenario_access" ("scenario_id", "owner_id", "grantee_id", "grant_type")
SELECT
  ss."scenario_id",
  s."user_id"   AS "owner_id",
  ss."target_id" AS "grantee_id",
  'specific'    AS "grant_type"
FROM "scenario_shares" ss
JOIN "scenarios" s ON s."id" = ss."scenario_id"
WHERE ss."target_type" = 'user'
  -- NOT EXISTS acts as a pre-filter to skip obvious existing rows efficiently;
  -- ON CONFLICT DO NOTHING below handles any race between the read and insert.
  AND NOT EXISTS (
    SELECT 1
    FROM "scenario_access" sa
    WHERE sa."scenario_id" = ss."scenario_id"
      AND sa."grantee_id"  = ss."target_id"
      AND sa."grant_type"  = 'specific'
  )
ON CONFLICT ("scenario_id", "owner_id", "grantee_id", "grant_type") DO NOTHING;
--> statement-breakpoint

-- Reverse back-fill: insert a scenario_shares row for every scenario_access
-- specific/user grant that has no counterpart in scenario_shares.
-- This preserves legitimate access grants that were written to scenario_access
-- but never mirrored into scenario_shares (reverse drift direction).
-- We use owner_id as granted_by because the owner implicitly granted access.
INSERT INTO "scenario_shares" ("scenario_id", "target_type", "target_id", "granted_by")
SELECT
  sa."scenario_id",
  'user'         AS "target_type",
  sa."grantee_id" AS "target_id",
  sa."owner_id"  AS "granted_by"
FROM "scenario_access" sa
WHERE sa."grant_type" = 'specific'
  AND sa."scenario_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "scenario_shares" ss
    WHERE ss."scenario_id" = sa."scenario_id"
      AND ss."target_id"   = sa."grantee_id"
      AND ss."target_type" = 'user'
  )
ON CONFLICT DO NOTHING;
