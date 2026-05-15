-- 0057_self_test_logs
--
-- Task #1403 — Unified self-test cadence (30d default) + Logs rename.
--
-- Creates:
--   self_test_logs        — append-only log of every entity self-test
--                           execution (admin_resources, agents, specialists,
--                           minions, Rebecca). Powers the Self-tests tab in
--                           the renamed Logs page.
--
-- Modifies:
--   admin_resources       — adds self_test_interval_days (integer, nullable,
--                           null = use system default of 30 days)
--
-- Also updates:
--   admin_resources seed  — updates the minion-self-test-cycle-interval-ms
--                           parameter row from 6 h (21600000 ms) to 30 d
--                           (2592000000 ms) to match the new system default.
--
-- IF NOT EXISTS guards make this idempotent on re-run.

-- ── 1. Add per-entity self-test interval to admin_resources ─────────────────

ALTER TABLE "admin_resources"
  ADD COLUMN IF NOT EXISTS "self_test_interval_days" integer;

COMMENT ON COLUMN "admin_resources"."self_test_interval_days" IS
  'Per-entity self-test cadence override in days. NULL = use system default (30 days). '
  'Admin-editable per entity in Knowledge & Resources. Task #1403.';

-- ── 2. Create self_test_logs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "self_test_logs" (
  "id"                       integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "entity_kind"              text NOT NULL,
  "entity_id"                text NOT NULL,
  "entity_name"              text NOT NULL,
  "admin_resource_id"        integer REFERENCES "admin_resources"("id") ON DELETE SET NULL,
  "outcome"                  text NOT NULL CHECK ("outcome" IN ('pass', 'warn', 'fail')),
  "duration_ms"              integer,
  "probe_recipe_snapshot"    jsonb,
  "raw_response"             jsonb,
  "summary"                  text,
  "finding_id"               uuid REFERENCES "costantino_findings"("finding_id") ON DELETE SET NULL,
  "ran_at"                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "self_test_logs_entity_idx"
  ON "self_test_logs" ("entity_kind", "entity_id");

CREATE INDEX IF NOT EXISTS "self_test_logs_outcome_idx"
  ON "self_test_logs" ("outcome");

CREATE INDEX IF NOT EXISTS "self_test_logs_ran_at_idx"
  ON "self_test_logs" ("ran_at");

CREATE INDEX IF NOT EXISTS "self_test_logs_admin_resource_idx"
  ON "self_test_logs" ("admin_resource_id");

CREATE INDEX IF NOT EXISTS "self_test_logs_finding_idx"
  ON "self_test_logs" ("finding_id");

-- ── 3. Update minion-self-test-cycle-interval-ms seed from 6h → 30d ─────────

UPDATE "admin_resources"
SET
  "description" = 'How often the minion-self-test scheduler runs every entry in MINION_SELF_TESTS (Aldo, Carlo, Dino, Enzo) and opens / resolves costantino_findings rows for any deterministic-helper regression. Admin-editable at runtime; the scheduler re-reads this row at the start of every cycle and clamps to [min_ms, max_ms]. Default: 30 days (Task #1403 unified cadence).',
  "config"      = '{"value_ms": 2592000000, "min_ms": 60000, "max_ms": 2592000000, "unit": "ms", "human": "30 days"}'::jsonb,
  "updated_at"  = now()
WHERE "kind" = 'parameter'
  AND "slug" = 'minion-self-test-cycle-interval-ms';
