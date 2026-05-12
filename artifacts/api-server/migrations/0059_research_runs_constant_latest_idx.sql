-- 0059_research_runs_constant_latest_idx
--
-- Task #1437 — Index the batch Constants research-run query so it stays fast
-- as research_runs grows.
--
-- The new ResearchRunsStorage.getLatestSuccessfulRunsForAllConstants() batch
-- method (artifacts/api-server/src/storage/intelligence/research-runs.ts) runs
-- a DISTINCT ON over three JSON metadata fields:
--   metadata->'constant'->>'key'
--   metadata->'constant'->>'country'
--   metadata->'constant'->>'subdivision'
-- ordered by completed_at DESC, with a partial filter of
--   entity_type = 'model-constant' AND status = 'completed'.
--
-- The existing research_runs_entity_status_completed_idx covers
-- (entity_type, status, completed_at) but the JSON path projections and the
-- DISTINCT ON ordering are not covered, so the planner falls back to a Seq
-- Scan + Sort. This index keeps that query O(log n) by matching its sort
-- prefix exactly. EXPLAIN ANALYZE before this migration shows Seq Scan; after,
-- Index Scan + DISTINCT.
--
-- IF NOT EXISTS makes this idempotent on re-run.

CREATE INDEX IF NOT EXISTS "research_runs_constant_latest_idx"
  ON "research_runs" USING btree (
    (("metadata"->'constant'->>'key')),
    (("metadata"->'constant'->>'country')),
    (("metadata"->'constant'->>'subdivision')),
    "completed_at" DESC
  )
  WHERE "entity_type" = 'model-constant' AND "status" = 'completed';
