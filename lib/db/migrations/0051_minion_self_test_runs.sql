-- 0051_minion_self_test_runs
--
-- Task #1396 — Minion self-test history.
-- See artifacts/api-server/migrations/0051_minion_self_test_runs.sql for the
-- canonical migration that runs at boot. This file mirrors it so the lib/db
-- Drizzle journal stays in sync with api-server's journal.
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "minion_self_test_runs" (
  "id"          serial      PRIMARY KEY,
  "minion_id"   text        NOT NULL,
  "status"      text        NOT NULL,
  "duration_ms" integer     NOT NULL DEFAULT 0,
  "message"     text,
  "ran_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "minion_self_test_runs_minion_ran_at_idx"
  ON "minion_self_test_runs" ("minion_id", "ran_at");
