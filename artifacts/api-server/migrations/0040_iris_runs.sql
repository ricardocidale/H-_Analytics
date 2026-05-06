-- 0040_iris_runs
--
-- Creates the iris_runs table for the Iris backstage agent (U4).
--
-- One row per Iris agent execution. Inserted with status "running" when a
-- run is triggered and updated to "completed" or "error" when the agent
-- finishes. The Admin → Iris panel reads the latest row to surface
-- last-run health and metrics.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS iris_runs (
  id SERIAL PRIMARY KEY,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  model_used TEXT,
  chunks_indexed INTEGER NOT NULL DEFAULT 0,
  errors_encountered INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  health_summary JSONB
);
