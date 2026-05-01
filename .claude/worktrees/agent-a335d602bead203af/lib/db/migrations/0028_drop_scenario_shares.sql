-- 0028_drop_scenario_shares.sql
--
-- Task #871: Fully merge scenario_shares into scenario_access.
--
-- 1. Back-fill scenario_access from any orphan scenario_shares rows that
--    target a user and have no corresponding scenario_access "specific" row.
--    Uses ON CONFLICT DO NOTHING so this step is idempotent and safe to
--    re-run on a DB where 0027 already synced the two tables.
--
-- 2. Drop the scenario_shares table. Indexes defined on the table are
--    dropped automatically by PostgreSQL when the table is dropped.
--
-- The scenario_access UNIQUE constraint is:
--   (scenario_id, owner_id, grantee_id, grant_type)
-- Non-user targets (group, company) have no equivalent row in
-- scenario_access and are simply discarded here.

-- ── 1. Back-fill any remaining orphan scenario_shares rows ───────────────────

INSERT INTO scenario_access (scenario_id, owner_id, grantee_id, grant_type)
SELECT
  ss.scenario_id,
  s.user_id    AS owner_id,
  ss.target_id AS grantee_id,
  'specific'   AS grant_type
FROM scenario_shares ss
JOIN scenarios s ON s.id = ss.scenario_id
WHERE ss.target_type = 'user'
ON CONFLICT (scenario_id, owner_id, grantee_id, grant_type) DO NOTHING;
--> statement-breakpoint

-- ── 2. Drop the scenario_shares table ────────────────────────────────────────

DROP TABLE IF EXISTS "scenario_shares";
