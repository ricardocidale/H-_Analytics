-- 0051_minion_self_test_runs
--
-- Task #1396 — Minion self-test history.
--
-- Task #1392 added a fast pass/fail self-test per minion exposed via
--   POST /api/admin/minions/:id/self-test
-- but each click was fire-and-forget. If a minion (e.g. Aldo's pdftotext
-- path) starts flaking intermittently, admins had no way to see the trend —
-- they only ever saw the most recent click.
--
-- `minion_self_test_runs` is an append-only short history: ONE row per
-- self-test invocation, never overwritten. The storage layer trims to the
-- last MINION_SELF_TEST_HISTORY_KEEP rows per minionId from inside the
-- same write that records the run, so the table stays bounded
-- (≈30 rows × ~5 minions ≪ 1k rows total).
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
